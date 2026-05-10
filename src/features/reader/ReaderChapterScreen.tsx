import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChapter, useChaptersByWorld } from '@/lib/queries/chapters';
import { useChapterVersions } from '@/lib/queries/chapterVersions';
import { useBooks } from '@/lib/queries/books';
import { usePartsByWorld } from '@/lib/queries/parts';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { resolveColor } from '@/lib/entityColors';
import { CURRENT_RANK_SENTINEL, resolveSnapshotMapAtRank, formatFieldValue } from '@/features/entities/versioning';
import { supabase } from '@/lib/supabase';
import type { Chapter } from '@/features/chapters/types';
import type { EntityVersion, FieldDef } from '@/features/entities/types';

export function ReaderChapterScreen() {
  const { worldId, chapterId } = useParams({ from: '/worlds/$worldId/read/$chapterId' });
  const navigate = useNavigate();
  const chapterQ = useChapter(chapterId);
  const versionsQ = useChapterVersions(chapterId);
  const allChaptersQ = useChaptersByWorld(worldId);
  const booksQ = useBooks(worldId);
  const partsQ = usePartsByWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);

  const finalVersion = useMemo(() => {
    const versions = versionsQ.data ?? [];
    return (
      versions.find((v) => v.id === chapterQ.data?.final_version_id) ??
      versions[versions.length - 1] ??
      null
    );
  }, [versionsQ.data, chapterQ.data?.final_version_id]);

  // Compute prev/next chapters in proper reading order:
  // book.rank → (preface first within book) → part.rank → chapter.reading_rank.
  const { prev, next } = useMemo(() => {
    if (!chapterQ.data || !allChaptersQ.data) return { prev: null, next: null };
    const partsById = new Map((partsQ.data ?? []).map((p) => [p.id, p]));
    const bookRankById = new Map((booksQ.data ?? []).map((b) => [b.id, b.rank]));
    function bookRankFor(c: Chapter): string {
      if (c.is_preface && c.book_id) return bookRankById.get(c.book_id) ?? '';
      const p = c.part_id ? partsById.get(c.part_id) : null;
      return p ? bookRankById.get(p.book_id) ?? '' : '';
    }
    const sorted = [...allChaptersQ.data].sort((a, b) => {
      const ba = bookRankFor(a);
      const bb = bookRankFor(b);
      if (ba !== bb) return ba < bb ? -1 : 1;
      if (a.is_preface !== b.is_preface) return a.is_preface ? -1 : 1;
      const pa = a.part_id ? partsById.get(a.part_id)?.rank ?? '' : '';
      const pb = b.part_id ? partsById.get(b.part_id)?.rank ?? '' : '';
      if (pa !== pb) return pa < pb ? -1 : 1;
      if (a.reading_rank === b.reading_rank) return 0;
      return a.reading_rank < b.reading_rank ? -1 : 1;
    });
    const idx = sorted.findIndex((c) => c.id === chapterId);
    return {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [allChaptersQ.data, partsQ.data, booksQ.data, chapterQ.data, chapterId]);

  if (chapterQ.isLoading || !chapterQ.data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-6">
        <p className="text-fg-muted">Loading…</p>
      </main>
    );
  }

  const isPublished = chapterQ.data.status === 'published';

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto px-6 py-6">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/95 py-2 backdrop-blur">
        <Link
          to="/worlds/$worldId/read"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="reader-back-toc"
        >
          ← Contents
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && navigate({
              to: '/worlds/$worldId/read/$chapterId',
              params: { worldId, chapterId: prev.id },
            })}
            className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-30"
            data-testid="reader-prev"
            title={prev?.title ?? ''}
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && navigate({
              to: '/worlds/$worldId/read/$chapterId',
              params: { worldId, chapterId: next.id },
            })}
            className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-30"
            data-testid="reader-next"
            title={next?.title ?? ''}
          >
            Next →
          </button>
        </div>
      </header>

      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {chapterQ.data.title?.trim() ||
            (chapterQ.data.is_preface ? 'Preface' : '(untitled)')}
        </h1>
        {!isPublished ? (
          <span
            className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-mono uppercase text-amber-300"
            data-testid="reader-draft-badge"
          >
            Draft
          </span>
        ) : null}
      </div>

      {!finalVersion || !finalVersion.text.trim() ? (
        <p className="italic text-fg-muted">This chapter has no text yet.</p>
      ) : (
        <>
          {chapterQ.data.chapter_header && chapterQ.data.chapter_header.trim() ? (
            <div
              className="prose prose-invert max-w-none text-lg leading-relaxed"
              dangerouslySetInnerHTML={{ __html: chapterQ.data.chapter_header }}
              data-testid="reader-chapter-header"
            />
          ) : null}
          <ReaderBody
            html={finalVersion.text}
            worldId={worldId}
            chronologicalRank={CURRENT_RANK_SENTINEL}
            entities={entitiesQ.data ?? []}
            types={typesQ.data ?? []}
          />
          {chapterQ.data.chapter_footer && chapterQ.data.chapter_footer.trim() ? (
            <div
              className="prose prose-invert max-w-none text-lg leading-relaxed"
              dangerouslySetInnerHTML={{ __html: chapterQ.data.chapter_footer }}
              data-testid="reader-chapter-footer"
            />
          ) : null}
        </>
      )}
    </main>
  );
}

interface ReaderBodyProps {
  html: string;
  worldId: string;
  chronologicalRank: string;
  entities: { id: string; name: string; aliases: string[]; entity_type_id: string }[];
  types: { id: string; name: string; color: string | null; fields: FieldDef[] }[];
}

function ReaderBody({ html, worldId, chronologicalRank, entities, types }: ReaderBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<
    | { entityId: string; x: number; y: number; loading: boolean; snapshot?: Record<string, string>; entityName: string; typeName: string }
    | null
  >(null);

  // Decorate HTML with entity highlights (simple post-render walk).
  const decorated = useMemo(() => decorateEntities(html, entities, types), [html, entities, types]);

  // Click handler: when user clicks a highlighted span, fetch the entity's snapshot at the rank.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function onClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest('[data-entity-id]');
      if (!target) {
        setPopup(null);
        return;
      }
      const entityId = target.getAttribute('data-entity-id')!;
      const entityName = target.getAttribute('data-entity-name') ?? '';
      const typeName = target.getAttribute('data-entity-type') ?? '';
      const rect = target.getBoundingClientRect();
      setPopup({
        entityId,
        x: rect.left,
        y: rect.bottom + 4,
        loading: true,
        entityName,
        typeName,
      });
      void (async () => {
        const t = types.find((tt) => tt.name === typeName);
        const fields: FieldDef[] = t?.fields ?? [];
        const { data: vs } = await supabase
          .from('entity_versions')
          .select('*')
          .eq('entity_id', entityId)
          .eq('world_id', worldId);
        const snap = resolveSnapshotMapAtRank(
          (vs ?? []) as EntityVersion[],
          chronologicalRank,
          fields,
        );
        const out: Record<string, string> = {};
        for (const f of fields) {
          out[f.name] = formatFieldValue(snap[f.name] ?? null);
        }
        setPopup((p) =>
          p && p.entityId === entityId
            ? { ...p, loading: false, snapshot: out }
            : p,
        );
      })();
    }
    function onScroll() { setPopup(null); }
    node.addEventListener('click', onClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      node.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [worldId, chronologicalRank, types]);

  return (
    <>
      <div
        ref={containerRef}
        className="prose prose-invert max-w-none text-lg leading-relaxed"
        dangerouslySetInnerHTML={{ __html: decorated }}
        data-testid="reader-body"
      />
      {popup ? (
        <div
          role="dialog"
          className="fixed z-50 max-w-xs rounded-md border border-border bg-bg-panel p-3 text-sm shadow-lg"
          style={{ left: popup.x, top: popup.y }}
          data-testid="reader-entity-popup"
        >
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <strong>{popup.entityName}</strong>
            <span className="text-xs text-fg-muted">{popup.typeName}</span>
          </div>
          {popup.loading ? (
            <p className="text-xs italic text-fg-muted">Loading…</p>
          ) : popup.snapshot && Object.keys(popup.snapshot).length > 0 ? (
            <dl className="space-y-0.5 text-xs">
              {Object.entries(popup.snapshot).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="flex-1 break-words">{v || <span className="italic text-fg-muted">—</span>}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs italic text-fg-muted">No state at this rank.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function decorateEntities(
  html: string,
  entities: { id: string; name: string; aliases: string[]; entity_type_id: string }[],
  types: { id: string; name: string; color: string | null }[],
): string {
  if (entities.length === 0) return html;
  const typesById = new Map(types.map((t) => [t.id, t]));
  // Build a single regex (alternation) of all names + aliases, with word boundaries.
  // Prefer longer matches first to handle "Maitre Sorn" before "Sorn".
  type Tok = { entity: typeof entities[number]; word: string; color: string; typeName: string };
  const toks: Tok[] = [];
  for (const e of entities) {
    const t = typesById.get(e.entity_type_id);
    const color = resolveColor(t?.color ?? null, t?.name ?? '');
    const typeName = t?.name ?? 'Unknown';
    const words = [e.name, ...(e.aliases ?? [])].filter(Boolean);
    for (const w of words) {
      toks.push({ entity: e, word: w, color, typeName });
    }
  }
  if (toks.length === 0) return html;
  toks.sort((a, b) => b.word.length - a.word.length);
  const escaped = toks.map((t) => escapeRegex(t.word));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gui');

  // Replace inside text nodes only (not inside tags). Cheap parser:
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      if (close === -1) { out += html.slice(i); break; }
      out += html.slice(i, close + 1);
      i = close + 1;
    } else {
      const next = html.indexOf('<', i);
      const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
      out += chunk.replace(re, (match) => {
        const tok = toks.find((t) => t.word.toLowerCase() === match.toLowerCase());
        if (!tok) return match;
        return `<span class="cursor-pointer underline decoration-dotted" data-entity-id="${tok.entity.id}" data-entity-name="${escapeAttr(tok.entity.name)}" data-entity-type="${escapeAttr(tok.typeName)}" style="background:${tok.color}26;border-bottom:1px solid ${tok.color}66">${match}</span>`;
      });
      i = next === -1 ? html.length : next;
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
