import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Entity } from '@/features/entities/types';

export const entitiesKeys = {
  byWorld: (worldId: string) => ['entities', 'byWorld', worldId] as const,
};

export function useEntities(worldId: string) {
  return useQuery<Entity[], Error>({
    queryKey: entitiesKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('world_id', worldId)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entity[];
    },
    enabled: !!worldId,
  });
}

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation<
    Entity,
    Error,
    { worldId: string; ownerId: string; entityTypeId: string; name: string }
  >({
    mutationFn: async ({ worldId, ownerId, entityTypeId, name }) => {
      const { data, error } = await supabase
        .from('entities')
        .insert({
          world_id: worldId,
          owner_id: ownerId,
          entity_type_id: entityTypeId,
          name: name.trim(),
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Entity;
    },
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: entitiesKeys.byWorld(e.world_id) });
    },
  });
}

export function useUpdateEntity() {
  const qc = useQueryClient();
  return useMutation<
    Entity,
    Error,
    { id: string; worldId: string; name?: string; entityTypeId?: string }
  >({
    mutationFn: async ({ id, name, entityTypeId }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name.trim();
      if (entityTypeId !== undefined) patch.entity_type_id = entityTypeId;
      const { data, error } = await supabase
        .from('entities')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as Entity;
    },
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: entitiesKeys.byWorld(e.world_id) });
    },
  });
}

export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation<{ id: string; worldId: string }, Error, { id: string; worldId: string }>({
    mutationFn: async ({ id, worldId }) => {
      const { error } = await supabase.from('entities').delete().eq('id', id);
      if (error) throw error;
      return { id, worldId };
    },
    onSuccess: ({ worldId }) => {
      void qc.invalidateQueries({ queryKey: entitiesKeys.byWorld(worldId) });
    },
  });
}
