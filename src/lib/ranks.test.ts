import { describe, expect, it } from 'vitest';
import { rankBetween, nextRankAfter, START_RANK, END_RANK } from './ranks';

describe('ranks', () => {
  it('returns a value between two adjacent ranks', () => {
    const a = 'a0';
    const b = 'a1';
    const mid = rankBetween(a, b);
    expect(mid > a).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('handles open-left (null lower bound)', () => {
    const r = rankBetween(null, 'b0');
    expect(r < 'b0').toBe(true);
  });

  it('handles open-right (null upper bound)', () => {
    const r = rankBetween('m0', null);
    expect(r > 'm0').toBe(true);
  });

  it('produces strictly increasing sequence on repeated append', () => {
    let prev: string | null = null;
    const seq: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = rankBetween(prev, null);
      seq.push(r);
      prev = r;
    }
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i] > seq[i - 1]).toBe(true);
    }
  });

  it('produces strictly decreasing sequence on repeated prepend', () => {
    let next: string | null = null;
    const seq: string[] = [];
    for (let i = 0; i < 50; i++) {
      const r = rankBetween(null, next);
      seq.push(r);
      next = r;
    }
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i] < seq[i - 1]).toBe(true);
    }
  });

  it('nextRankAfter on empty list returns START_RANK', () => {
    expect(nextRankAfter([])).toBe(START_RANK);
  });

  it('nextRankAfter on a single item returns a rank greater than it', () => {
    const r = nextRankAfter([{ rank: 'm0' }]);
    expect(r > 'm0').toBe(true);
  });

  it('nextRankAfter picks the max regardless of input order', () => {
    const r = nextRankAfter([{ rank: 'b0' }, { rank: 'a0' }, { rank: 'c0' }]);
    expect(r > 'c0').toBe(true);
  });

  it('subdivides repeatedly between two close values', () => {
    let lo = START_RANK;
    const hi = END_RANK;
    for (let i = 0; i < 20; i++) {
      const mid = rankBetween(lo, hi);
      expect(mid > lo).toBe(true);
      expect(mid < hi).toBe(true);
      lo = mid;
    }
  });
});
