import { describe, expect, it } from 'vitest';
import {
  CURRENT_RANK_SENTINEL,
  buildEventRailItems,
  buildRankPickerItems,
  coerceFieldValue,
  diffSnapshots,
  resolveSnapshotAtAnchor,
  resolveSnapshotAtRank,
  resolveSnapshotMapAtRank,
  resolveStateAtRank,
  versionLabelForRank,
  type TimelineAnchor,
} from './versioning';
import type { EntityVersion, FieldDef, Snapshot } from './types';
import { INIT_RANK } from '@/lib/ranks';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from '@/features/timeline/types';

const v = (id: string, rank: string, snapshot: Record<string, unknown> = {}): EntityVersion => ({
  id,
  entity_id: 'e',
  world_id: 'w',
  owner_id: 'o',
  valid_from_rank: rank,
  snapshot: snapshot as Snapshot,
  source_note_id: null,
  source_event_id: null,
  note_excerpt: null,
  created_at: '2026-01-01T00:00:00Z',
});

const F: FieldDef[] = [
  { name: 'age', kind: 'int' },
  { name: 'bio', kind: 'string' },
];

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

describe('resolveSnapshotAtRank (per-field)', () => {
  it('returns null source when the field has never been set', () => {
    const versions = [v('a', INIT_RANK, { bio: 'femme' })];
    const r = resolveSnapshotAtRank(versions, '05', F);
    expect(r.get('age')?.source).toBeNull();
    expect(r.get('age')?.value).toBeNull();
  });

  it('walks per-field and picks the latest explicit set ≤ rank', () => {
    const versions = [
      v('a', INIT_RANK, { age: 20, bio: 'femme' }),
      v('b', '05', { age: 21 }), // age changes here
      v('c', '08', { bio: 'femme, baronne' }), // bio changes later
    ];
    // At rank '03' (before any event): inherit init
    expect(resolveSnapshotAtRank(versions, '03', F).get('age')?.value).toBe(20);
    expect(resolveSnapshotAtRank(versions, '03', F).get('bio')?.value).toBe('femme');
    // At rank '06' (after b but before c): age=21 from b, bio still inherited from init
    expect(resolveSnapshotAtRank(versions, '06', F).get('age')?.value).toBe(21);
    expect(resolveSnapshotAtRank(versions, '06', F).get('age')?.source?.id).toBe('b');
    expect(resolveSnapshotAtRank(versions, '06', F).get('bio')?.value).toBe('femme');
    expect(resolveSnapshotAtRank(versions, '06', F).get('bio')?.source?.id).toBe('a');
    // At rank '09' (after c): age=21 from b, bio updated by c
    expect(resolveSnapshotAtRank(versions, '09', F).get('bio')?.value).toBe('femme, baronne');
    expect(resolveSnapshotAtRank(versions, '09', F).get('bio')?.source?.id).toBe('c');
  });

  it('CURRENT_RANK_SENTINEL picks the latest set per field', () => {
    const versions = [
      v('a', INIT_RANK, { age: 20 }),
      v('b', '05', { age: 21 }),
      v('c', '08', { bio: 'baronne' }),
    ];
    const r = resolveSnapshotAtRank(versions, CURRENT_RANK_SENTINEL, F);
    expect(r.get('age')?.value).toBe(21);
    expect(r.get('bio')?.value).toBe('baronne');
  });

  it('an empty {} version contributes nothing', () => {
    const versions = [v('a', INIT_RANK, { age: 20 }), v('b', '05', {})];
    expect(resolveSnapshotAtRank(versions, '06', F).get('age')?.source?.id).toBe('a');
  });
});

describe('resolveSnapshotMapAtRank', () => {
  it('returns a flat record without keys for unset fields', () => {
    const versions = [v('a', INIT_RANK, { bio: 'femme' })];
    const m = resolveSnapshotMapAtRank(versions, '05', F);
    expect(m.bio).toBe('femme');
    expect('age' in m).toBe(false);
  });
});

describe('resolveSnapshotAtAnchor', () => {
  const ev = (id: string, rank: string): TimelineEvent => ({
    id, world_id: 'w', owner_id: 'o', chronological_rank: rank, title: id,
    description: null, description_html: null, tags: [], source_note_id: null,
    created_at: '', updated_at: '',
  });
  const items = buildEventRailItems([ev('e1', '03'), ev('e2', '07')]);

  it('init anchor returns the init snapshot only', () => {
    const versions = [
      v('a', INIT_RANK, { age: 20, bio: 'femme' }),
      v('b', '03', { age: 21 }),
    ];
    const r = resolveSnapshotAtAnchor({ kind: 'init' }, items, versions, F);
    expect(r.get('age')?.value).toBe(20);
    expect(r.get('age')?.source?.id).toBe('a');
  });

  it('after X anchor uses next item rank as upper bound', () => {
    const versions = [
      v('a', INIT_RANK, { age: 20 }),
      v('b', '03', { age: 21 }),
      v('c', '07', { age: 22 }),
    ];
    const anchor: TimelineAnchor = { kind: 'after', item: items[0] };
    const r = resolveSnapshotAtAnchor(anchor, items, versions, F);
    // At "after e1" we should see age=21 (from b at rank 03), not 22 (from c at 07).
    expect(r.get('age')?.value).toBe(21);
    expect(r.get('age')?.source?.id).toBe('b');
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
      title,
      final_version_id: null,
      summary_s: null,
      summary_m: null,
      summary_l: null,
      status: 'draft',
      published_at: null,
      last_analyzed_at: null,
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
    description_html: null,
    tags: [],
    source_note_id: null,
    created_at: '',
    updated_at: '',
  });
  const chapterChrono = new Map<string, string>([
    ['c1', '03'],
    ['c2', '07'],
  ]);
  const items = buildRankPickerItems(
    [chapter('c1', '03', 'La Forteresse'), chapter('c2', '07', 'Le Retour')],
    [event('e1', '05', 'La Bataille')],
    chapterChrono,
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

describe('buildEventRailItems', () => {
  const ev = (id: string, rank: string): TimelineEvent => ({
    id, world_id: 'w', owner_id: 'o', chronological_rank: rank, title: id,
    description: null, description_html: null, tags: [], source_note_id: null,
    created_at: '', updated_at: '',
  });

  it('skips chapters and sorts events by rank', () => {
    const items = buildEventRailItems([ev('e2', 'b'), ev('e1', 'a')]);
    expect(items.map((i) => i.id)).toEqual(['e1', 'e2']);
    expect(items.every((i) => i.kind === 'event')).toBe(true);
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
