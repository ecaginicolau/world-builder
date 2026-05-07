import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoutingSettings } from "./routing.js";

type UserSettingsRow = {
  local_llm_enabled: boolean | null;
  local_llm_endpoint: string | null;
  extract_local_model: string | null;
  proposals_local_model: string | null;
  upscale_local_model: string | null;
  summaries_local_model: string | null;
};

/**
 * Read the owner's user_settings row needed for LLM routing. Returns null when
 * the row doesn't exist yet — callers treat that as "all defaults / cloud".
 */
export async function readRoutingSettings(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<RoutingSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "local_llm_enabled, local_llm_endpoint, extract_local_model, proposals_local_model, upscale_local_model, summaries_local_model",
    )
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    process.stderr.write(
      `[world-builder-mcp] readRoutingSettings failed: ${error.message}\n`,
    );
    return null;
  }
  if (!data) return null;
  const r = data as UserSettingsRow;
  return {
    localLlmEnabled: !!r.local_llm_enabled,
    localLlmEndpoint: r.local_llm_endpoint,
    extractLocalModel: r.extract_local_model,
    proposalsLocalModel: r.proposals_local_model,
    upscaleLocalModel: r.upscale_local_model,
    summariesLocalModel: r.summaries_local_model,
  };
}
