#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "./env.js";
import { createSupabase } from "./supabase.js";
import { newAgentSessionId } from "./session.js";
import { makeLogger } from "./logger.js";
import type { ServerContext } from "./context.js";
import { registerAllTools } from "./tools/register.js";

async function main() {
  const env = loadEnv();
  const supabase = createSupabase(env);
  const agentSessionId = newAgentSessionId();
  const logAction = makeLogger({
    supabase,
    ownerId: env.OWNER_USER_ID,
    agentSessionId,
  });

  const ctx: ServerContext = {
    supabase,
    ownerId: env.OWNER_USER_ID,
    agentSessionId,
    logAction,
  };

  const server = new McpServer({
    name: "world-builder",
    version: "0.1.0",
  });

  registerAllTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[world-builder-mcp] connected (session=${agentSessionId})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[world-builder-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
