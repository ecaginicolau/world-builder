import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChapterEvent } from '@/features/timeline/types';

export const chapterEventsKeys = {
  byChapter: (chapterId: string) => ['chapter_events', 'byChapter', chapterId] as const,
  byEvent: (eventId: string) => ['chapter_events', 'byEvent', eventId] as const,
  byWorld: (worldId: string) => ['chapter_events', 'byWorld', worldId] as const,
};

export function useChapterEvents(chapterId: string) {
  return useQuery<ChapterEvent[], Error>({
    queryKey: chapterEventsKeys.byChapter(chapterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapter_events')
        .select('*')
        .eq('chapter_id', chapterId);
      if (error) throw error;
      const rows = (data ?? []) as ChapterEvent[];
      // Sort client-side by narrative_rank to dodge case-insensitive collation.
      return rows.slice().sort((a, b) =>
        a.narrative_rank < b.narrative_rank ? -1 :
        a.narrative_rank > b.narrative_rank ? 1 : 0,
      );
    },
    enabled: !!chapterId,
  });
}

export function useEventChapters(eventId: string) {
  return useQuery<ChapterEvent[], Error>({
    queryKey: chapterEventsKeys.byEvent(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapter_events')
        .select('*')
        .eq('event_id', eventId);
      if (error) throw error;
      return (data ?? []) as ChapterEvent[];
    },
    enabled: !!eventId,
  });
}

/** All chapter_events in a world — used by TimelineScreen to show chapter chips per event. */
export function useChapterEventsByWorld(worldId: string) {
  return useQuery<ChapterEvent[], Error>({
    queryKey: chapterEventsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapter_events')
        .select('*')
        .eq('world_id', worldId);
      if (error) throw error;
      return (data ?? []) as ChapterEvent[];
    },
    enabled: !!worldId,
  });
}

interface LinkInput {
  chapterId: string;
  eventId: string;
  worldId: string;
  ownerId: string;
  narrativeRank: string;
}

export function useLinkChapterEvent() {
  const qc = useQueryClient();
  return useMutation<ChapterEvent, Error, LinkInput>({
    mutationFn: async ({ chapterId, eventId, worldId, ownerId, narrativeRank }) => {
      const { data, error } = await supabase
        .from('chapter_events')
        .insert({
          chapter_id: chapterId,
          event_id: eventId,
          world_id: worldId,
          owner_id: ownerId,
          narrative_rank: narrativeRank,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ChapterEvent;
    },
    onSuccess: (ce) => {
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byChapter(ce.chapter_id) });
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byEvent(ce.event_id) });
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byWorld(ce.world_id) });
    },
  });
}

export function useUnlinkChapterEvent() {
  const qc = useQueryClient();
  return useMutation<
    { chapterId: string; eventId: string; worldId: string },
    Error,
    { chapterId: string; eventId: string; worldId: string }
  >({
    mutationFn: async ({ chapterId, eventId, worldId }) => {
      const { error } = await supabase
        .from('chapter_events')
        .delete()
        .eq('chapter_id', chapterId)
        .eq('event_id', eventId);
      if (error) throw error;
      return { chapterId, eventId, worldId };
    },
    onSuccess: ({ chapterId, eventId, worldId }) => {
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byChapter(chapterId) });
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byEvent(eventId) });
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byWorld(worldId) });
    },
  });
}

export function useUpdateChapterEventRank() {
  const qc = useQueryClient();
  return useMutation<
    ChapterEvent,
    Error,
    { chapterId: string; eventId: string; narrativeRank: string }
  >({
    mutationFn: async ({ chapterId, eventId, narrativeRank }) => {
      const { data, error } = await supabase
        .from('chapter_events')
        .update({ narrative_rank: narrativeRank })
        .eq('chapter_id', chapterId)
        .eq('event_id', eventId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ChapterEvent;
    },
    onSuccess: (ce) => {
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byChapter(ce.chapter_id) });
      void qc.invalidateQueries({ queryKey: chapterEventsKeys.byWorld(ce.world_id) });
    },
  });
}
