import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { World } from '@/features/worlds/types';

export const worldsKeys = {
  all: ['worlds'] as const,
  detail: (id: string) => ['worlds', id] as const,
};

export function useWorlds() {
  return useQuery<World[], Error>({
    queryKey: worldsKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worlds')
        .select('id, name, description, created_at')
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
        .select('id, name, description, created_at')
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
        .select('id, name, description, created_at')
        .single();
      if (error) throw error;
      return data as World;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: worldsKeys.all });
    },
  });
}
