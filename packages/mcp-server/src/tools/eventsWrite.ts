import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { nextRankAfter } from "../ranks.js";

export function registerEventsWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "create_event",
    {
      title: "Create event",
      description:
        "Create a new event in the world's chronological timeline. If chronological_rank is omitted, the event is appended at the end.",
      inputSchema: {
        world_id: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().nullish(),
        description_html: z.string().nullish(),
        chronological_rank: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        source_note_id: z.string().uuid().nullish(),
      },
    },
    async ({
      world_id,
      title,
      description,
      description_html,
      chronological_rank,
      tags,
      source_note_id,
    }) => {
      let rank = chronological_rank;
      if (!rank) {
        const ev = await ctx.supabase
          .from("events")
          .select("chronological_rank")
          .eq("world_id", world_id)
          .eq("owner_id", ctx.ownerId);
        if (ev.error) return fail(ev.error.message);
        rank = nextRankAfter(
          (ev.data ?? []).map((e: { chronological_rank: string }) => ({
            rank: e.chronological_rank,
          })),
        );
      }
      const r = await ctx.supabase
        .from("events")
        .insert({
          world_id,
          owner_id: ctx.ownerId,
          title: title.trim(),
          description: description ?? null,
          description_html: description_html ?? null,
          chronological_rank: rank,
          tags: tags ?? [],
          source_note_id: source_note_id ?? null,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: world_id,
        actionKind: "create_event",
        targetKind: "event",
        targetId: r.data.id,
        payload: { title: r.data.title, rank },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update event",
      description:
        "Patch an event. To reorder chronologically, pass a new chronological_rank (compute the midpoint between two existing ranks via the conventions in get_writing_guide).",
      inputSchema: {
        event_id: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().nullish(),
        description_html: z.string().nullish(),
        chronological_rank: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({
      event_id,
      title,
      description,
      description_html,
      chronological_rank,
      tags,
    }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title.trim();
      if (description !== undefined) patch.description = description;
      if (description_html !== undefined)
        patch.description_html = description_html;
      if (chronological_rank !== undefined)
        patch.chronological_rank = chronological_rank;
      if (tags !== undefined) patch.tags = tags;
      if (Object.keys(patch).length === 0) return fail("No fields to update");
      const r = await ctx.supabase
        .from("events")
        .update(patch)
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Event not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_event",
        targetKind: "event",
        targetId: event_id,
        payload: { title: r.data.title, fields: Object.keys(patch) },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete event",
      description:
        "Hard-delete an event. Cascades chapter_events, event_participants, and sets entity_versions.source_event_id to null.",
      inputSchema: { event_id: z.string().uuid() },
    },
    async ({ event_id }) => {
      const sel = await ctx.supabase
        .from("events")
        .select("world_id, title")
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Event not found");
      const r = await ctx.supabase
        .from("events")
        .delete()
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_event",
        targetKind: "event",
        targetId: event_id,
        payload: { title: sel.data.title },
      });
      return ok({ id: event_id });
    },
  );
}
