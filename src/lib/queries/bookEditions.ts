import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BookEdition } from '@/features/chapters/types';

export const bookEditionsKeys = {
  byBook: (bookId: string) => ['book_editions', 'byBook', bookId] as const,
  detail: (id: string) => ['book_editions', 'detail', id] as const,
};

export function useBookEditions(bookId: string) {
  return useQuery<BookEdition[], Error>({
    queryKey: bookEditionsKeys.byBook(bookId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_editions')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookEdition[];
    },
    enabled: !!bookId,
  });
}

/**
 * Sensible default for a brand-new edition: Trade paperback 6×9, Garamond 11pt,
 * mirror margins biased toward the gutter, justified, alternating headers,
 * page numbers on the outside, illustrations on. Mirrors the `default` clauses
 * in V019 — kept in code as well for the create form.
 */
export function defaultEditionDraft(name = '6×9 — Trade paperback'): Omit<
  BookEdition,
  'id' | 'book_id' | 'world_id' | 'owner_id' | 'created_at' | 'updated_at'
> {
  return {
    name,
    trim_width_mm: 152.4,
    trim_height_mm: 228.6,
    margin_inside_mm: 19,
    margin_outside_mm: 13,
    margin_top_mm: 19,
    margin_bottom_mm: 19,
    body_font: 'EB Garamond',
    body_font_size_pt: 11,
    body_line_height: 1.4,
    body_justify: true,
    paragraph_indent_mm: 4,
    chapter_title_font: 'EB Garamond',
    chapter_title_size_pt: 18,
    chapter_title_bold: true,
    chapter_title_italic: false,
    chapter_title_align: 'center',
    drop_cap: false,
    header_mode: 'alternating',
    header_show_on_chapter_first_page: false,
    header_font: 'EB Garamond',
    header_size_pt: 9,
    header_italic: true,
    footer_page_numbers: true,
    footer_position: 'outside',
    footer_show_on_chapter_first_page: true,
    footer_font: 'EB Garamond',
    footer_size_pt: 9,
    chapter_header_font: 'EB Garamond',
    chapter_header_size_pt: 10,
    chapter_header_italic: true,
    chapter_header_align: 'center',
    chapter_footer_font: 'EB Garamond',
    chapter_footer_size_pt: 10,
    chapter_footer_italic: true,
    chapter_footer_align: 'center',
    chapter_starts_on_recto: true,
    include_illustrations: true,
    image_brightness: 100,
    image_contrast: 100,
    image_grayscale: false,
  };
}

interface CreateBookEditionInput {
  bookId: string;
  worldId: string;
  ownerId: string;
  draft: Omit<BookEdition, 'id' | 'book_id' | 'world_id' | 'owner_id' | 'created_at' | 'updated_at'>;
}

export function useCreateBookEdition() {
  const qc = useQueryClient();
  return useMutation<BookEdition, Error, CreateBookEditionInput>({
    mutationFn: async ({ bookId, worldId, ownerId, draft }) => {
      const { data, error } = await supabase
        .from('book_editions')
        .insert({
          book_id: bookId,
          world_id: worldId,
          owner_id: ownerId,
          ...draft,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as BookEdition;
    },
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: bookEditionsKeys.byBook(e.book_id) });
    },
  });
}

export function useUpdateBookEdition() {
  const qc = useQueryClient();
  return useMutation<
    BookEdition,
    Error,
    { id: string; patch: Partial<Omit<BookEdition, 'id' | 'book_id' | 'world_id' | 'owner_id' | 'created_at' | 'updated_at'>> }
  >({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await supabase
        .from('book_editions')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as BookEdition;
    },
    onSuccess: (e) => {
      qc.setQueryData(bookEditionsKeys.detail(e.id), e);
      void qc.invalidateQueries({ queryKey: bookEditionsKeys.byBook(e.book_id) });
    },
  });
}

export function useDeleteBookEdition() {
  const qc = useQueryClient();
  return useMutation<{ id: string; bookId: string }, Error, { id: string; bookId: string }>({
    mutationFn: async ({ id, bookId }) => {
      const { error } = await supabase.from('book_editions').delete().eq('id', id);
      if (error) throw error;
      return { id, bookId };
    },
    onSuccess: ({ bookId }) => {
      void qc.invalidateQueries({ queryKey: bookEditionsKeys.byBook(bookId) });
    },
  });
}
