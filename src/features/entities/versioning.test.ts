import { describe, expect, it } from 'vitest';
import {
  CURRENT_RANK_SENTINEL,
  buildRankPickerItems,
  coerceFieldValue,
  diffSnapshots,
  resolveStateAtRank,
  versionLabelForRank,
} from './versioning';
import type { EntityVersion } from './types';
import { INIT_RANK } from '@/lib/ranks';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from '@/features/timeline/types';

const v = (id: string, rank: string, snapshot: Record<string, unknown> = {}): EntityVersion => ({
  id,
  entity_id: 'e',
  world_id: 'w',
  owner_id: 'o',
  valid_from_rank: rank,
  snapshot: snapshot as EntityVersion['snapshot'],
  source_note_id: null,
  source_chapter_id: null,
  note_excerpt: null,
  created_at: '2026-01-01T00:00:00Z',
});

describe('resolveStateAtRank', () => {
  it('returns null when no versions', () => {
    expect(resolveStateAtRank([], '05')).toBeNull();
  });

  it('returns null when all versions are after rank', () => {
    expect(resolveStateAtRank([v('a', '10')], '05')).toBeNull();
  });

  it('returns the only version when rank matches', () => {
    expect(resolveStateAtRank([v('a', INIT_RANK)], '05')?.id).toBe('a');
  });

  it('picks the most recent version <= rank', () => {
    const versions = [v('a', INIT_RANK), v('b', '03'), v('c', '07')];
    expect(resolveStateAtRank(versions, '05')?.id).toBe('b');
    expect(resolveStateAtRank(versions, '07')?.id).toBe('c');
    expect(resolveStateAtRank(versions, '08')?.id).toBe('c');
    expect(resolveStateAtRank(versions, '02')?.id).toBe('a');
  });

  it('CURRENT_RANK_SENTINEL returns the latest version', () => {
    const versions = [v('a', INIT_RANK), v('c', '07'), v('b', '03')];
    expect(resolveStateAtRank(versions, CURRENT_RANK_SENTINEL)?.id).toBe('c');
  });
});

describe('versionLabelForRank', () => {
  const chapter = (id: string, rank: string, title: string): Chapter =>
    ({
      id,
      part_id: 'p',
      world_id: 'w',
      owner_id: 'o',
      reading_rank: rank,
      chronological_rank: rank,
      title,
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
    }) as Chapter;
  const event = (id: string, rank: string, title: string): TimelineEvent => ({
    id,
    world_id: 'w',
    owner_id: 'o',
    chronological_rank: rank,
    title,
    description: null,
    tags: [],
    source_note_id: null,
    created_at: '',
    updated_at: '',
  });
  const items = buildRankPickerItems(
    [chapter('c1', '03', 'La Forteresse'), chapter('c2', '07', 'Le Retour')],
    [event('e1', '05', 'La Bataille')],
  );

  it('returns "initial" for INIT_RANK', () => {
    expect(versionLabelForRank(INIT_RANK, items)).toBe('initial');
  });

  it('returns "at X" when rank matches an item', () => {
    expect(versionLabelForRank('05', items)).toContain('La Bataille');
    expect(versionLabelForRank('05', items).startsWith('at')).toBe(true);
  });

  it('returns "after X" when rank falls between items', () => {
    expect(versionLabelForRank('06', items)).toContain('La Bataille');
    expect(versionLabelForRank('06', items).startsWith('after')).toBe(true);
  });

  it('returns "before timeline start" when rank is before everything', () => {
    expect(versionLabelForRank('01', items)).toBe('before timeline start');
  });
});

describe('buildRankPickerItems', () => {
  it('sorts chapters and events together by chronological_rank', () => {
    const items = buildRankPickerItems(
      [
        {
          id: 'c1',
          part_id: 'p',
          world_id: 'w',
          owner_id: 'o',
          reading_rank: '07',
          chronological_rank: '07',
          title: 'C2',
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
        } as Chapter,
      ],
      [
        {
          id: 'e1',
          world_id: 'w',
          owner_id: 'o',
          chronological_rank: '03',
          title: 'E1',
          description: null,
          tags: [],
          source_note_id: null,
          created_at: '',
          updated_at: '',
        },
      ],
    );
    expect(items.map((i) => i.rank)).toEqual(['03', '07']);
    expect(items[0].kind).toBe('event');
    expect(items[1].kind).toBe('chapter');
  });
});

describe('coerceFieldValue', () => {
  it('returns null for empty string', () => {
    expect(coerceFieldValue('string', '')).toBeNull();
    expect(coerceFieldValue('int', '   ')).toBeNull();
  });

  it('parses ints', () => {
    expect(coerceFieldValue('int', '42')).toBe(42);
    expect(coerceFieldValue('int', '17 years')).toBe(17);
    expect(coerceFieldValue('int', 'abc')).toBeNull();
  });

  it('parses bools', () => {
    expect(coerceFieldValue('bool', 'true')).toBe(true);
    expect(coerceFieldValue('bool', 'false')).toBe(false);
    expect(coerceFieldValue('bool', '1')).toBe(true);
    expect(coerceFieldValue('bool', '0')).toBe(false);
  });

  it('returns string as-is for string and text', () => {
    expect(coerceFieldValue('string', 'hello')).toBe('hello');
    expect(coerceFieldValue('text', 'multi\nline')).toBe('multi\nline');
  });
});

describe('diffSnapshots', () => {
  it('returns added, removed, changed keys', () => {
    expect(diffSnapshots({ a: 1 }, { a: 1, b: 2 }).sort()).toEqual(['b']);
    expect(diffSnapshots({ a: 1, b: 2 }, { a: 1 }).sort()).toEqual(['b']);
    expect(diffSnapshots({ a: 1 }, { a: 2 }).sort()).toEqual(['a']);
  });

  it('returns [] for identical snapshots', () => {
    expect(diffSnapshots({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([]);
  });
});
