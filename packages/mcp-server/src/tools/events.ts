import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";

export function registerEventsReadTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "Return all events in a world, sorted by chronological_rank ascending.",
      inputSchema: { world_id: z.string().uuid() },
    },
    async ({ world_id }) => {
      const r = await ctx.supabase
        .from("events")
        .select(
          "id, title, description, description_html, chronological_rank, tags, source_note_id, created_at, updated_at",
        )
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId)
        .order("chronological_rank", { ascending: true });
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get event",
      description:
        "Fetch an event with its linked chapters (with narrative_rank) and participants (entities tagged on this event).",
      inputSchema: { event_id: z.string().uuid() },
    },
    async ({ event_id }) => {
      const eRes = await ctx.supabase
        .from("events")
        .select("*")
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Event not found");

      const linksRes = await ctx.supabase
        .from("chapter_events")
        .select("chapter_id, narrative_rank")
        .eq("event_id", event_id);
      if (linksRes.error) return fail(linksRes.error.message);

      const chapterIds = (linksRes.data ?? []).map((x) => x.chapter_id);
      const chaptersById = new Map<
        string,
        { id: string; title: string | null }
      >();
      if (chapterIds.length > 0) {
        const cRes = await ctx.supabase
          .from("chapters")
          .select("id, title")
          .in("id", chapterIds);
        if (cRes.error) return fail(cRes.error.message);
        for (const c of (cRes.data ?? []) as Array<{
          id: string;
          title: string | null;
        }>) {
          chaptersById.set(c.id, c);
        }
      }
      const linked_chapters = (linksRes.data ?? []).map((x) => ({
        chapter_id: x.chapter_id,
        chapter_title: chaptersById.get(x.chapter_id)?.title ?? null,
        narrative_rank: x.narrative_rank,
      }));

      const partsRes = await ctx.supabase
        .from("event_participants")
        .select("entity_id, pinned_manually")
        .eq("event_id", event_id);
      if (partsRes.error) return fail(partsRes.error.message);
      const entityIds = (partsRes.data ?? []).map((x) => x.entity_id);
      const entitiesById = new Map<string, { id: string; name: string }>();
      if (entityIds.length > 0) {
        const enRes = await ctx.supabase
          .from("entities")
          .select("id, name")
          .in("id", entityIds);
        if (enRes.error) return fail(enRes.error.message);
        for (const e of (enRes.data ?? []) as Array<{
          id: string;
          name: string;
        }>) {
          entitiesById.set(e.id, e);
        }
      }
      const participants = (partsRes.data ?? []).map((x) => ({
        entity_id: x.entity_id,
        entity_name: entitiesById.get(x.entity_id)?.name ?? null,
        pinned_manually: x.pinned_manually,
      }));

      return ok({ ...eRes.data, linked_chapters, participants });
    },
  );
}
