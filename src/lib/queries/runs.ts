import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type RunKind =
  | 'chat'
  | 'auto_extract'
  | 'upscale'
  | 'propose_updates'
  | 'summarize';

export type RunStatus = 'success' | 'error' | 'cancelled';

export interface LogRunInput {
  worldId: string;
  ownerId: string;
  kind: RunKind;
  parentKind?: 'note' | 'chapter' | 'thread' | null;
  parentId?: string | null;
  model: string;
  provider: string;
  status: RunStatus;
  durationMs?: number;
  usage?: { prompt?: number; completion?: number } | null;
  errorMessage?: string | null;
  inputSummary?: Record<string, unknown> | null;
}

export interface RunRow {
  id: string;
  world_id: string;
  kind: RunKind;
  parent_kind: string | null;
  parent_id: string | null;
  model: string;
  provider: string;
  status: RunStatus;
  duration_ms: number | null;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
  error_message: string | null;
  input_summary: Record<string, unknown> | null;
  created_at: string;
}

export const runsKeys = {
  recent: (worldId: string | null, limit: number) => ['runs', 'recent', worldId, limit] as const,
};

export function useRecentRuns(worldId: string | null, limit = 20, enabled = true) {
  return useQuery<RunRow[], Error>({
    queryKey: runsKeys.recent(worldId, limit),
    enabled: enabled && !!worldId,
    refetchInterval: enabled ? 5000 : false,
    refetchIntervalInBackground: true,
    staleTime: 0,
    queryFn: async () => {
      let q = supabase
        .from('runs')
        .select('id, world_id, kind, parent_kind, parent_id, model, provider, status, duration_ms, usage, error_message, input_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (worldId) q = q.eq('world_id', worldId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });
}

/**
 * Fire-and-forget audit log. Errors are swallowed (logged to console) — chat
 * UX must not break because logging failed. Returns the inserted row id when
 * available, or null on failure.
 */
export async function logRun(input: LogRunInput): Promise<string | null> {
  try {
    const usage = input.usage
      ? { prompt_tokens: input.usage.prompt, completion_tokens: input.usage.completion }
      : null;
    const { data, error } = await supabase
      .from('runs')
      .insert({
        world_id: input.worldId,
        owner_id: input.ownerId,
        kind: input.kind,
        parent_kind: input.parentKind ?? null,
        parent_id: input.parentId ?? null,
        model: input.model,
        provider: input.provider,
        status: input.status,
        duration_ms: input.durationMs ?? null,
        usage,
        error_message: input.errorMessage ?? null,
        input_summary: input.inputSummary ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[runs] log failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn('[runs] log threw:', err);
    return null;
  }
}
