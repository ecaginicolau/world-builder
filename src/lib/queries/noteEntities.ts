import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { NoteEntity } from '@/features/entities/types';

export const noteEntitiesKeys = {
  byNote: (noteId: string) => ['noteEntities', 'byNote', noteId] as const,
};

export function useNoteEntities(noteId: string) {
  return useQuery<NoteEntity[], Error>({
    queryKey: noteEntitiesKeys.byNote(noteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('note_entities')
        .select('*')
        .eq('note_id', noteId);
      if (error) throw error;
      return (data ?? []) as NoteEntity[];
    },
    enabled: !!noteId,
  });
}

export function useTagEntity() {
  const qc = useQueryClient();
  return useMutation<
    NoteEntity,
    Error,
    { noteId: string; entityId: string; ownerId: string }
  >({
    mutationFn: async ({ noteId, entityId, ownerId }) => {
      const { data, error } = await supabase
        .from('note_entities')
        .insert({
          note_id: noteId,
          entity_id: entityId,
          owner_id: ownerId,
          pinned_manually: true,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as NoteEntity;
    },
    onSuccess: (ne) => {
      void qc.invalidateQueries({ queryKey: noteEntitiesKeys.byNote(ne.note_id) });
    },
  });
}

export function useUntagEntity() {
  const qc = useQueryClient();
  return useMutation<
    { noteId: string; entityId: string },
    Error,
    { noteId: string; entityId: string }
  >({
    mutationFn: async ({ noteId, entityId }) => {
      const { error } = await supabase
        .from('note_entities')
        .delete()
        .eq('note_id', noteId)
        .eq('entity_id', entityId);
      if (error) throw error;
      return { noteId, entityId };
    },
    onSuccess: ({ noteId }) => {
      void qc.invalidateQueries({ queryKey: noteEntitiesKeys.byNote(noteId) });
    },
  });
}
