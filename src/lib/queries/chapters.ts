import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nextRankAfter, START_RANK } from '@/lib/ranks';
import type { Chapter } from '@/features/chapters/types';
import { chapterVersionsKeys } from './chapterVersions';
import { chapterWordCountsKeys } from './chapterWordCounts';

export const chaptersKeys = {
  byPart: (partId: string) => ['chapters', 'byPart', partId] as const,
  byWorld: (worldId: string) => ['chapters', 'byWorld', worldId] as const,
  prefaceByBook: (bookId: string) => ['chapters', 'prefaceByBook', bookId] as const,
  detail: (id: string) => ['chapters', 'detail', id] as const,
};

export function useChaptersByPart(partId: string) {
  return useQuery<Chapter[], Error>({
    queryKey: chaptersKeys.byPart(partId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('part_id', partId)
        .order('reading_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Chapter[];
    },
    enabled: !!partId,
  });
}

export function useChaptersByWorld(worldId: string) {
  return useQuery<Chapter[], Error>({
    queryKey: chaptersKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('world_id', worldId)
        .order('reading_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Chapter[];
    },
    enabled: !!worldId,
  });
}

export function usePrefaceByBook(bookId: string) {
  return useQuery<Chapter | null, Error>({
    queryKey: chaptersKeys.prefaceByBook(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('book_id', bookId)
        .eq('is_preface', true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Chapter | null;
    },
    enabled: !!bookId,
  });
}

export function useChapter(chapterId: string) {
  return useQuery<Chapter, Error>({
    queryKey: chaptersKeys.detail(chapterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();
      if (error) throw error;
      return data as Chapter;
    },
    enabled: !!chapterId,
  });
}

interface CreateChapterInput {
  worldId: string;
  partId: string;
  ownerId: string;
  title?: string | null;
  /** Initial draft text (becomes the v0 chapter_versions row). */
  draft?: string;
  sourceNoteId?: string | null;
  /**
   * Required by the slice (d) UX rule "every chapter has at least one event".
   * If provided, the mutation inserts the event + chapter_events link in the
   * same flow. Pass null only for programmatic flows that do their own linking
   * (e.g. "retell this existing event as a new chapter").
   */
  firstEvent?: { title: string; description?: string | null } | null;
}

export function useCreateChapter() {
  const qc = useQueryClient();
  return useMutation<Chapter, Error, CreateChapterInput>({
    mutationFn: async ({ worldId, partId, ownerId, title, draft, sourceNoteId, firstEvent }) => {
      const { data: siblings, error: selErr } = await supabase
        .from('chapters')
        .select('reading_rank')
        .eq('part_id', partId);
      if (selErr) throw selErr;
      const reading_rank = nextRankAfter(
        (siblings ?? []).map((s: { reading_rank: string }) => ({ rank: s.reading_rank })),
      );

      // 1. Insert the chapter row.
      const { data: chapter, error } = await supabase
        .from('chapters')
        .insert({
          world_id: worldId,
          part_id: partId,
          owner_id: ownerId,
          reading_rank,
          title: title?.trim() || null,
          source_note_id: sourceNoteId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;

      // 2. Insert v0 chapter_versions row with the initial draft text.
      const { data: v0, error: vErr } = await supabase
        .from('chapter_versions')
        .insert({
          chapter_id: chapter.id,
          world_id: worldId,
          owner_id: ownerId,
          rank: START_RANK,
          origin: 'draft',
          text: draft ?? '',
        })
        .select('id')
        .single();
      if (vErr) throw vErr;

      // 3. Set final_version_id on the chapter to point at v0.
      const { data: updated, error: upErr } = await supabase
        .from('chapters')
        .update({ final_version_id: v0.id })
        .eq('id', chapter.id)
        .select('*')
        .single();
      if (upErr) throw upErr;

      // 4. Insert the first event + link, if requested.
      if (firstEvent && firstEvent.title.trim()) {
        // Compute the new event chrono = end of world chrono.
        const { data: worldEvents, error: weErr } = await supabase
          .from('events')
          .select('chronological_rank')
          .eq('world_id', worldId);
        if (weErr) throw weErr;
        const eventChronoRank = nextRankAfter(
          (worldEvents ?? []).map((e: { chronological_rank: string }) => ({ rank: e.chronological_rank })),
        );
        const { data: ev, error: evErr } = await supabase
          .from('events')
          .insert({
            world_id: worldId,
            owner_id: ownerId,
            title: firstEvent.title.trim(),
            chronological_rank: eventChronoRank,
            description: firstEvent.description?.trim() || null,
          })
          .select('id')
          .single();
        if (evErr) throw evErr;
        const { error: ceErr } = await supabase.from('chapter_events').insert({
          chapter_id: chapter.id,
          event_id: ev.id,
          world_id: worldId,
          owner_id: ownerId,
          narrative_rank: START_RANK,
        });
        if (ceErr) throw ceErr;
      }
      return updated as Chapter;
    },
    onSuccess: (c) => {
      if (c.part_id) {
        void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(c.part_id) });
      }
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(c.world_id) });
      void qc.invalidateQueries({ queryKey: chapterVersionsKeys.byChapter(c.id) });
      void qc.invalidateQueries({ queryKey: chapterWordCountsKeys.byWorld(c.world_id) });
      void qc.invalidateQueries({ queryKey: ['events', 'byWorld', c.world_id] });
      void qc.invalidateQueries({ queryKey: ['chapter_events', 'byChapter', c.id] });
      void qc.invalidateQueries({ queryKey: ['chapter_events', 'byWorld', c.world_id] });
    },
  });
}

interface CreatePrefaceInput {
  worldId: string;
  bookId: string;
  ownerId: string;
  title?: string | null;
  draft?: string;
}

/**
 * Creates a preface chapter (book_id set, part_id null, is_preface=true).
 * No event/timeline link — prefaces sit outside the canon timeline.
 */
export function useCreatePreface() {
  const qc = useQueryClient();
  return useMutation<Chapter, Error, CreatePrefaceInput>({
    mutationFn: async ({ worldId, bookId, ownerId, title, draft }) => {
      const { data: chapter, error } = await supabase
        .from('chapters')
        .insert({
          world_id: worldId,
          book_id: bookId,
          part_id: null,
          is_preface: true,
          owner_id: ownerId,
          reading_rank: START_RANK,
          title: title?.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw error;

      const { data: v0, error: vErr } = await supabase
        .from('chapter_versions')
        .insert({
          chapter_id: chapter.id,
          world_id: worldId,
          owner_id: ownerId,
          rank: START_RANK,
          origin: 'draft',
          text: draft ?? '',
        })
        .select('id')
        .single();
      if (vErr) throw vErr;

      const { data: updated, error: upErr } = await supabase
        .from('chapters')
        .update({ final_version_id: v0.id })
        .eq('id', chapter.id)
        .select('*')
        .single();
      if (upErr) throw upErr;

      return updated as Chapter;
    },
    onSuccess: (c) => {
      if (c.book_id) {
        void qc.invalidateQueries({ queryKey: chaptersKeys.prefaceByBook(c.book_id) });
      }
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(c.world_id) });
      void qc.invalidateQueries({ queryKey: chapterVersionsKeys.byChapter(c.id) });
      void qc.invalidateQueries({ queryKey: chapterWordCountsKeys.byWorld(c.world_id) });
    },
  });
}

export function useUpdateChapter() {
  const qc = useQueryClient();
  return useMutation<
    Chapter,
    Error,
    {
      id: string;
      title?: string | null;
      readingRank?: string;
      finalVersionId?: string;
      summaryS?: string | null;
      summaryM?: string | null;
      summaryL?: string | null;
      status?: 'draft' | 'published';
      lastAnalyzedAt?: string | null;
      chapterHeader?: string | null;
      chapterFooter?: string | null;
      openingIllustrationId?: string | null;
    }
  >({
    mutationFn: async ({
      id, title, readingRank, finalVersionId,
      summaryS, summaryM, summaryL, status,
      lastAnalyzedAt, chapterHeader, chapterFooter, openingIllustrationId,
    }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (readingRank !== undefined) patch.reading_rank = readingRank;
      if (finalVersionId !== undefined) patch.final_version_id = finalVersionId;
      if (summaryS !== undefined) patch.summary_s = summaryS;
      if (summaryM !== undefined) patch.summary_m = summaryM;
      if (summaryL !== undefined) patch.summary_l = summaryL;
      if (status !== undefined) {
        patch.status = status;
        patch.published_at = status === 'published' ? new Date().toISOString() : null;
      }
      if (lastAnalyzedAt !== undefined) patch.last_analyzed_at = lastAnalyzedAt;
      if (chapterHeader !== undefined) patch.chapter_header = chapterHeader;
      if (chapterFooter !== undefined) patch.chapter_footer = chapterFooter;
      if (openingIllustrationId !== undefined)
        patch.opening_illustration_id = openingIllustrationId;
      const { data, error } = await supabase
        .from('chapters')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Chapter;
    },
    onSuccess: (c) => {
      qc.setQueryData(chaptersKeys.detail(c.id), c);
      if (c.part_id) {
        void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(c.part_id) });
      }
      if (c.book_id) {
        void qc.invalidateQueries({ queryKey: chaptersKeys.prefaceByBook(c.book_id) });
      }
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(c.world_id) });
      void qc.invalidateQueries({ queryKey: chapterWordCountsKeys.byWorld(c.world_id) });
    },
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; partId: string | null; bookId: string | null; worldId: string },
    Error,
    { id: string; partId: string | null; bookId?: string | null; worldId: string }
  >({
    mutationFn: async ({ id, partId, bookId, worldId }) => {
      const { error } = await supabase.from('chapters').delete().eq('id', id);
      if (error) throw error;
      return { id, partId, bookId: bookId ?? null, worldId };
    },
    onSuccess: ({ partId, bookId, worldId }) => {
      if (partId) void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(partId) });
      if (bookId) void qc.invalidateQueries({ queryKey: chaptersKeys.prefaceByBook(bookId) });
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(worldId) });
      void qc.invalidateQueries({ queryKey: chapterWordCountsKeys.byWorld(worldId) });
    },
  });
}
