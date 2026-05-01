import type { Chapter, ChapterVersion } from '@/features/chapters/types';
import type { ContextLevel } from '@/features/worlds/types';

export interface PccSlot {
  /** Order in the configured PCC list (0 = most recent slot). */
  index: number;
  /** Configured level for this slot. */
  level: ContextLevel;
  /** Effective level after fallback chain (may differ from level if summary missing). */
  effectiveLevel: ContextLevel;
  chapter: Chapter;
  /** Resolved text for the slot. Empty string only if every fallback was empty. */
  text: string;
  /** True if we had to downgrade because the requested summary was null. */
  usedFallback: boolean;
}

/** Fallback order when a summary is missing for a slot. */
const FALLBACK_CHAIN: Record<ContextLevel, ContextLevel[]> = {
  raw: ['raw'],
  L: ['L', 'M', 'S', 'raw'],
  M: ['M', 'L', 'S', 'raw'],
  S: ['S', 'M', 'L', 'raw'],
};

function textForLevel(
  chapter: Chapter,
  finalText: string | null,
  level: ContextLevel,
): string | null {
  switch (level) {
    case 'raw': {
      const t = (finalText ?? '').trim();
      return t.length > 0 ? t : null;
    }
    case 'L': return chapter.summary_l?.trim() || null;
    case 'M': return chapter.summary_m?.trim() || null;
    case 'S': return chapter.summary_s?.trim() || null;
  }
}

/**
 * Resolves the PCC slots for a given chapter.
 *
 * Picks the chapters with the largest `chronological_rank` strictly less than
 * `current.chronological_rank`, in descending order, up to `slots.length`.
 * For each picked chapter, applies the slot's level — falling back through
 * `FALLBACK_CHAIN` if the requested summary is null.
 *
 * Slots are emitted in the same order as the configured array (slot[0] = most
 * recent chapter, slot[1] = next older, …). If there are fewer eligible
 * chapters than slots, the result is shorter than `slots`.
 */
export function resolvePreviousChapters(args: {
  current: Chapter;
  allChapters: Chapter[];
  finalVersionByChapter: Map<string, ChapterVersion | null>;
  slots: ContextLevel[];
}): PccSlot[] {
  const { current, allChapters, finalVersionByChapter, slots } = args;
  if (slots.length === 0) return [];

  const earlier = allChapters
    .filter((c) => c.id !== current.id && c.chronological_rank < current.chronological_rank)
    .sort((a, b) =>
      a.chronological_rank < b.chronological_rank ? 1 :
      a.chronological_rank > b.chronological_rank ? -1 : 0,
    );

  const result: PccSlot[] = [];
  for (let i = 0; i < slots.length && i < earlier.length; i++) {
    const chapter = earlier[i];
    const level = slots[i];
    const finalText = finalVersionByChapter.get(chapter.id)?.text ?? null;
    let effectiveLevel: ContextLevel = level;
    let text: string | null = null;
    for (const candidate of FALLBACK_CHAIN[level]) {
      const t = textForLevel(chapter, finalText, candidate);
      if (t !== null) {
        effectiveLevel = candidate;
        text = t;
        break;
      }
    }
    if (text === null) continue;
    result.push({
      index: i,
      level,
      effectiveLevel,
      chapter,
      text,
      usedFallback: effectiveLevel !== level,
    });
  }
  return result;
}

/**
 * Format the PCC slots as a markdown block to inject into LLM prompts.
 * Returns an empty string if no slots resolved.
 */
export function formatPccBlock(slots: PccSlot[]): string {
  if (slots.length === 0) return '';
  const sorted = [...slots].sort((a, b) => b.index - a.index);
  const sections = sorted.map((slot) => {
    const title = slot.chapter.title?.trim() || 'Untitled chapter';
    const labelMap: Record<ContextLevel, string> = {
      raw: 'full text',
      L: 'long summary',
      M: 'medium summary',
      S: 'short summary',
    };
    const fallbackNote = slot.usedFallback
      ? ` (fallback from configured ${slot.level})`
      : '';
    return `## "${title}" — ${labelMap[slot.effectiveLevel]}${fallbackNote}\n\n${slot.text}`;
  });
  return `# Previous chapters (chronological order, oldest → newest)\n\n${sections.join('\n\n')}`;
}
