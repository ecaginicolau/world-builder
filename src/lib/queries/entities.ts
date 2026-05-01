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

export const entityKeys = {
  detail: (id: string) => ['entity', 'detail', id] as const,
};

export function useEntity(entityId: string) {
  return useQuery<Entity, Error>({
    queryKey: entityKeys.detail(entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('id', entityId)
        .single();
      if (error) throw error;
      return data as Entity;
    },
    enabled: !!entityId,
  });
}

export function useUpdateEntity() {
  const qc = useQueryClient();
  return useMutation<
    Entity,
    Error,
    {
      id: string;
      worldId: string;
      name?: string;
      entityTypeId?: string;
      aliases?: string[];
      tags?: string[];
    }
  >({
    mutationFn: async ({ id, name, entityTypeId, aliases, tags }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name.trim();
      if (entityTypeId !== undefined) patch.entity_type_id = entityTypeId;
      if (aliases !== undefined) patch.aliases = aliases;
      if (tags !== undefined) patch.tags = tags;
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
      void qc.invalidateQueries({ queryKey: entityKeys.detail(e.id) });
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
