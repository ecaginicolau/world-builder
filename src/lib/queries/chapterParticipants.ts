import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ChapterParticipant {
  chapter_id: string;
  entity_id: string;
  owner_id: string;
  created_at: string;
}

export const chapterParticipantsKeys = {
  byChapter: (chapterId: string) =>
    ['chapter_participants', 'byChapter', chapterId] as const,
};

export function useChapterParticipants(chapterId: string) {
  return useQuery<ChapterParticipant[], Error>({
    queryKey: chapterParticipantsKeys.byChapter(chapterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapter_participants')
        .select('*')
        .eq('chapter_id', chapterId);
      if (error) throw error;
      return (data ?? []) as ChapterParticipant[];
    },
    enabled: !!chapterId,
  });
}

export function useLinkChapterEntity() {
  const qc = useQueryClient();
  return useMutation<
    ChapterParticipant,
    Error,
    { chapterId: string; entityId: string; ownerId: string }
  >({
    mutationFn: async ({ chapterId, entityId, ownerId }) => {
      const { data, error } = await supabase
        .from('chapter_participants')
        .insert({
          chapter_id: chapterId,
          entity_id: entityId,
          owner_id: ownerId,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ChapterParticipant;
    },
    onSuccess: (cp) => {
      void qc.invalidateQueries({
        queryKey: chapterParticipantsKeys.byChapter(cp.chapter_id),
      });
    },
  });
}

export function useUnlinkChapterEntity() {
  const qc = useQueryClient();
  return useMutation<
    { chapterId: string; entityId: string },
    Error,
    { chapterId: string; entityId: string }
  >({
    mutationFn: async ({ chapterId, entityId }) => {
      const { error } = await supabase
        .from('chapter_participants')
        .delete()
        .eq('chapter_id', chapterId)
        .eq('entity_id', entityId);
      if (error) throw error;
      return { chapterId, entityId };
    },
    onSuccess: ({ chapterId }) => {
      void qc.invalidateQueries({
        queryKey: chapterParticipantsKeys.byChapter(chapterId),
      });
    },
  });
}
