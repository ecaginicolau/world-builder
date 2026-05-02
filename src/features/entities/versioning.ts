import type { EntityVersion, FieldDef, FieldValue, Snapshot } from './types';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from '@/features/timeline/types';
import { INIT_RANK, rankBetween } from '@/lib/ranks';

export const CURRENT_RANK_SENTINEL = '~current';

/**
 * Resolve the entity state at a given rank: the version with the largest
 * `valid_from_rank` such that `valid_from_rank <= rank`. Returns null if no
 * version exists or all versions are after `rank`.
 *
 * Pass `CURRENT_RANK_SENTINEL` to get the latest version (= max rank).
 */
export function resolveStateAtRank(
  versions: EntityVersion[],
  rank: string,
): EntityVersion | null {
  if (versions.length === 0) return null;
  if (rank === CURRENT_RANK_SENTINEL) {
    let best = versions[0];
    for (const v of versions) if (v.valid_from_rank > best.valid_from_rank) best = v;
    return best;
  }
  let best: EntityVersion | null = null;
  for (const v of versions) {
    if (v.valid_from_rank <= rank) {
      if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
    }
  }
  return best;
}

export type TimelineRankItem =
  | { kind: 'chapter'; rank: string; title: string | null; readingRank?: string }
  | { kind: 'event'; rank: string; title: string };

/**
 * Build a chronologically-sorted list of (rank, label) entries from chapters
 * and events. Used for the rank picker dropdown.
 */
export function buildRankPickerItems(
  chapters: Chapter[],
  events: TimelineEvent[],
): TimelineRankItem[] {
  const items: TimelineRankItem[] = [
    ...chapters.map(
      (c): TimelineRankItem => ({
        kind: 'chapter',
        rank: c.chronological_rank,
        title: c.title,
        readingRank: c.reading_rank,
      }),
    ),
    ...events.map(
      (e): TimelineRankItem => ({ kind: 'event', rank: e.chronological_rank, title: e.title }),
    ),
  ];
  items.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  return items;
}

export function rankPickerLabel(item: TimelineRankItem): string {
  const icon = item.kind === 'chapter' ? '📖' : '📅';
  const title = item.kind === 'chapter' ? item.title ?? '(untitled chapter)' : item.title;
  return `${icon} ${title}`;
}

/**
 * Human label for a `valid_from_rank` value, in the context of the current
 * timeline. Used in the version list ("after Chapter 3 — La Forteresse").
 */
export function versionLabelForRank(
  rank: string,
  items: TimelineRankItem[],
): string {
  if (rank === INIT_RANK) return 'initial';
  const exact = items.find((i) => i.rank === rank);
  if (exact) return `at ${rankPickerLabel(exact)}`;
  let before: TimelineRankItem | null = null;
  for (const i of items) {
    if (i.rank < rank) {
      if (!before || i.rank > before.rank) before = i;
    }
  }
  if (before) return `after ${rankPickerLabel(before)}`;
  return 'before timeline start';
}

/**
 * A point on the entity timeline rail: "initial" (before any chapter/event),
 * "after a chapter/event" (resolves to the state right at the end of that
 * item's window), or "current" (latest known state). Used by the rail UI in
 * the entity detail screen.
 */
export type TimelineAnchor =
  | { kind: 'init' }
  | { kind: 'after'; item: TimelineRankItem }
  | { kind: 'current' };

/** Stable id for an anchor — usable as React key and for cursor state. */
export function anchorId(a: TimelineAnchor): string {
  if (a.kind === 'init') return '@init';
  if (a.kind === 'current') return CURRENT_RANK_SENTINEL;
  return a.item.rank;
}

export function buildAnchors(items: TimelineRankItem[]): TimelineAnchor[] {
  return [
    { kind: 'init' as const },
    ...items.map((item) => ({ kind: 'after' as const, item })),
    { kind: 'current' as const },
  ];
}

export function anchorLabel(a: TimelineAnchor): string {
  if (a.kind === 'init') return 'initial';
  if (a.kind === 'current') return '— current —';
  return `after ${rankPickerLabel(a.item)}`;
}

/**
 * Resolve the entity state *at* a given anchor. For "after X", returns the
 * latest version whose `valid_from_rank` is strictly less than the next
 * timeline item's rank (so post-X updates at fractional ranks are included,
 * but the next chapter's own version isn't).
 */
export function resolveStateAtAnchor(
  anchor: TimelineAnchor,
  items: TimelineRankItem[],
  versions: EntityVersion[],
): EntityVersion | null {
  if (anchor.kind === 'current') return resolveStateAtRank(versions, CURRENT_RANK_SENTINEL);
  if (anchor.kind === 'init') {
    let best: EntityVersion | null = null;
    for (const v of versions) {
      if (v.valid_from_rank === INIT_RANK) {
        if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
      }
    }
    return best;
  }
  let nextRank: string | null = null;
  for (const it of items) {
    if (it.rank > anchor.item.rank && (nextRank === null || it.rank < nextRank)) {
      nextRank = it.rank;
    }
  }
  let best: EntityVersion | null = null;
  for (const v of versions) {
    if (nextRank !== null && v.valid_from_rank >= nextRank) continue;
    if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
  }
  return best;
}

/**
 * Group existing versions by which anchor they "live under". A version with
 * `valid_from_rank == INIT_RANK` lives under `init`; one with rank > some
 * timeline item X (and < next item) lives under "after X"; one with
 * `valid_from_rank == X.rank` (legacy data) also lives under "after X" so it
 * doesn't disappear from the rail.
 */
export function versionsByAnchor(
  items: TimelineRankItem[],
  versions: EntityVersion[],
): Map<string, EntityVersion[]> {
  const map = new Map<string, EntityVersion[]>();
  const sortedItems = items.slice().sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  for (const v of versions) {
    let key: string;
    if (v.valid_from_rank === INIT_RANK) {
      key = '@init';
    } else {
      let owner: TimelineRankItem | null = null;
      for (const it of sortedItems) {
        if (it.rank <= v.valid_from_rank) {
          if (!owner || it.rank > owner.rank) owner = it;
        }
      }
      key = owner ? owner.rank : '@init';
    }
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
  return map;
}

/**
 * Compute a fractional rank strictly between `chapterRank` and the next existing
 * rank (in either the timeline or the entity's existing versions). Used when
 * applying an update that takes effect *after* a chapter — the new state
 * resolves for any cursor `> chapterRank` without colliding with an existing
 * version at the same rank.
 */
export function rankAfterChapter(
  chapterRank: string,
  timelineItems: TimelineRankItem[],
  entityVersions: EntityVersion[],
): string {
  let upper: string | null = null;
  for (const it of timelineItems) {
    if (it.rank > chapterRank && (upper === null || it.rank < upper)) upper = it.rank;
  }
  for (const v of entityVersions) {
    if (v.valid_from_rank > chapterRank && (upper === null || v.valid_from_rank < upper)) {
      upper = v.valid_from_rank;
    }
  }
  return rankBetween(chapterRank, upper);
}

/**
 * Coerce a raw form value to the field's typed value.
 * Empty strings → null.
 */
export function coerceFieldValue(kind: FieldDef['kind'], raw: string): FieldValue {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  switch (kind) {
    case 'string':
    case 'text':
      return raw;
    case 'int': {
      const n = Number.parseInt(trimmed, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return trimmed === 'true' || trimmed === '1';
    default:
      return null;
  }
}

/** Format a stored field value for display. */
export function formatFieldValue(value: FieldValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Names of fields that changed between two snapshots. */
export function diffSnapshots(prev: Snapshot, next: Snapshot): string[] {
  const changed = new Set<string>();
  for (const k of Object.keys(next)) {
    if (prev[k] !== next[k]) changed.add(k);
  }
  for (const k of Object.keys(prev)) {
    if (!(k in next)) changed.add(k);
  }
  return Array.from(changed);
}
