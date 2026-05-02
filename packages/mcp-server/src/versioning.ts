// Pure entity-version resolution helpers, ported from
// src/features/entities/versioning.ts. The agent never needs the React Query
// machinery — only the pure walk over rows. Keeping a copy here avoids a
// browser/Node coupling and a TS path-mapping setup for one function.

export type FieldKind = "string" | "text" | "int" | "bool";
export type FieldDef = { name: string; kind: FieldKind };
export type FieldValue = string | number | boolean | null;
export type Snapshot = Record<string, FieldValue>;

export type EntityVersionRow = {
  id: string;
  entity_id: string;
  valid_from_rank: string;
  snapshot: Snapshot | null;
  source_event_id: string | null;
  source_note_id: string | null;
  note_excerpt: string | null;
  created_at: string;
};

export const CURRENT_RANK_SENTINEL = "~current";

/**
 * Per-field resolution: each field walks the version list independently and
 * picks the row with the largest `valid_from_rank` ≤ `rank` that explicitly
 * sets that field. Fields never set return null.
 */
export function resolveSnapshotMapAtRank(
  versions: EntityVersionRow[],
  rank: string,
  fields: FieldDef[],
): Snapshot {
  const out: Snapshot = {};
  const isCurrent = rank === CURRENT_RANK_SENTINEL;
  for (const f of fields) {
    let best: EntityVersionRow | null = null;
    for (const v of versions) {
      if (!isCurrent && v.valid_from_rank > rank) continue;
      const snap = (v.snapshot ?? {}) as Snapshot;
      if (!(f.name in snap)) continue;
      if (!best || v.valid_from_rank > best.valid_from_rank) best = v;
    }
    if (best) out[f.name] = best.snapshot![f.name] ?? null;
  }
  return out;
}
