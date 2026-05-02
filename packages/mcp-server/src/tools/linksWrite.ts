import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { nextRankAfter } from "../ranks.js";

export function registerLinksWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  // ─── chapter_events ─────────────────────────────────────────────────
  server.registerTool(
    "link_event_to_chapter",
    {
      title: "Link event to chapter",
      description:
        "Insert a chapter_events row. If narrative_rank is omitted, the event is appended at the end of the chapter's narrative order.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        event_id: z.string().uuid(),
        narrative_rank: z.string().min(1).optional(),
      },
    },
    async ({ chapter_id, event_id, narrative_rank }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("world_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");

      let rank = narrative_rank;
      if (!rank) {
        const ex = await ctx.supabase
          .from("chapter_events")
          .select("narrative_rank")
          .eq("chapter_id", chapter_id);
        if (ex.error) return fail(ex.error.message);
        rank = nextRankAfter(
          (ex.data ?? []).map((e: { narrative_rank: string }) => ({
            rank: e.narrative_rank,
          })),
        );
      }
      const r = await ctx.supabase
        .from("chapter_events")
        .insert({
          chapter_id,
          event_id,
          world_id: cRes.data.world_id,
          owner_id: ctx.ownerId,
          narrative_rank: rank,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: cRes.data.world_id,
        actionKind: "link_event_to_chapter",
        targetKind: "link",
        targetId: null,
        payload: { chapter_id, event_id, narrative_rank: rank },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "unlink_event_from_chapter",
    {
      title: "Unlink event from chapter",
      description:
        "Delete the chapter_events row linking these two. No-op if it didn't exist.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        event_id: z.string().uuid(),
      },
    },
    async ({ chapter_id, event_id }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("world_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");
      const r = await ctx.supabase
        .from("chapter_events")
        .delete()
        .eq("chapter_id", chapter_id)
        .eq("event_id", event_id);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: cRes.data.world_id,
        actionKind: "unlink_event_from_chapter",
        targetKind: "link",
        targetId: null,
        payload: { chapter_id, event_id },
      });
      return ok({ chapter_id, event_id });
    },
  );

  server.registerTool(
    "update_chapter_event",
    {
      title: "Update chapter event narrative rank",
      description:
        "Change the narrative_rank of a chapter_events row, to reorder events within a chapter's narrative.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        event_id: z.string().uuid(),
        narrative_rank: z.string().min(1),
      },
    },
    async ({ chapter_id, event_id, narrative_rank }) => {
      const r = await ctx.supabase
        .from("chapter_events")
        .update({ narrative_rank })
        .eq("chapter_id", chapter_id)
        .eq("event_id", event_id)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("chapter_events row not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_chapter_event",
        targetKind: "link",
        targetId: null,
        payload: { chapter_id, event_id, narrative_rank },
      });
      return ok(r.data);
    },
  );

  // ─── event_participants ─────────────────────────────────────────────
  server.registerTool(
    "link_entity_to_event",
    {
      title: "Link entity to event",
      description:
        "Insert an event_participants row, marking the entity as participating in the event. `pinned` defaults to true (= manually curated, won't be overwritten by LLM auto-detection).",
      inputSchema: {
        event_id: z.string().uuid(),
        entity_id: z.string().uuid(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ event_id, entity_id, pinned }) => {
      const eRes = await ctx.supabase
        .from("events")
        .select("world_id")
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Event not found");
      const r = await ctx.supabase
        .from("event_participants")
        .insert({
          event_id,
          entity_id,
          world_id: eRes.data.world_id,
          owner_id: ctx.ownerId,
          pinned_manually: pinned ?? true,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: eRes.data.world_id,
        actionKind: "link_entity_to_event",
        targetKind: "link",
        targetId: null,
        payload: { event_id, entity_id, pinned: pinned ?? true },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "unlink_entity_from_event",
    {
      title: "Unlink entity from event",
      description: "Delete an event_participants row.",
      inputSchema: {
        event_id: z.string().uuid(),
        entity_id: z.string().uuid(),
      },
    },
    async ({ event_id, entity_id }) => {
      const eRes = await ctx.supabase
        .from("events")
        .select("world_id")
        .eq("id", event_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Event not found");
      const r = await ctx.supabase
        .from("event_participants")
        .delete()
        .eq("event_id", event_id)
        .eq("entity_id", entity_id);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: eRes.data.world_id,
        actionKind: "unlink_entity_from_event",
        targetKind: "link",
        targetId: null,
        payload: { event_id, entity_id },
      });
      return ok({ event_id, entity_id });
    },
  );

  // ─── chapter_participants ───────────────────────────────────────────
  server.registerTool(
    "link_entity_to_chapter",
    {
      title: "Link entity to chapter",
      description:
        "Insert a chapter_participants row (entity tagged as participant in this chapter).",
      inputSchema: {
        chapter_id: z.string().uuid(),
        entity_id: z.string().uuid(),
      },
    },
    async ({ chapter_id, entity_id }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("world_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");
      const r = await ctx.supabase
        .from("chapter_participants")
        .insert({
          chapter_id,
          entity_id,
          owner_id: ctx.ownerId,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: cRes.data.world_id,
        actionKind: "link_entity_to_chapter",
        targetKind: "link",
        targetId: null,
        payload: { chapter_id, entity_id },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "unlink_entity_from_chapter",
    {
      title: "Unlink entity from chapter",
      description: "Delete a chapter_participants row.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        entity_id: z.string().uuid(),
      },
    },
    async ({ chapter_id, entity_id }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("world_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");
      const r = await ctx.supabase
        .from("chapter_participants")
        .delete()
        .eq("chapter_id", chapter_id)
        .eq("entity_id", entity_id);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: cRes.data.world_id,
        actionKind: "unlink_entity_from_chapter",
        targetKind: "link",
        targetId: null,
        payload: { chapter_id, entity_id },
      });
      return ok({ chapter_id, entity_id });
    },
  );
}
