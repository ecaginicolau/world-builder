import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TimelineEvent } from '@/features/timeline/types';

export const eventsKeys = {
  byWorld: (worldId: string) => ['events', 'byWorld', worldId] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
};

export function useEvents(worldId: string) {
  return useQuery<TimelineEvent[], Error>({
    queryKey: eventsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('world_id', worldId)
        .order('chronological_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TimelineEvent[];
    },
    enabled: !!worldId,
  });
}

export function useEvent(eventId: string) {
  return useQuery<TimelineEvent, Error>({
    queryKey: eventsKeys.detail(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data as TimelineEvent;
    },
    enabled: !!eventId,
  });
}

interface CreateEventInput {
  worldId: string;
  ownerId: string;
  title: string;
  chronologicalRank: string;
  description?: string | null;
  descriptionHtml?: string | null;
  tags?: string[];
  sourceNoteId?: string | null;
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation<TimelineEvent, Error, CreateEventInput>({
    mutationFn: async ({
      worldId,
      ownerId,
      title,
      chronologicalRank,
      description,
      descriptionHtml,
      tags,
      sourceNoteId,
    }) => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          world_id: worldId,
          owner_id: ownerId,
          title: title.trim(),
          chronological_rank: chronologicalRank,
          description: description ?? null,
          description_html: descriptionHtml ?? null,
          tags: tags ?? [],
          source_note_id: sourceNoteId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as TimelineEvent;
    },
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: eventsKeys.byWorld(e.world_id) });
    },
  });
}

interface UpdateEventInput {
  id: string;
  title?: string;
  description?: string | null;
  descriptionHtml?: string | null;
  tags?: string[];
  chronologicalRank?: string;
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation<TimelineEvent, Error, UpdateEventInput>({
    mutationFn: async ({ id, title, description, descriptionHtml, tags, chronologicalRank }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title.trim();
      if (description !== undefined) patch.description = description;
      if (descriptionHtml !== undefined) patch.description_html = descriptionHtml;
      if (tags !== undefined) patch.tags = tags;
      if (chronologicalRank !== undefined) patch.chronological_rank = chronologicalRank;
      const { data, error } = await supabase
        .from('events')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as TimelineEvent;
    },
    onSuccess: (e) => {
      qc.setQueryData(eventsKeys.detail(e.id), e);
      void qc.invalidateQueries({ queryKey: eventsKeys.byWorld(e.world_id) });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation<{ id: string; worldId: string }, Error, { id: string; worldId: string }>({
    mutationFn: async ({ id, worldId }) => {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      return { id, worldId };
    },
    onSuccess: ({ worldId }) => {
      void qc.invalidateQueries({ queryKey: eventsKeys.byWorld(worldId) });
    },
  });
}
