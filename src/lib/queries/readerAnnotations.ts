import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ReaderAnnotationRow {
  id: string;
  share_link_id: string;
  reader_session_id: string;
  chapter_id: string;
  kind: 'up' | 'down' | 'comment';
  selected_text: string;
  before_ctx: string;
  after_ctx: string;
  comment_body: string | null;
  created_at: string;
}

export const readerAnnotationsKeys = {
  byLink: (linkId: string) => ['readerAnnotations', 'byLink', linkId] as const,
  byChapter: (chapterId: string) => ['readerAnnotations', 'byChapter', chapterId] as const,
};

export function useReaderAnnotationsByLink(linkId: string) {
  return useQuery<ReaderAnnotationRow[], Error>({
    queryKey: readerAnnotationsKeys.byLink(linkId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reader_annotations')
        .select('*')
        .eq('share_link_id', linkId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReaderAnnotationRow[];
    },
    enabled: !!linkId,
  });
}

export function useReaderAnnotationsByChapter(chapterId: string) {
  return useQuery<ReaderAnnotationRow[], Error>({
    queryKey: readerAnnotationsKeys.byChapter(chapterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reader_annotations')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReaderAnnotationRow[];
    },
    enabled: !!chapterId,
  });
}

export function useDeleteReaderAnnotation() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; chapterId: string; linkId: string },
    Error,
    { id: string; chapterId: string; linkId: string }
  >({
    mutationFn: async ({ id, chapterId, linkId }) => {
      const { error } = await supabase.from('reader_annotations').delete().eq('id', id);
      if (error) throw error;
      return { id, chapterId, linkId };
    },
    onSuccess: ({ chapterId, linkId }) => {
      void qc.invalidateQueries({ queryKey: readerAnnotationsKeys.byLink(linkId) });
      void qc.invalidateQueries({ queryKey: readerAnnotationsKeys.byChapter(chapterId) });
    },
  });
}
