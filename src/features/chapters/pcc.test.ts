import { describe, expect, it } from 'vitest';
import { resolvePreviousChapters, formatPccBlock } from './pcc';
import type { Chapter, ChapterVersion } from './types';
import type { ContextLevel } from '@/features/worlds/types';

function chapter(over: Partial<Chapter> & { id: string }): Chapter {
  return {
    id: over.id,
    part_id: 'p1',
    world_id: 'w1',
    owner_id: 'o1',
    reading_rank: over.reading_rank ?? '0',
    title: over.title ?? null,
    final_version_id: over.final_version_id ?? null,
    summary_s: over.summary_s ?? null,
    summary_m: over.summary_m ?? null,
    summary_l: over.summary_l ?? null,
    status: over.status ?? 'draft',
    published_at: null,
    last_analyzed_at: null,
    source_note_id: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function version(id: string, chapterId: string, text: string): ChapterVersion {
  return {
    id,
    chapter_id: chapterId,
    world_id: 'w1',
    owner_id: 'o1',
    rank: '0',
    parent_version_id: null,
    origin: 'draft',
    user_prompt: null,
    text,
    run_id: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

describe('resolvePreviousChapters', () => {
  it('returns empty when no slots configured', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_s: 'sum' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: new Map(),
      slots: [],
    });
    expect(r).toEqual([]);
  });

  it('returns empty when no earlier chapters exist', () => {
    const cur = chapter({ id: 'cur' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur],
      chapterChrono: new Map([['cur', 'a']]),
      finalVersionByChapter: new Map(),
      slots: ['raw', 'L'],
    });
    expect(r).toEqual([]);
  });

  it('returns empty when current chapter has no derived chrono', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_s: 'sum' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['c1', 'a']]),
      finalVersionByChapter: new Map(),
      slots: ['S'],
    });
    expect(r).toEqual([]);
  });

  it('picks the most-recent earlier chapter for slot 0', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_s: 'old' });
    const c2 = chapter({ id: 'c2', summary_s: 'recent' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1, c2],
      chapterChrono: new Map([['cur', 'm'], ['c1', 'a'], ['c2', 'k']]),
      finalVersionByChapter: new Map(),
      slots: ['S'],
    });
    expect(r).toHaveLength(1);
    expect(r[0].chapter.id).toBe('c2');
    expect(r[0].text).toBe('recent');
  });

  it('emits slots in configured order, mapping recent → oldest', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_s: 'one' });
    const c2 = chapter({ id: 'c2', summary_s: 'two' });
    const c3 = chapter({ id: 'c3', summary_s: 'three' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1, c2, c3],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a'], ['c2', 'b'], ['c3', 'c']]),
      finalVersionByChapter: new Map(),
      slots: ['S', 'S', 'S'],
    });
    expect(r.map((x) => x.chapter.id)).toEqual(['c3', 'c2', 'c1']);
  });

  it('uses the final version text for raw level', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1' });
    const fv = new Map<string, ChapterVersion | null>([
      ['c1', version('v1', 'c1', 'final body')],
    ]);
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: fv,
      slots: ['raw'],
    });
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe('final body');
    expect(r[0].usedFallback).toBe(false);
  });

  it('falls back from S → M → L → raw when summaries are missing', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({
      id: 'c1',
      summary_s: null, summary_m: null,
      summary_l: 'long here',
    });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: new Map(),
      slots: ['S'],
    });
    expect(r[0].text).toBe('long here');
    expect(r[0].effectiveLevel).toBe('L');
    expect(r[0].usedFallback).toBe(true);
  });

  it('falls back to raw when no summary is available', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1' });
    const fv = new Map<string, ChapterVersion | null>([
      ['c1', version('v1', 'c1', 'raw body')],
    ]);
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: fv,
      slots: ['L'],
    });
    expect(r[0].text).toBe('raw body');
    expect(r[0].effectiveLevel).toBe('raw');
    expect(r[0].usedFallback).toBe(true);
  });

  it('skips a chapter entirely when no fallback yields content', () => {
    const cur = chapter({ id: 'cur' });
    const empty = chapter({ id: 'empty' });
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, empty],
      chapterChrono: new Map([['cur', 'z'], ['empty', 'a']]),
      finalVersionByChapter: new Map(),
      slots: ['raw'],
    });
    expect(r).toHaveLength(0);
  });

  it('truncates when fewer earlier chapters than slots', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_s: 'one' });
    const fv = new Map<string, ChapterVersion | null>([
      ['c1', version('v1', 'c1', 'final')],
    ]);
    const slots: ContextLevel[] = ['raw', 'L', 'M', 'S'];
    const r = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: fv,
      slots,
    });
    expect(r).toHaveLength(1);
    expect(r[0].chapter.id).toBe('c1');
  });
});

describe('formatPccBlock', () => {
  it('returns empty string for no slots', () => {
    expect(formatPccBlock([])).toBe('');
  });

  it('orders sections oldest → newest in the rendered block', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', title: 'Old', summary_s: 'old' });
    const c2 = chapter({ id: 'c2', title: 'New', summary_s: 'new' });
    const slots = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1, c2],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a'], ['c2', 'b']]),
      finalVersionByChapter: new Map(),
      slots: ['S', 'S'],
    });
    const block = formatPccBlock(slots);
    const oldIdx = block.indexOf('Old');
    const newIdx = block.indexOf('New');
    expect(oldIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(-1);
    expect(oldIdx).toBeLessThan(newIdx);
  });

  it('mentions fallback when used', () => {
    const cur = chapter({ id: 'cur' });
    const c1 = chapter({ id: 'c1', summary_l: 'long' });
    const slots = resolvePreviousChapters({
      current: cur,
      allChapters: [cur, c1],
      chapterChrono: new Map([['cur', 'z'], ['c1', 'a']]),
      finalVersionByChapter: new Map(),
      slots: ['S'],
    });
    const block = formatPccBlock(slots);
    expect(block).toMatch(/fallback from configured S/);
  });
});
