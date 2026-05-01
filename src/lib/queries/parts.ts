import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nextRankAfter } from '@/lib/ranks';
import type { Part } from '@/features/chapters/types';

export const partsKeys = {
  byBook: (bookId: string) => ['parts', 'byBook', bookId] as const,
  byWorld: (worldId: string) => ['parts', 'byWorld', worldId] as const,
};

export function usePartsByBook(bookId: string) {
  return useQuery<Part[], Error>({
    queryKey: partsKeys.byBook(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('book_id', bookId)
        .order('rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Part[];
    },
    enabled: !!bookId,
  });
}

export function usePartsByWorld(worldId: string) {
  return useQuery<Part[], Error>({
    queryKey: partsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .eq('world_id', worldId)
        .order('rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Part[];
    },
    enabled: !!worldId,
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation<
    Part,
    Error,
    { worldId: string; bookId: string; ownerId: string; title?: string | null }
  >({
    mutationFn: async ({ worldId, bookId, ownerId, title }) => {
      const { data: existing, error: selErr } = await supabase
        .from('parts')
        .select('rank')
        .eq('book_id', bookId);
      if (selErr) throw selErr;
      const rank = nextRankAfter(existing ?? []);
      const { data, error } = await supabase
        .from('parts')
        .insert({
          world_id: worldId,
          book_id: bookId,
          owner_id: ownerId,
          rank,
          title: title?.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Part;
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: partsKeys.byBook(p.book_id) });
      void qc.invalidateQueries({ queryKey: partsKeys.byWorld(p.world_id) });
    },
  });
}

export function useUpdatePart() {
  const qc = useQueryClient();
  return useMutation<Part, Error, { id: string; title?: string | null }>({
    mutationFn: async ({ id, title }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      const { data, error } = await supabase
        .from('parts')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Part;
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: partsKeys.byBook(p.book_id) });
    },
  });
}

export function useDeletePart() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; bookId: string; worldId: string },
    Error,
    { id: string; bookId: string; worldId: string }
  >({
    mutationFn: async ({ id, bookId, worldId }) => {
      const { error } = await supabase.from('parts').delete().eq('id', id);
      if (error) throw error;
      return { id, bookId, worldId };
    },
    onSuccess: ({ bookId, worldId }) => {
      void qc.invalidateQueries({ queryKey: partsKeys.byBook(bookId) });
      void qc.invalidateQueries({ queryKey: partsKeys.byWorld(worldId) });
    },
  });
}
