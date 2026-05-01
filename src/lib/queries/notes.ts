import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Note } from '@/features/notes/types';

export const notesKeys = {
  byWorld: (worldId: string) => ['notes', 'byWorld', worldId] as const,
  detail: (noteId: string) => ['notes', 'detail', noteId] as const,
};

export function useNotes(worldId: string) {
  return useQuery<Note[], Error>({
    queryKey: notesKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error, status } = await supabase
        .from('notes')
        .select('*')
        .eq('world_id', worldId)
        .eq('status', 'open')
        .order('updated_at', { ascending: false });
      if (error) {
        const e = new Error(`${error.message} (status ${status})`);
        (e as Error & { code?: string }).code = error.code;
        throw e;
      }
      return (data ?? []) as Note[];
    },
    enabled: !!worldId,
  });
}

export function useNote(noteId: string) {
  return useQuery<Note, Error>({
    queryKey: notesKeys.detail(noteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .single();
      if (error) throw error;
      return data as Note;
    },
    enabled: !!noteId,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation<
    Note,
    Error,
    { worldId: string; ownerId: string; title?: string | null; content?: string }
  >({
    mutationFn: async ({ worldId, ownerId, title, content }) => {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          world_id: worldId,
          owner_id: ownerId,
          title: title ?? null,
          content: content ?? '',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (note) => {
      void qc.invalidateQueries({ queryKey: notesKeys.byWorld(note.world_id) });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation<
    Note,
    Error,
    { id: string; title?: string | null; content?: string }
  >({
    mutationFn: async ({ id, title, content }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      const { data, error } = await supabase
        .from('notes')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: (note) => {
      qc.setQueryData(notesKeys.detail(note.id), note);
      void qc.invalidateQueries({ queryKey: notesKeys.byWorld(note.world_id) });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation<{ id: string; worldId: string }, Error, { id: string; worldId: string }>({
    mutationFn: async ({ id, worldId }) => {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      if (error) throw error;
      return { id, worldId };
    },
    onSuccess: ({ worldId }) => {
      void qc.invalidateQueries({ queryKey: notesKeys.byWorld(worldId) });
    },
  });
}
