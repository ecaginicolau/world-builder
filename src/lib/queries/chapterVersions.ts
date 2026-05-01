import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { nextRankAfter } from '@/lib/ranks';
import type { ChapterVersion, ChapterVersionOrigin } from '@/features/chapters/types';
import { chaptersKeys } from './chapters';

export const chapterVersionsKeys = {
  byChapter: (chapterId: string) => ['chapterVersions', 'byChapter', chapterId] as const,
};

export function useChapterVersions(chapterId: string) {
  return useQuery<ChapterVersion[], Error>({
    queryKey: chapterVersionsKeys.byChapter(chapterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chapter_versions')
        .select('*')
        .eq('chapter_id', chapterId);
      if (error) throw error;
      // Client-side sort so the byte-wise (case-sensitive) ordering of our
      // fractional-indexing alphabet is respected. Postgres default collation
      // is case-insensitive, which scrambles ranks like '01' / 'U' / 'j'.
      const rows = (data ?? []) as ChapterVersion[];
      return rows.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
    },
    enabled: !!chapterId,
  });
}

interface CreateVersionInput {
  chapterId: string;
  worldId: string;
  ownerId: string;
  origin: ChapterVersionOrigin;
  text: string;
  parentVersionId?: string | null;
  userPrompt?: string | null;
  runId?: string | null;
  /** When true (default), the new version is set as the chapter's final_version_id. */
  makeFinal?: boolean;
  /** Existing versions, used to compute the next rank. */
  existingVersions: { rank: string }[];
}

export function useCreateChapterVersion() {
  const qc = useQueryClient();
  return useMutation<ChapterVersion, Error, CreateVersionInput>({
    mutationFn: async (input) => {
      const rank = nextRankAfter(input.existingVersions);
      const { data, error } = await supabase
        .from('chapter_versions')
        .insert({
          chapter_id: input.chapterId,
          world_id: input.worldId,
          owner_id: input.ownerId,
          rank,
          parent_version_id: input.parentVersionId ?? null,
          origin: input.origin,
          user_prompt: input.userPrompt ?? null,
          text: input.text,
          run_id: input.runId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      const version = data as ChapterVersion;
      const makeFinal = input.makeFinal ?? true;
      if (makeFinal) {
        const { error: upErr } = await supabase
          .from('chapters')
          .update({ final_version_id: version.id })
          .eq('id', input.chapterId);
        if (upErr) throw upErr;
      }
      return version;
    },
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: chapterVersionsKeys.byChapter(v.chapter_id) });
      void qc.invalidateQueries({ queryKey: chaptersKeys.detail(v.chapter_id) });
    },
  });
}

/**
 * Update an existing chapter_version's text in place.
 * App reserves this for the v0 draft only — every other origin should produce
 * a new version via useCreateChapterVersion.
 */
export function useUpdateChapterVersionText() {
  const qc = useQueryClient();
  return useMutation<ChapterVersion, Error, { id: string; chapterId: string; text: string }>({
    mutationFn: async ({ id, text }) => {
      const { data, error } = await supabase
        .from('chapter_versions')
        .update({ text })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as ChapterVersion;
    },
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: chapterVersionsKeys.byChapter(v.chapter_id) });
    },
  });
}
