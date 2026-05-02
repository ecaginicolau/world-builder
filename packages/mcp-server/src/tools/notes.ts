import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";

const NOTE_LIST_LIMIT = 50;

export function registerNotesReadTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description:
        "List notes in a world, newest-updated first. Pass `query` to full-text-search; without it, returns the most recently updated open notes.",
      inputSchema: {
        world_id: z.string().uuid(),
        query: z.string().optional(),
        include_archived: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ world_id, query, include_archived, limit }) => {
      const lim = limit ?? NOTE_LIST_LIMIT;
      let q = ctx.supabase
        .from("notes")
        .select("id, title, content, status, created_at, updated_at")
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId);
      if (!include_archived) q = q.eq("status", "open");
      if (query && query.trim().length > 0) {
        q = q.textSearch("search_text", query.trim(), {
          config: "simple",
          type: "websearch",
        });
      } else {
        q = q.order("updated_at", { ascending: false });
      }
      q = q.limit(lim);
      const r = await q;
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "get_note",
    {
      title: "Get note",
      description: "Fetch a single note (with full HTML content).",
      inputSchema: { note_id: z.string().uuid() },
    },
    async ({ note_id }) => {
      const r = await ctx.supabase
        .from("notes")
        .select("*")
        .eq("id", note_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Note not found");
      return ok(r.data);
    },
  );
}
