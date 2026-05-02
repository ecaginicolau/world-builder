import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogAction } from "./logger.js";

export type ServerContext = {
  supabase: SupabaseClient;
  ownerId: string;
  agentSessionId: string;
  logAction: LogAction;
};
