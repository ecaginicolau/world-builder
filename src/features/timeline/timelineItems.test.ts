import { describe, expect, it } from 'vitest';
import {
  mergeTimelineItems,
  rankForMoveDown,
  rankForMoveUp,
  type TimelineItem,
} from './timelineItems';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from './types';

function chapter(id: string, rank: string): Chapter {
  return {
    id,
    part_id: 'p1',
    world_id: 'w1',
    owner_id: 'u1',
    reading_rank: rank,
    chronological_rank: rank,
    title: `chapter-${id}`,
    draft: '',
    content: '',
    summary_s: null,
    summary_m: null,
    summary_l: null,
    status: 'draft',
    published_at: null,
    source_note_id: null,
    created_at: '',
    updated_at: '',
  };
}

function event(id: string, rank: string): TimelineEvent {
  return {
    id,
    world_id: 'w1',
    owner_id: 'u1',
    chronological_rank: rank,
    title: `event-${id}`,
    description: null,
    tags: [],
    source_note_id: null,
    created_at: '',
    updated_at: '',
  };
}

describe('mergeTimelineItems', () => {
  it('returns an empty list when both inputs are empty', () => {
    expect(mergeTimelineItems([], [])).toEqual([]);
  });

  it('sorts chapters and events by chronological_rank', () => {
    const items = mergeTimelineItems(
      [chapter('c1', 'a0'), chapter('c2', 'c0')],
      [event('e1', 'b0')],
    );
    expect(items.map((i) => `${i.kind}:${i.data.id}`)).toEqual([
      'chapter:c1',
      'event:e1',
      'chapter:c2',
    ]);
  });

  it('keeps the kind tag intact', () => {
    const items = mergeTimelineItems([chapter('c1', 'a0')], [event('e1', 'b0')]);
    expect(items[0].kind).toBe('chapter');
    expect(items[1].kind).toBe('event');
  });
});

describe('rankForMoveUp', () => {
  it('returns null when the item is already first', () => {
    const items: TimelineItem[] = mergeTimelineItems([chapter('c1', 'a0')], []);
    expect(rankForMoveUp(items, 0)).toBeNull();
  });

  it('returns a rank that places the item before its previous neighbour', () => {
    const items = mergeTimelineItems(
      [chapter('c1', 'a0'), chapter('c2', 'c0')],
      [event('e1', 'b0')],
    );
    // move e1 (index 1) up: should land before c1 (rank 'a0')
    const newRank = rankForMoveUp(items, 1);
    expect(newRank).not.toBeNull();
    expect(newRank! < 'a0').toBe(true);
  });

  it('places the item between its two predecessors when moving from middle', () => {
    const items = mergeTimelineItems(
      [chapter('c1', 'a0'), chapter('c2', 'b0'), chapter('c3', 'c0')],
      [],
    );
    // move c3 (index 2) up: should land between 'a0' and 'b0'
    const newRank = rankForMoveUp(items, 2);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'a0').toBe(true);
    expect(newRank! < 'b0').toBe(true);
  });
});

describe('rankForMoveDown', () => {
  it('returns null when the item is already last', () => {
    const items = mergeTimelineItems([chapter('c1', 'a0')], []);
    expect(rankForMoveDown(items, 0)).toBeNull();
  });

  it('returns a rank that places the item after its next neighbour', () => {
    const items = mergeTimelineItems(
      [chapter('c1', 'a0'), chapter('c2', 'c0')],
      [event('e1', 'b0')],
    );
    // move e1 (index 1) down: should land after c2 (rank 'c0')
    const newRank = rankForMoveDown(items, 1);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'c0').toBe(true);
  });

  it('places the item between its two successors when moving from middle', () => {
    const items = mergeTimelineItems(
      [chapter('c1', 'a0'), chapter('c2', 'b0'), chapter('c3', 'c0')],
      [],
    );
    // move c1 (index 0) down: should land between 'b0' and 'c0'
    const newRank = rankForMoveDown(items, 0);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'b0').toBe(true);
    expect(newRank! < 'c0').toBe(true);
  });
});
