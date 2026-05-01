import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { World } from '@/features/worlds/types';

export const worldsKeys = {
  all: ['worlds'] as const,
  detail: (id: string) => ['worlds', id] as const,
};

const WORLD_COLS = 'id, name, description, world_memory, created_at';

export function useWorlds() {
  return useQuery<World[], Error>({
    queryKey: worldsKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worlds')
        .select(WORLD_COLS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as World[];
    },
  });
}

export function useWorld(worldId: string) {
  return useQuery<World, Error>({
    queryKey: worldsKeys.detail(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worlds')
        .select(WORLD_COLS)
        .eq('id', worldId)
        .single();
      if (error) throw error;
      return data as World;
    },
    enabled: !!worldId,
  });
}

export function useCreateWorld() {
  const qc = useQueryClient();
  return useMutation<World, Error, { name: string; ownerId: string }>({
    mutationFn: async ({ name, ownerId }) => {
      const { data, error } = await supabase
        .from('worlds')
        .insert({ owner_id: ownerId, name })
        .select(WORLD_COLS)
        .single();
      if (error) throw error;
      return data as World;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: worldsKeys.all });
    },
  });
}

export function useUpdateWorld() {
  const qc = useQueryClient();
  return useMutation<
    World,
    Error,
    { id: string; name?: string; description?: string | null; world_memory?: string | null }
  >({
    mutationFn: async ({ id, name, description, world_memory }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      if (world_memory !== undefined) patch.world_memory = world_memory;
      const { data, error } = await supabase
        .from('worlds')
        .update(patch)
        .eq('id', id)
        .select(WORLD_COLS)
        .single();
      if (error) throw error;
      return data as World;
    },
    onSuccess: (world) => {
      qc.setQueryData(worldsKeys.detail(world.id), world);
      void qc.invalidateQueries({ queryKey: worldsKeys.all });
    },
  });
}
