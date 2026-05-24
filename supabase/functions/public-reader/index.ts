// Supabase Edge Function: public-reader
// Token-gated public access to a book + reader annotations.
// All requests run in service-role and validate `share_links.token` + active +
// expiry on every action. RLS is bypassed; access is enforced here.
//
// Request body (POST):
//   { action: <string>, ...payload }
//
// Actions:
//   - resolve_link        { token } -> { link, book, parts, chapters }
//   - register_session    { token, reader_local_id, name } -> { session }
//   - get_chapter         { token, reader_local_id, chapter_id }
//                         -> { chapter, my_annotations }
//   - post_annotation     { token, reader_local_id, chapter_id, kind,
//                           selected_text, before_ctx, after_ctx, comment_body? }
//                         -> { annotation }
//   - delete_my_annotation { token, reader_local_id, annotation_id }
//                         -> { ok: true }
//
// Response on error: HTTP 4xx/5xx with { error: string }.
// Response on success: HTTP 200 with the action-specific shape.
//
// Deploy: `supabase functions deploy public-reader --no-verify-jwt`.
// "Verify JWT" must be OFF — public readers don't have an auth session.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals; runs on Edge Functions, not in Vite.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Selection contexts capped to keep DB rows reasonable. Reader sends ~30 each.
const MAX_SELECTED_TEXT = 4000;
const MAX_CONTEXT = 200;
const MAX_COMMENT = 4000;
const MAX_NAME = 60;
const RATE_LIMIT_PER_HOUR = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const action = String(body?.action ?? '');
  try {
    switch (action) {
      case 'resolve_link':
        return await resolveLink(body);
      case 'register_session':
        return await registerSession(body);
      case 'get_chapter':
        return await getChapter(body);
      case 'post_annotation':
        return await postAnnotation(body);
      case 'delete_my_annotation':
        return await deleteMyAnnotation(body);
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e: any) {
    console.error('[public-reader]', action, e);
    return json({ error: e?.message ?? 'internal error' }, 500);
  }
});

// ─── action handlers ─────────────────────────────────────────────────────

async function resolveLink(body: any) {
  const link = await loadActiveLink(body?.token);
  if (!link) return json({ error: 'link_invalid' }, 403);

  const { data: book, error: bookErr } = await sb
    .from('books')
    .select('id, title, description, rank')
    .eq('id', link.book_id)
    .single();
  if (bookErr || !book) return json({ error: 'book_not_found' }, 404);

  const { data: parts, error: partsErr } = await sb
    .from('parts')
    .select('id, title, rank')
    .eq('book_id', link.book_id)
    .order('rank');
  if (partsErr) return json({ error: partsErr.message }, 500);

  const partIds = (parts ?? []).map((p) => p.id);
  let chapters: any[] = [];
  // Pull both preface (book_id = link.book_id) and regular chapters (part_id in partIds).
  let q = sb
    .from('chapters')
    .select('id, part_id, book_id, is_preface, title, reading_rank, status, final_version_id')
    .or(
      `book_id.eq.${link.book_id}${
        partIds.length > 0 ? `,part_id.in.(${partIds.join(',')})` : ''
      }`,
    );
  if (!link.include_drafts) q = q.eq('status', 'published');
  const { data: chs, error: chsErr } = await q;
  if (chsErr) return json({ error: chsErr.message }, 500);
  // Always exclude chapters with no final_version (empty) from public view.
  // Sort: preface first, then by (part.rank, reading_rank).
  const partRankById = new Map<string, string>();
  for (const p of parts ?? []) partRankById.set(p.id, p.rank);
  chapters = (chs ?? [])
    .filter((c: any) => !!c.final_version_id)
    .sort((a: any, b: any) => {
      if (a.is_preface !== b.is_preface) return a.is_preface ? -1 : 1;
      const pa = a.part_id ? partRankById.get(a.part_id) ?? '' : '';
      const pb = b.part_id ? partRankById.get(b.part_id) ?? '' : '';
      if (pa !== pb) return pa < pb ? -1 : 1;
      if (a.reading_rank === b.reading_rank) return 0;
      return a.reading_rank < b.reading_rank ? -1 : 1;
    });

  return json({
    link: {
      id: link.id,
      label: link.label,
      allow_comments: link.allow_comments,
      include_drafts: link.include_drafts,
      expires_at: link.expires_at,
    },
    book,
    parts: parts ?? [],
    chapters,
  });
}

async function registerSession(body: any) {
  const link = await loadActiveLink(body?.token);
  if (!link) return json({ error: 'link_invalid' }, 403);

  const readerLocalId = String(body?.reader_local_id ?? '').trim();
  const name = String(body?.name ?? '').trim().slice(0, MAX_NAME);
  if (!readerLocalId || !name) return json({ error: 'missing_identity' }, 400);

  const { data: existing } = await sb
    .from('reader_sessions')
    .select('*')
    .eq('share_link_id', link.id)
    .eq('reader_local_id', readerLocalId)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await sb
      .from('reader_sessions')
      .update({ name, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ session: updated });
  }

  const { data: created, error: insErr } = await sb
    .from('reader_sessions')
    .insert({
      share_link_id: link.id,
      reader_local_id: readerLocalId,
      name,
    })
    .select('*')
    .single();
  if (insErr) return json({ error: insErr.message }, 500);
  return json({ session: created });
}

async function getChapter(body: any) {
  const link = await loadActiveLink(body?.token);
  if (!link) return json({ error: 'link_invalid' }, 403);

  const session = await loadSession(link.id, body?.reader_local_id);
  if (!session) return json({ error: 'session_not_registered' }, 403);

  const chapterId = String(body?.chapter_id ?? '');
  if (!chapterId) return json({ error: 'missing_chapter_id' }, 400);

  const { data: chapter, error: chErr } = await sb
    .from('chapters')
    .select(
      'id, title, status, final_version_id, reading_rank, part_id, book_id, is_preface, chapter_header, chapter_footer, parts(book_id)',
    )
    .eq('id', chapterId)
    .single();
  if (chErr || !chapter) return json({ error: 'chapter_not_found' }, 404);
  // Preface chapters carry book_id directly; regular chapters reach the book through their part.
  const chapterBookId = (chapter as any).is_preface
    ? (chapter as any).book_id
    : (chapter as any).parts?.book_id;
  if (chapterBookId !== link.book_id) {
    return json({ error: 'chapter_not_in_book' }, 403);
  }
  if (!link.include_drafts && chapter.status !== 'published') {
    return json({ error: 'chapter_not_published' }, 403);
  }
  if (!chapter.final_version_id) {
    return json({ error: 'chapter_empty' }, 404);
  }

  const { data: ver, error: verErr } = await sb
    .from('chapter_versions')
    .select('id, text')
    .eq('id', chapter.final_version_id)
    .single();
  if (verErr || !ver) return json({ error: 'version_not_found' }, 404);

  const { data: anns, error: annsErr } = await sb
    .from('reader_annotations')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('reader_session_id', session.id)
    .order('created_at', { ascending: true });
  if (annsErr) return json({ error: annsErr.message }, 500);

  const text = await hydrateChapterIllustrations(ver.text);

  // Bump last_seen_at fire-and-forget.
  void sb
    .from('reader_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', session.id);

  return json({
    chapter: {
      id: chapter.id,
      title: chapter.title,
      status: chapter.status,
      reading_rank: chapter.reading_rank,
      part_id: chapter.part_id,
      is_preface: !!(chapter as any).is_preface,
      text,
      chapter_header: (chapter as any).chapter_header ?? null,
      chapter_footer: (chapter as any).chapter_footer ?? null,
    },
    my_annotations: anns ?? [],
  });
}

// ─── illustrations hydration ─────────────────────────────────────────────
//
// Chapter HTML stores illustrations as: <figure data-illustration-id="ID"><img></figure>
// Resolve each ID to its public URL + caption before returning to the reader.

const ILLUSTRATION_ID_RE = /data-illustration-id="([^"]+)"/g;

function extractIllustrationIds(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  for (const match of html.matchAll(ILLUSTRATION_ID_RE)) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function hydrateChapterIllustrations(html: string): Promise<string> {
  const ids = extractIllustrationIds(html);
  if (ids.length === 0) return html;
  const { data, error } = await sb
    .from('entity_illustrations')
    .select('id, storage_path, caption, alt_text, updated_at')
    .in('id', ids);
  if (error || !data) return html;
  const map = new Map<string, { src: string; alt: string; caption: string | null }>();
  for (const row of data) {
    const { data: pub } = sb.storage
      .from('illustrations')
      .getPublicUrl(row.storage_path);
    const v = row.updated_at ? Date.parse(row.updated_at) : NaN;
    const src = !Number.isNaN(v)
      ? `${pub.publicUrl}${pub.publicUrl.includes('?') ? '&' : '?'}v=${v}`
      : pub.publicUrl;
    map.set(row.id, {
      src,
      alt: row.alt_text ?? row.caption ?? '',
      caption: row.caption,
    });
  }
  return html.replace(
    /<figure\b([^>]*?)data-illustration-id="([^"]+)"([^>]*)>[\s\S]*?<\/figure>/g,
    (_match: string, beforeId: string, id: string, afterId: string) => {
      const rec = map.get(id);
      if (!rec) {
        return `<figure class="wb-illustration wb-illustration-missing" data-illustration-id="${escapeHtml(
          id,
        )}"><figcaption>[illustration unavailable]</figcaption></figure>`;
      }
      const attrs = `${beforeId}data-illustration-id="${escapeHtml(id)}"${afterId}`.trim();
      const captionHtml = rec.caption
        ? `<figcaption>${escapeHtml(rec.caption)}</figcaption>`
        : '';
      return `<figure class="wb-illustration" ${attrs}><img src="${escapeHtml(
        rec.src,
      )}" alt="${escapeHtml(rec.alt)}" loading="lazy" />${captionHtml}</figure>`;
    },
  );
}

async function postAnnotation(body: any) {
  const link = await loadActiveLink(body?.token);
  if (!link) return json({ error: 'link_invalid' }, 403);

  const session = await loadSession(link.id, body?.reader_local_id);
  if (!session) return json({ error: 'session_not_registered' }, 403);

  const kind = String(body?.kind ?? '');
  if (!['up', 'down', 'comment'].includes(kind)) {
    return json({ error: 'invalid_kind' }, 400);
  }
  if (kind === 'comment' && !link.allow_comments) {
    return json({ error: 'comments_disabled' }, 403);
  }

  const chapterId = String(body?.chapter_id ?? '');
  if (!chapterId) return json({ error: 'missing_chapter_id' }, 400);

  // Ensure chapter belongs to the link's book (preface uses book_id directly).
  const { data: chapter } = await sb
    .from('chapters')
    .select('id, status, book_id, is_preface, parts(book_id)')
    .eq('id', chapterId)
    .single();
  const chapterBookId = chapter
    ? (chapter as any).is_preface
      ? (chapter as any).book_id
      : (chapter as any).parts?.book_id
    : null;
  if (!chapter || chapterBookId !== link.book_id) {
    return json({ error: 'chapter_not_in_book' }, 403);
  }
  if (!link.include_drafts && chapter.status !== 'published') {
    return json({ error: 'chapter_not_published' }, 403);
  }

  const selectedText = trim(String(body?.selected_text ?? ''), MAX_SELECTED_TEXT);
  const beforeCtx = trim(String(body?.before_ctx ?? ''), MAX_CONTEXT);
  const afterCtx = trim(String(body?.after_ctx ?? ''), MAX_CONTEXT);
  const commentBody =
    kind === 'comment'
      ? trim(String(body?.comment_body ?? ''), MAX_COMMENT)
      : null;

  if (!selectedText) return json({ error: 'missing_selection' }, 400);
  if (kind === 'comment' && !commentBody) {
    return json({ error: 'missing_comment_body' }, 400);
  }

  // Rate-limit: cap annotations per session per hour.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: cntErr } = await sb
    .from('reader_annotations')
    .select('id', { count: 'exact', head: true })
    .eq('reader_session_id', session.id)
    .gte('created_at', since);
  if (cntErr) return json({ error: cntErr.message }, 500);
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited' }, 429);
  }

  const { data: ann, error: insErr } = await sb
    .from('reader_annotations')
    .insert({
      share_link_id: link.id,
      reader_session_id: session.id,
      chapter_id: chapterId,
      kind,
      selected_text: selectedText,
      before_ctx: beforeCtx,
      after_ctx: afterCtx,
      comment_body: commentBody,
    })
    .select('*')
    .single();
  if (insErr) return json({ error: insErr.message }, 500);

  void sb
    .from('reader_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', session.id);

  return json({ annotation: ann });
}

async function deleteMyAnnotation(body: any) {
  const link = await loadActiveLink(body?.token);
  if (!link) return json({ error: 'link_invalid' }, 403);

  const session = await loadSession(link.id, body?.reader_local_id);
  if (!session) return json({ error: 'session_not_registered' }, 403);

  const annotationId = String(body?.annotation_id ?? '');
  if (!annotationId) return json({ error: 'missing_annotation_id' }, 400);

  const { data: ann } = await sb
    .from('reader_annotations')
    .select('id, reader_session_id')
    .eq('id', annotationId)
    .single();
  if (!ann) return json({ error: 'annotation_not_found' }, 404);
  if (ann.reader_session_id !== session.id) {
    return json({ error: 'forbidden' }, 403);
  }

  const { error: delErr } = await sb
    .from('reader_annotations')
    .delete()
    .eq('id', annotationId);
  if (delErr) return json({ error: delErr.message }, 500);
  return json({ ok: true });
}

// ─── helpers ─────────────────────────────────────────────────────────────

async function loadActiveLink(rawToken: any) {
  const token = String(rawToken ?? '').trim();
  if (!token || token.length < 16 || token.length > 64) return null;
  const { data: link } = await sb
    .from('share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!link) return null;
  if (!link.active) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;
  return link;
}

async function loadSession(shareLinkId: string, rawReaderId: any) {
  const readerLocalId = String(rawReaderId ?? '').trim();
  if (!readerLocalId) return null;
  const { data: session } = await sb
    .from('reader_sessions')
    .select('*')
    .eq('share_link_id', shareLinkId)
    .eq('reader_local_id', readerLocalId)
    .maybeSingle();
  return session ?? null;
}

function trim(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
