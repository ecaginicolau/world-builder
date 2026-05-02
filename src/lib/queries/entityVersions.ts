import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { INIT_RANK } from '@/lib/ranks';
import type { EntityVersion, FieldValue, Snapshot } from '@/features/entities/types';

export const entityVersionsKeys = {
  byEntity: (entityId: string) => ['entityVersions', 'byEntity', entityId] as const,
  byWorld: (worldId: string) => ['entityVersions', 'byWorld', worldId] as const,
};

export function useEntityVersions(entityId: string) {
  return useQuery<EntityVersion[], Error>({
    queryKey: entityVersionsKeys.byEntity(entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_versions')
        .select('*')
        .eq('entity_id', entityId)
        .order('valid_from_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityVersion[];
    },
    enabled: !!entityId,
  });
}

/** All entity_versions in a world. Used by EntitiesScreen for inline state preview + sort. */
export function useEntityVersionsByWorld(worldId: string) {
  return useQuery<EntityVersion[], Error>({
    queryKey: entityVersionsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_versions')
        .select('*')
        .eq('world_id', worldId)
        .order('valid_from_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityVersion[];
    },
    enabled: !!worldId,
  });
}

interface CreateVersionInput {
  entityId: string;
  worldId: string;
  ownerId: string;
  validFromRank: string;
  snapshot: Snapshot;
  sourceNoteId?: string | null;
  sourceEventId?: string | null;
  noteExcerpt?: string | null;
}

export function useCreateEntityVersion() {
  const qc = useQueryClient();
  return useMutation<EntityVersion, Error, CreateVersionInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('entity_versions')
        .insert({
          entity_id: input.entityId,
          world_id: input.worldId,
          owner_id: input.ownerId,
          valid_from_rank: input.validFromRank,
          snapshot: input.snapshot,
          source_note_id: input.sourceNoteId ?? null,
          source_event_id: input.sourceEventId ?? null,
          note_excerpt: input.noteExcerpt ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityVersion;
    },
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byEntity(v.entity_id) });
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byWorld(v.world_id) });
    },
  });
}

/**
 * Insert the implicit v0 (sentinel rank, empty snapshot) — called before
 * inserting the first real version so that "before this rank" cleanly
 * resolves to nothing. Idempotent thanks to the entity_versions_single_init
 * unique partial index (V012).
 */
export async function ensureInitVersion(args: {
  entityId: string;
  worldId: string;
  ownerId: string;
  existingVersions: EntityVersion[];
}): Promise<void> {
  if (args.existingVersions.some((v) => v.source_event_id === null)) return;
  const { error } = await supabase.from('entity_versions').insert({
    entity_id: args.entityId,
    world_id: args.worldId,
    owner_id: args.ownerId,
    valid_from_rank: INIT_RANK,
    snapshot: {},
  });
  if (error) throw error;
}

/**
 * Upsert a single field on the entity_version anchored at (entityId, eventId).
 * - eventId === null → init version (created if missing, never deleted).
 * - eventId !== null → event-anchored version (created if missing, the
 *   `entity_versions_per_event` unique partial guarantees ≤1 row per pair).
 *
 * `validFromRank` is the rank for a NEW row (ignored if the row exists).
 */
export function useUpsertEntityField() {
  const qc = useQueryClient();
  return useMutation<
    EntityVersion,
    Error,
    {
      entityId: string;
      worldId: string;
      ownerId: string;
      eventId: string | null;
      fieldName: string;
      value: FieldValue;
      validFromRank: string;
      sourceNoteId?: string | null;
    }
  >({
    mutationFn: async (input) => {
      // Race-safe upsert against the entity_versions partial unique indexes
      // (single_init for source_event_id IS NULL, per_event otherwise).
      // We try INSERT first; on a unique violation (parallel blur handlers
      // racing to create the same version), we fall back to fetch + UPDATE
      // with snapshot merge.
      const { data: inserted, error: insErr } = await supabase
        .from('entity_versions')
        .insert({
          entity_id: input.entityId,
          world_id: input.worldId,
          owner_id: input.ownerId,
          valid_from_rank: input.validFromRank,
          snapshot: { [input.fieldName]: input.value },
          source_note_id: input.sourceNoteId ?? null,
          source_event_id: input.eventId,
        })
        .select('*')
        .single();
      if (!insErr && inserted) return inserted as EntityVersion;

      // 23505 = unique_violation. Anything else is a real error.
      const code = (insErr as { code?: string } | null)?.code;
      if (code !== '23505' && insErr) throw insErr;

      // Row exists — fetch and merge.
      let q = supabase
        .from('entity_versions')
        .select('*')
        .eq('entity_id', input.entityId)
        .limit(1);
      q = input.eventId === null
        ? q.is('source_event_id', null)
        : q.eq('source_event_id', input.eventId);
      const { data: existing, error: selErr } = await q;
      if (selErr) throw selErr;
      const row = existing?.[0] as EntityVersion | undefined;
      if (!row) throw new Error('entity_versions: row vanished after unique conflict');

      const nextSnapshot: Snapshot = {
        ...((row.snapshot ?? {}) as Snapshot),
        [input.fieldName]: input.value,
      };
      const { data, error } = await supabase
        .from('entity_versions')
        .update({ snapshot: nextSnapshot })
        .eq('id', row.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityVersion;
    },
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byEntity(v.entity_id) });
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byWorld(v.world_id) });
    },
  });
}

/**
 * Remove a field from the version anchored at (entityId, eventId) → that field
 * falls back to inheritance from earlier versions. If the resulting snapshot is
 * empty and the version is event-anchored, the row is deleted to keep the rail
 * clean. The init version is never deleted (always 1 per entity).
 */
export function useResetEntityField() {
  const qc = useQueryClient();
  return useMutation<
    { entityId: string; worldId: string },
    Error,
    {
      entityId: string;
      worldId: string;
      eventId: string | null;
      fieldName: string;
    }
  >({
    mutationFn: async ({ entityId, worldId, eventId, fieldName }) => {
      let q = supabase
        .from('entity_versions')
        .select('*')
        .eq('entity_id', entityId)
        .limit(1);
      q = eventId === null
        ? q.is('source_event_id', null)
        : q.eq('source_event_id', eventId);
      const { data, error } = await q;
      if (error) throw error;
      const row = data?.[0] as EntityVersion | undefined;
      if (!row) return { entityId, worldId };
      const snap = { ...((row.snapshot ?? {}) as Snapshot) };
      if (!(fieldName in snap)) return { entityId, worldId };
      delete snap[fieldName];
      const isEventAnchored = row.source_event_id !== null;
      if (isEventAnchored && Object.keys(snap).length === 0) {
        const { error: delErr } = await supabase
          .from('entity_versions')
          .delete()
          .eq('id', row.id);
        if (delErr) throw delErr;
      } else {
        const { error: upErr } = await supabase
          .from('entity_versions')
          .update({ snapshot: snap })
          .eq('id', row.id);
        if (upErr) throw upErr;
      }
      return { entityId, worldId };
    },
    onSuccess: ({ entityId, worldId }) => {
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byEntity(entityId) });
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byWorld(worldId) });
    },
  });
}
