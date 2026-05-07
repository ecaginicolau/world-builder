import type { SupabaseClient } from "@supabase/supabase-js";

export type RunKind =
  | "chat"
  | "auto_extract"
  | "upscale"
  | "propose_updates"
  | "summarize";
export type RunStatus = "success" | "error" | "cancelled";
export type ParentKind = "note" | "chapter" | "thread" | "event";

export interface LogRunInput {
  worldId: string;
  ownerId: string;
  kind: RunKind;
  parentKind?: ParentKind | null;
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
 * Fire-and-forget audit log to the same `runs` table the app writes to.
 * Errors are swallowed to stderr — logging must never break a tool call.
 */
export async function logRun(
  supabase: SupabaseClient,
  input: LogRunInput,
): Promise<string | null> {
  try {
    const usage = input.usage
      ? {
          prompt_tokens: input.usage.prompt,
          completion_tokens: input.usage.completion,
        }
      : null;
    const { data, error } = await supabase
      .from("runs")
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
      .select("id")
      .single();
    if (error) {
      process.stderr.write(`[world-builder-mcp] logRun failed: ${error.message}\n`);
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    process.stderr.write(
      `[world-builder-mcp] logRun threw: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}
