import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type SearchKind = 'note' | 'chapter' | 'entity';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  /** Auxiliary identifiers for navigation. */
  worldId: string;
  /** For chapter hits, the chapter_id (since the row matched is a chapter_version). */
  chapterId?: string;
}

const SEARCH_LIMIT = 15;

function snippet(text: string, query: string, maxLen = 200): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const q = query.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const idx = q ? lower.indexOf(q) : -1;
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 140);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';
  return prefix + text.slice(start, end) + suffix;
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function useGlobalSearchResults(worldId: string | null, query: string) {
  const trimmed = query.trim();
  return useQuery<SearchHit[], Error>({
    queryKey: ['globalSearch', worldId, trimmed],
    enabled: !!worldId && trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      if (!worldId) return [];
      const cfg = { config: 'simple', type: 'websearch' as const };

      const [notesRes, chaptersRes, entitiesRes] = await Promise.all([
        supabase
          .from('notes')
          .select('id, title, content')
          .eq('world_id', worldId)
          .textSearch('search_text', trimmed, cfg)
          .limit(SEARCH_LIMIT),
        supabase
          .from('chapter_versions')
          .select('id, chapter_id, text')
          .eq('world_id', worldId)
          .textSearch('search_text', trimmed, cfg)
          .limit(SEARCH_LIMIT),
        supabase
          .from('entities')
          .select('id, name, aliases')
          .eq('world_id', worldId)
          .textSearch('search_text', trimmed, cfg)
          .limit(SEARCH_LIMIT),
      ]);
      if (notesRes.error) throw notesRes.error;
      if (chaptersRes.error) throw chaptersRes.error;
      if (entitiesRes.error) throw entitiesRes.error;

      // Resolve chapter titles in a separate query (chapter_versions ↔ chapters
      // has two FKs — chapter_id and final_version_id — so PostgREST embed
      // refuses to pick one.)
      const chapterIds = Array.from(
        new Set((chaptersRes.data ?? []).map((cv: { chapter_id: string }) => cv.chapter_id)),
      );
      const chapterTitleById = new Map<string, string | null>();
      if (chapterIds.length > 0) {
        const { data: chapters, error: titleErr } = await supabase
          .from('chapters')
          .select('id, title')
          .in('id', chapterIds);
        if (titleErr) throw titleErr;
        for (const c of (chapters ?? []) as { id: string; title: string | null }[]) {
          chapterTitleById.set(c.id, c.title);
        }
      }

      const hits: SearchHit[] = [];
      for (const n of (notesRes.data ?? []) as { id: string; title: string | null; content: string }[]) {
        const text = htmlToText(n.content ?? '');
        hits.push({
          kind: 'note',
          id: n.id,
          title: n.title?.trim() || '(untitled)',
          snippet: snippet(text, trimmed),
          worldId,
        });
      }
      // chapter_versions may yield multiple hits per chapter — dedupe by chapter_id
      // (keep the first match per chapter).
      const seenChapters = new Set<string>();
      for (const cv of (chaptersRes.data ?? []) as Array<{
        id: string; chapter_id: string; text: string;
      }>) {
        if (seenChapters.has(cv.chapter_id)) continue;
        seenChapters.add(cv.chapter_id);
        const text = htmlToText(cv.text ?? '');
        hits.push({
          kind: 'chapter',
          id: cv.chapter_id,
          chapterId: cv.chapter_id,
          title: chapterTitleById.get(cv.chapter_id)?.trim() || '(untitled chapter)',
          snippet: snippet(text, trimmed),
          worldId,
        });
      }
      for (const e of (entitiesRes.data ?? []) as { id: string; name: string; aliases: string[] | null }[]) {
        hits.push({
          kind: 'entity',
          id: e.id,
          title: e.name,
          snippet: (e.aliases ?? []).length > 0 ? `Aliases: ${(e.aliases ?? []).join(', ')}` : '',
          worldId,
        });
      }
      return hits;
    },
  });
}
