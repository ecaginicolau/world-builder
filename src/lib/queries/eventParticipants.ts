import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EventParticipant } from '@/features/timeline/types';

export const eventParticipantsKeys = {
  byEvent: (eventId: string) => ['event_participants', 'byEvent', eventId] as const,
};

export function useEventParticipants(eventId: string) {
  return useQuery<EventParticipant[], Error>({
    queryKey: eventParticipantsKeys.byEvent(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_participants')
        .select('*')
        .eq('event_id', eventId);
      if (error) throw error;
      return (data ?? []) as EventParticipant[];
    },
    enabled: !!eventId,
  });
}

export function useLinkEventEntity() {
  const qc = useQueryClient();
  return useMutation<
    EventParticipant,
    Error,
    { eventId: string; entityId: string; worldId: string; ownerId: string; pinnedManually?: boolean }
  >({
    mutationFn: async ({ eventId, entityId, worldId, ownerId, pinnedManually }) => {
      const { data, error } = await supabase
        .from('event_participants')
        .insert({
          event_id: eventId,
          entity_id: entityId,
          world_id: worldId,
          owner_id: ownerId,
          pinned_manually: pinnedManually ?? true,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as EventParticipant;
    },
    onSuccess: (ep) => {
      void qc.invalidateQueries({ queryKey: eventParticipantsKeys.byEvent(ep.event_id) });
    },
  });
}

export function useUnlinkEventEntity() {
  const qc = useQueryClient();
  return useMutation<
    { eventId: string; entityId: string },
    Error,
    { eventId: string; entityId: string }
  >({
    mutationFn: async ({ eventId, entityId }) => {
      const { error } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', eventId)
        .eq('entity_id', entityId);
      if (error) throw error;
      return { eventId, entityId };
    },
    onSuccess: ({ eventId }) => {
      void qc.invalidateQueries({ queryKey: eventParticipantsKeys.byEvent(eventId) });
    },
  });
}
