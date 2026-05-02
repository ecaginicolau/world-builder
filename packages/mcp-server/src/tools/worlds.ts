import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";
import { buildWritingGuide } from "../guide.js";

const WORLD_COLS =
  "id, name, description, world_memory, custom_prompt, previous_chapter_context, created_at";

export function registerWorldsTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_worlds",
    {
      title: "List worlds",
      description:
        "Return all worlds owned by the configured user, newest first.",
      inputSchema: {},
    },
    async () => {
      const r = await ctx.supabase
        .from("worlds")
        .select(WORLD_COLS)
        .eq("owner_id", ctx.ownerId)
        .order("created_at", { ascending: false });
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "get_world",
    {
      title: "Get world",
      description:
        "Fetch a single world (with memory + custom_prompt + PCC config).",
      inputSchema: {
        world_id: z.string().uuid(),
      },
    },
    async ({ world_id }) => {
      const r = await ctx.supabase
        .from("worlds")
        .select(WORLD_COLS)
        .eq("id", world_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("World not found or not owned by this user");
      return ok(r.data);
    },
  );

  server.registerTool(
    "get_writing_guide",
    {
      title: "Get writing guide",
      description:
        "Return the world's lore + custom prompt + recommended drafting flow + business rules + conventions. Call this once at the start of any writing session.",
      inputSchema: {
        world_id: z.string().uuid(),
      },
    },
    async ({ world_id }) => {
      const r = await ctx.supabase
        .from("worlds")
        .select("world_memory, custom_prompt")
        .eq("id", world_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("World not found or not owned by this user");
      return ok(
        buildWritingGuide({
          worldMemory: r.data.world_memory ?? "",
          customPrompt: r.data.custom_prompt ?? "",
        }),
      );
    },
  );
}
