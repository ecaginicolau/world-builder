import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentActionInput = {
  worldId: string;
  actionKind: string;
  targetKind?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
};

export function makeLogger(opts: {
  supabase: SupabaseClient;
  ownerId: string;
  agentSessionId: string;
}) {
  return async function logAction(input: AgentActionInput): Promise<void> {
    const { error } = await opts.supabase.from("agent_actions").insert({
      world_id: input.worldId,
      owner_id: opts.ownerId,
      agent_session_id: opts.agentSessionId,
      action_kind: input.actionKind,
      target_kind: input.targetKind ?? null,
      target_id: input.targetId ?? null,
      payload: input.payload ?? null,
    });
    if (error) {
      // Logging should never break the tool call — surface to stderr only.
      process.stderr.write(
        `[world-builder-mcp] failed to log agent_action ${input.actionKind}: ${error.message}\n`,
      );
    }
  };
}

export type LogAction = ReturnType<typeof makeLogger>;
