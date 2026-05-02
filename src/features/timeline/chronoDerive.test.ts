import { describe, expect, it } from 'vitest';
import { buildChapterChronoMap, buildEventChaptersMap } from './chronoDerive';
import type { ChapterEvent, TimelineEvent } from './types';
import type { Chapter } from '@/features/chapters/types';

const ev = (id: string, rank: string): TimelineEvent => ({
  id,
  world_id: 'w',
  owner_id: 'o',
  chronological_rank: rank,
  title: id,
  description: null,
  description_html: null,
  tags: [],
  source_note_id: null,
  created_at: '',
  updated_at: '',
});

const ch = (id: string): Chapter => ({
  id,
  part_id: 'p',
  world_id: 'w',
  owner_id: 'o',
  reading_rank: '0',
  title: id,
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
});

const link = (chapterId: string, eventId: string, narrativeRank = '0'): ChapterEvent => ({
  chapter_id: chapterId,
  event_id: eventId,
  world_id: 'w',
  owner_id: 'o',
  narrative_rank: narrativeRank,
  created_at: '',
});

describe('buildChapterChronoMap', () => {
  it('returns empty map when there are no links', () => {
    expect(buildChapterChronoMap([], [ev('e1', 'a')])).toEqual(new Map());
  });

  it('uses the linked event chrono for a chapter with one event', () => {
    const map = buildChapterChronoMap([link('c1', 'e1')], [ev('e1', 'b')]);
    expect(map.get('c1')).toBe('b');
  });

  it('takes the MIN chrono when a chapter retells several events', () => {
    const map = buildChapterChronoMap(
      [link('c1', 'e1'), link('c1', 'e2')],
      [ev('e1', 'b'), ev('e2', 'a')],
    );
    expect(map.get('c1')).toBe('a');
  });

  it('skips links pointing to unknown events', () => {
    const map = buildChapterChronoMap([link('c1', 'missing')], [ev('e1', 'b')]);
    expect(map.has('c1')).toBe(false);
  });
});

describe('buildEventChaptersMap', () => {
  it('returns empty map when there are no links', () => {
    expect(buildEventChaptersMap([], [ch('c1')])).toEqual(new Map());
  });

  it('groups chapters under their linked event', () => {
    const map = buildEventChaptersMap(
      [link('c1', 'e1'), link('c2', 'e1'), link('c1', 'e2')],
      [ch('c1'), ch('c2')],
    );
    expect(map.get('e1')?.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(map.get('e2')?.map((c) => c.id)).toEqual(['c1']);
  });

  it('skips links to unknown chapters', () => {
    const map = buildEventChaptersMap([link('missing', 'e1')], [ch('c1')]);
    expect(map.get('e1')).toBeUndefined();
  });
});
