import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EntityType } from '@/features/entities/types';

export const entityTypesKeys = {
  byWorld: (worldId: string) => ['entityTypes', 'byWorld', worldId] as const,
};

export function useEntityTypes(worldId: string) {
  return useQuery<EntityType[], Error>({
    queryKey: entityTypesKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_types')
        .select('*')
        .eq('world_id', worldId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityType[];
    },
    enabled: !!worldId,
  });
}

export function useCreateEntityType() {
  const qc = useQueryClient();
  return useMutation<
    EntityType,
    Error,
    { worldId: string; ownerId: string; name: string; color?: string | null }
  >({
    mutationFn: async ({ worldId, ownerId, name, color }) => {
      const { data, error } = await supabase
        .from('entity_types')
        .insert({
          world_id: worldId,
          owner_id: ownerId,
          name: name.trim(),
          color: color ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityType;
    },
    onSuccess: (et) => {
      void qc.invalidateQueries({ queryKey: entityTypesKeys.byWorld(et.world_id) });
    },
  });
}

export function useUpdateEntityType() {
  const qc = useQueryClient();
  return useMutation<
    EntityType,
    Error,
    { id: string; worldId: string; name?: string; color?: string | null }
  >({
    mutationFn: async ({ id, name, color }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (color !== undefined) patch.color = color;
      const { data, error } = await supabase
        .from('entity_types')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityType;
    },
    onSuccess: (et) => {
      void qc.invalidateQueries({ queryKey: entityTypesKeys.byWorld(et.world_id) });
    },
  });
}

export function useDeleteEntityType() {
  const qc = useQueryClient();
  return useMutation<{ id: string; worldId: string }, Error, { id: string; worldId: string }>({
    mutationFn: async ({ id, worldId }) => {
      const { error } = await supabase.from('entity_types').delete().eq('id', id);
      if (error) throw error;
      return { id, worldId };
    },
    onSuccess: ({ worldId }) => {
      void qc.invalidateQueries({ queryKey: entityTypesKeys.byWorld(worldId) });
    },
  });
}
