import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { INIT_RANK } from '@/lib/ranks';
import type { EntityVersion, Snapshot } from '@/features/entities/types';

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
  sourceChapterId?: string | null;
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
          source_chapter_id: input.sourceChapterId ?? null,
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
 * resolves to nothing.
 */
export async function ensureInitVersion(args: {
  entityId: string;
  worldId: string;
  ownerId: string;
  existingVersions: EntityVersion[];
}): Promise<void> {
  if (args.existingVersions.length > 0) return;
  const { error } = await supabase.from('entity_versions').insert({
    entity_id: args.entityId,
    world_id: args.worldId,
    owner_id: args.ownerId,
    valid_from_rank: INIT_RANK,
    snapshot: {},
  });
  if (error) throw error;
}
