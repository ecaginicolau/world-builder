import { rankBetween } from '@/lib/ranks';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from './types';

export type TimelineItem =
  | { kind: 'chapter'; data: Chapter; rank: string }
  | { kind: 'event'; data: TimelineEvent; rank: string };

/**
 * Merge chapters and events into a single list, sorted by chronological_rank ASC.
 * Lexicographic comparison on the rank string (fractional indexing already
 * sorts correctly that way).
 */
export function mergeTimelineItems(
  chapters: Chapter[],
  events: TimelineEvent[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...chapters.map((c) => ({
      kind: 'chapter' as const,
      data: c,
      rank: c.chronological_rank,
    })),
    ...events.map((e) => ({
      kind: 'event' as const,
      data: e,
      rank: e.chronological_rank,
    })),
  ];
  items.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  return items;
}

/** Rank to assign to items[index] so it ends up just before items[index-1]. */
export function rankForMoveUp(items: TimelineItem[], index: number): string | null {
  if (index <= 0) return null;
  const prevPrev = index >= 2 ? items[index - 2].rank : null;
  const prev = items[index - 1].rank;
  return rankBetween(prevPrev, prev);
}

/** Rank to assign to items[index] so it ends up just after items[index+1]. */
export function rankForMoveDown(items: TimelineItem[], index: number): string | null {
  if (index >= items.length - 1) return null;
  const next = items[index + 1].rank;
  const nextNext = index + 2 < items.length ? items[index + 2].rank : null;
  return rankBetween(next, nextNext);
}
