import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { countWords } from '@/lib/wordCount';

export const chapterWordCountsKeys = {
  byWorld: (worldId: string) => ['chapterWordCounts', 'byWorld', worldId] as const,
};

/**
 * Word counts for every chapter in a world, keyed by chapter id.
 * Reads each chapter's final_version text from chapter_versions.
 */
export function useChapterWordCountsByWorld(worldId: string) {
  return useQuery<Map<string, number>, Error>({
    queryKey: chapterWordCountsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data: chapters, error: chErr } = await supabase
        .from('chapters')
        .select('id, final_version_id')
        .eq('world_id', worldId);
      if (chErr) throw chErr;
      const finalIds = (chapters ?? [])
        .map((c) => c.final_version_id)
        .filter((id): id is string => !!id);
      const out = new Map<string, number>();
      if (finalIds.length === 0) return out;
      const { data: versions, error: vErr } = await supabase
        .from('chapter_versions')
        .select('id, chapter_id, text')
        .in('id', finalIds);
      if (vErr) throw vErr;
      for (const v of versions ?? []) {
        out.set(v.chapter_id as string, countWords(v.text as string));
      }
      return out;
    },
    enabled: !!worldId,
  });
}
