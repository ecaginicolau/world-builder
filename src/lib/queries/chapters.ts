import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nextRankAfter } from '@/lib/ranks';
import type { Chapter } from '@/features/chapters/types';

export const chaptersKeys = {
  byPart: (partId: string) => ['chapters', 'byPart', partId] as const,
  byWorld: (worldId: string) => ['chapters', 'byWorld', worldId] as const,
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
        .order('chronological_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Chapter[];
    },
    enabled: !!worldId,
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
  draft?: string;
  sourceNoteId?: string | null;
}

export function useCreateChapter() {
  const qc = useQueryClient();
  return useMutation<Chapter, Error, CreateChapterInput>({
    mutationFn: async ({ worldId, partId, ownerId, title, draft, sourceNoteId }) => {
      const { data: siblings, error: selErr } = await supabase
        .from('chapters')
        .select('reading_rank')
        .eq('part_id', partId);
      if (selErr) throw selErr;
      const reading_rank = nextRankAfter(
        (siblings ?? []).map((s: { reading_rank: string }) => ({ rank: s.reading_rank })),
      );
      const chronological_rank = reading_rank;
      const { data, error } = await supabase
        .from('chapters')
        .insert({
          world_id: worldId,
          part_id: partId,
          owner_id: ownerId,
          reading_rank,
          chronological_rank,
          title: title?.trim() || null,
          draft: draft ?? '',
          source_note_id: sourceNoteId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Chapter;
    },
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(c.part_id) });
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(c.world_id) });
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
      draft?: string;
      content?: string;
      chronologicalRank?: string;
    }
  >({
    mutationFn: async ({ id, title, draft, content, chronologicalRank }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (draft !== undefined) patch.draft = draft;
      if (content !== undefined) patch.content = content;
      if (chronologicalRank !== undefined) patch.chronological_rank = chronologicalRank;
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
      void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(c.part_id) });
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(c.world_id) });
    },
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; partId: string; worldId: string },
    Error,
    { id: string; partId: string; worldId: string }
  >({
    mutationFn: async ({ id, partId, worldId }) => {
      const { error } = await supabase.from('chapters').delete().eq('id', id);
      if (error) throw error;
      return { id, partId, worldId };
    },
    onSuccess: ({ partId, worldId }) => {
      void qc.invalidateQueries({ queryKey: chaptersKeys.byPart(partId) });
      void qc.invalidateQueries({ queryKey: chaptersKeys.byWorld(worldId) });
    },
  });
}
