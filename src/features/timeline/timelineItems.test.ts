import { describe, expect, it } from 'vitest';
import { rankForMoveDown, rankForMoveUp, sortEventsByChrono } from './timelineItems';
import type { TimelineEvent } from './types';

function event(id: string, rank: string): TimelineEvent {
  return {
    id,
    world_id: 'w1',
    owner_id: 'u1',
    chronological_rank: rank,
    title: `event-${id}`,
    description: null,
    description_html: null,
    tags: [],
    source_note_id: null,
    created_at: '',
    updated_at: '',
  };
}

describe('sortEventsByChrono', () => {
  it('sorts events by chronological_rank ASC (lex)', () => {
    const sorted = sortEventsByChrono([event('e2', 'b0'), event('e1', 'a0'), event('e3', 'c0')]);
    expect(sorted.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('does not mutate the input', () => {
    const input = [event('e2', 'b0'), event('e1', 'a0')];
    const before = input.map((e) => e.id);
    sortEventsByChrono(input);
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe('rankForMoveUp', () => {
  it('returns null when the item is already first', () => {
    expect(rankForMoveUp(['a0'], 0)).toBeNull();
  });

  it('returns a rank that places the item before its previous neighbour', () => {
    const newRank = rankForMoveUp(['a0', 'b0'], 1);
    expect(newRank).not.toBeNull();
    expect(newRank! < 'a0').toBe(true);
  });

  it('places the item between its two predecessors when moving from middle', () => {
    const newRank = rankForMoveUp(['a0', 'b0', 'c0'], 2);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'a0').toBe(true);
    expect(newRank! < 'b0').toBe(true);
  });
});

describe('rankForMoveDown', () => {
  it('returns null when the item is already last', () => {
    expect(rankForMoveDown(['a0'], 0)).toBeNull();
  });

  it('returns a rank that places the item after its next neighbour', () => {
    const newRank = rankForMoveDown(['a0', 'b0'], 0);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'b0').toBe(true);
  });

  it('places the item between its two successors when moving from middle', () => {
    const newRank = rankForMoveDown(['a0', 'b0', 'c0'], 0);
    expect(newRank).not.toBeNull();
    expect(newRank! > 'b0').toBe(true);
    expect(newRank! < 'c0').toBe(true);
  });
});
