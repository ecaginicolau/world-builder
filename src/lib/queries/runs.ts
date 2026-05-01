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
