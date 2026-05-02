import type { EntityVersion, FieldDef, FieldValue, Snapshot } from './types';
import type { Chapter } from '@/features/chapters/types';
import type { TimelineEvent } from '@/features/timeline/types';
import { INIT_RANK } from '@/lib/ranks';

/**
 * Cursor sentinel used by callers that want "the latest known state" without
 * tying themselves to a specific anchor. Lives lexically AFTER any natural
 * rank thanks to the leading '~' (0x7E).
 */
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
  | { kind: 'chapter'; id: string; rank: string; title: string | null; readingRank?: string }
  | { kind: 'event'; id: string; rank: string; title: string };

/**
 * Build a chronologically-sorted list of (rank, label) entries for the rank
 * picker. Events use their own `chronological_rank`. Chapters use their
 * **derived** chrono (= min of linked events' chronological_rank), passed in
 * via `chapterChrono`. Chapters without an entry in `chapterChrono` are
 * excluded — they have no chronological position.
 */
export function buildRankPickerItems(
  chapters: Chapter[],
  events: TimelineEvent[],
  chapterChrono?: Map<string, string>,
): TimelineRankItem[] {
  const items: TimelineRankItem[] = [
    ...events.map(
      (e): TimelineRankItem => ({ kind: 'event', id: e.id, rank: e.chronological_rank, title: e.title }),
    ),
  ];
  if (chapterChrono) {
    for (const c of chapters) {
      const r = chapterChrono.get(c.id);
      if (r === undefined) continue;
      items.push({ kind: 'chapter', id: c.id, rank: r, title: c.title, readingRank: c.reading_rank });
    }
  }
  items.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
  return items;
}

/**
 * Like `buildRankPickerItems` but events-only. Used by the EntityDetailScreen
 * rail since entity_versions can only anchor to events post-(d) — chapter
 * anchors would coincide with their earliest event and offer no editable
 * surface, so we skip them entirely.
 */
export function buildEventRailItems(events: TimelineEvent[]): TimelineRankItem[] {
  return events
    .map((e): TimelineRankItem => ({ kind: 'event', id: e.id, rank: e.chronological_rank, title: e.title }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
}

export function rankPickerLabel(item: TimelineRankItem): string {
  const icon = item.kind === 'chapter' ? '📖' : '📅';
  const title = item.kind === 'chapter' ? item.title ?? '(untitled chapter)' : item.title;
  return `${icon} ${title}`;
}

/**
 * Human label for a `valid_from_rank` value, in the context of the current
 * timeline. Used in the version list ("after 📅 X").
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
 * A point on the entity timeline rail: "initial" (before any chapter/event)
 * or "after an event" (= the state right at the end of that item's window).
 * The "current" anchor was dropped post-(d.x) since it duplicated "after the
 * latest event with a version" — with events as canon and per-field resolution,
 * the rail's last anchor IS the current view.
 */
export type TimelineAnchor =
  | { kind: 'init' }
  | { kind: 'after'; item: TimelineRankItem };

/** Stable id for an anchor — usable as React key and for cursor state. */
export function anchorId(a: TimelineAnchor): string {
  if (a.kind === 'init') return '@init';
  return a.item.rank;
}

export function buildAnchors(items: TimelineRankItem[]): TimelineAnchor[] {
  return [
    { kind: 'init' as const },
    ...items.map((item) => ({ kind: 'after' as const, item })),
  ];
}

export function anchorLabel(a: TimelineAnchor): string {
  if (a.kind === 'init') return 'initial';
  return `after ${rankPickerLabel(a.item)}`;
}

/**
 * Resolve the entity_version anchored at a given anchor (used to find the
 * single row that "lives at" this anchor — for editing, justification display,
 * etc.). For "after X" returns the version whose anchoring rank falls within
 * X's window. For "init" returns the version at INIT_RANK.
 */
export function resolveStateAtAnchor(
  anchor: TimelineAnchor,
  items: TimelineRankItem[],
  versions: EntityVersion[],
): EntityVersion | null {
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
    if (v.valid_from_rank === INIT_RANK) continue;
    if (v.valid_from_rank < anchor.item.rank) continue;
    if (nextRank !== null && v.valid_from_rank >= nextRank) continue;
    if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
  }
  return best;
}

/**
 * For each field, the version that explicitly set it at or before `rank` (with
 * the largest valid_from_rank). `source` is null when the field has never been
 * set — caller treats that as "no value yet".
 *
 * Per-field resolution is the post-(d.x) model: each entity_version stores
 * ONLY the fields that change at its anchor; older fields keep flowing through
 * the timeline until something overrides them.
 */
export interface FieldResolution {
  value: FieldValue;
  source: EntityVersion | null;
}

export function resolveSnapshotAtRank(
  versions: EntityVersion[],
  rank: string,
  fields: FieldDef[],
): Map<string, FieldResolution> {
  const out = new Map<string, FieldResolution>();
  const isCurrent = rank === CURRENT_RANK_SENTINEL;
  for (const f of fields) {
    let best: EntityVersion | null = null;
    for (const v of versions) {
      if (!isCurrent && v.valid_from_rank > rank) continue;
      const snap = (v.snapshot ?? {}) as Snapshot;
      if (!(f.name in snap)) continue;
      if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
    }
    out.set(f.name, {
      value: best ? (best.snapshot[f.name] ?? null) : null,
      source: best,
    });
  }
  return out;
}

/**
 * Convenience: collapse the per-field resolution into a flat snapshot record.
 * Useful for callers that just need name → value (LLM cards, popups).
 */
export function resolveSnapshotMapAtRank(
  versions: EntityVersion[],
  rank: string,
  fields: FieldDef[],
): Snapshot {
  const out: Snapshot = {};
  for (const [k, r] of resolveSnapshotAtRank(versions, rank, fields)) {
    if (r.source !== null) out[k] = r.value;
  }
  return out;
}

/**
 * Same idea as resolveSnapshotAtRank but anchored on a TimelineAnchor — uses
 * the anchor's window upper bound (next timeline item's rank) so updates that
 * happen between this anchor and the next don't leak in.
 */
export function resolveSnapshotAtAnchor(
  anchor: TimelineAnchor,
  items: TimelineRankItem[],
  versions: EntityVersion[],
  fields: FieldDef[],
): Map<string, FieldResolution> {
  if (anchor.kind === 'init') {
    return resolveSnapshotAtRank(versions, INIT_RANK, fields);
  }
  // Find the next timeline item's rank — the upper bound for this anchor's window.
  let nextRank: string | null = null;
  for (const it of items) {
    if (it.rank > anchor.item.rank && (nextRank === null || it.rank < nextRank)) {
      nextRank = it.rank;
    }
  }
  // Pick a cursor strictly less than nextRank but ≥ anchor.item.rank. The
  // simplest is `nextRank` minus epsilon, but lex comparisons make that
  // awkward — instead, walk per-field with the constraint inline.
  const out = new Map<string, FieldResolution>();
  for (const f of fields) {
    let best: EntityVersion | null = null;
    for (const v of versions) {
      if (nextRank !== null && v.valid_from_rank >= nextRank) continue;
      const snap = (v.snapshot ?? {}) as Snapshot;
      if (!(f.name in snap)) continue;
      if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
    }
    out.set(f.name, {
      value: best ? (best.snapshot[f.name] ?? null) : null,
      source: best,
    });
  }
  return out;
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
