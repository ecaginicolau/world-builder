import type { EntityVersion, FieldDef, FieldValue, Snapshot } from './types';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from '@/features/timeline/types';
import { INIT_RANK } from '@/lib/ranks';

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
