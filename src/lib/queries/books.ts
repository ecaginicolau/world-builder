import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nextRankAfter } from '@/lib/ranks';
import type { Book } from '@/features/chapters/types';

export const booksKeys = {
  byWorld: (worldId: string) => ['books', 'byWorld', worldId] as const,
  detail: (id: string) => ['books', 'detail', id] as const,
};

export function useBooks(worldId: string) {
  return useQuery<Book[], Error>({
    queryKey: booksKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('world_id', worldId)
        .order('rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Book[];
    },
    enabled: !!worldId,
  });
}

export function useBook(bookId: string) {
  return useQuery<Book, Error>({
    queryKey: booksKeys.detail(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      if (error) throw error;
      return data as Book;
    },
    enabled: !!bookId,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation<Book, Error, { worldId: string; ownerId: string; title: string }>({
    mutationFn: async ({ worldId, ownerId, title }) => {
      const { data: existing, error: selErr } = await supabase
        .from('books')
        .select('rank')
        .eq('world_id', worldId);
      if (selErr) throw selErr;
      const rank = nextRankAfter(existing ?? []);
      const { data, error } = await supabase
        .from('books')
        .insert({ world_id: worldId, owner_id: ownerId, title: title.trim(), rank })
        .select('*')
        .single();
      if (error) throw error;
      return data as Book;
    },
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: booksKeys.byWorld(b.world_id) });
    },
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation<
    Book,
    Error,
    {
      id: string;
      title?: string;
      seriesTitle?: string | null;
      description?: string | null;
      backCover?: string | null;
    }
  >({
    mutationFn: async ({ id, title, seriesTitle, description, backCover }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title.trim();
      if (seriesTitle !== undefined) patch.series_title = seriesTitle;
      if (description !== undefined) patch.description = description;
      if (backCover !== undefined) patch.back_cover = backCover;
      const { data, error } = await supabase
        .from('books')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Book;
    },
    onSuccess: (b) => {
      qc.setQueryData(booksKeys.detail(b.id), b);
      void qc.invalidateQueries({ queryKey: booksKeys.byWorld(b.world_id) });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation<{ id: string; worldId: string }, Error, { id: string; worldId: string }>({
    mutationFn: async ({ id, worldId }) => {
      const { error } = await supabase.from('books').delete().eq('id', id);
      if (error) throw error;
      return { id, worldId };
    },
    onSuccess: ({ worldId }) => {
      void qc.invalidateQueries({ queryKey: booksKeys.byWorld(worldId) });
    },
  });
}
