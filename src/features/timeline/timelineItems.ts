import { rankBetween } from '@/lib/ranks';
import type { TimelineEvent } from './types';

/**
 * Sort events by `chronological_rank` ASC (lex on the rank string).
 */
export function sortEventsByChrono(events: TimelineEvent[]): TimelineEvent[] {
  return events.slice().sort((a, b) =>
    a.chronological_rank < b.chronological_rank ? -1 :
    a.chronological_rank > b.chronological_rank ? 1 : 0,
  );
}

/** Rank to assign so that items[index] ends up just before items[index-1]. */
export function rankForMoveUp(ranks: string[], index: number): string | null {
  if (index <= 0) return null;
  const prevPrev = index >= 2 ? ranks[index - 2] : null;
  const prev = ranks[index - 1];
  return rankBetween(prevPrev, prev);
}

/** Rank to assign so that items[index] ends up just after items[index+1]. */
export function rankForMoveDown(ranks: string[], index: number): string | null {
  if (index >= ranks.length - 1) return null;
  const next = ranks[index + 1];
  const nextNext = index + 2 < ranks.length ? ranks[index + 2] : null;
  return rankBetween(next, nextNext);
}
