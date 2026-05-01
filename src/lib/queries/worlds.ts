import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ContextLevel, World } from '@/features/worlds/types';
import { DEFAULT_PCC } from '@/features/worlds/types';

export const worldsKeys = {
  all: ['worlds'] as const,
  detail: (id: string) => ['worlds', id] as const,
};

const WORLD_COLS =
  'id, name, description, world_memory, custom_prompt, previous_chapter_context, created_at';

function normalizeWorld(row: Record<string, unknown>): World {
  const raw = row.previous_chapter_context;
  const pcc = Array.isArray(raw)
    ? (raw.filter((x): x is ContextLevel =>
        x === 'raw' || x === 'L' || x === 'M' || x === 'S',
      ))
    : DEFAULT_PCC;
  return { ...(row as unknown as World), previous_chapter_context: pcc };
}

export function useWorlds() {
  return useQuery<World[], Error>({
    queryKey: worldsKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worlds')
        .select(WORLD_COLS)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => normalizeWorld(r as Record<string, unknown>));
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
      return normalizeWorld(data as Record<string, unknown>);
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
      return normalizeWorld(data as Record<string, unknown>);
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
    {
      id: string;
      name?: string;
      description?: string | null;
      world_memory?: string | null;
      custom_prompt?: string | null;
      previousChapterContext?: ContextLevel[];
    }
  >({
    mutationFn: async ({ id, name, description, world_memory, custom_prompt, previousChapterContext }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      if (world_memory !== undefined) patch.world_memory = world_memory;
      if (custom_prompt !== undefined) patch.custom_prompt = custom_prompt;
      if (previousChapterContext !== undefined)
        patch.previous_chapter_context = previousChapterContext;
      const { data, error } = await supabase
        .from('worlds')
        .update(patch)
        .eq('id', id)
        .select(WORLD_COLS)
        .single();
      if (error) throw error;
      return normalizeWorld(data as Record<string, unknown>);
    },
    onSuccess: (world) => {
      qc.setQueryData(worldsKeys.detail(world.id), world);
      void qc.invalidateQueries({ queryKey: worldsKeys.all });
    },
  });
}
