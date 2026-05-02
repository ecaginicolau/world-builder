import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { INIT_RANK } from "../ranks.js";
import type { Snapshot } from "../versioning.js";

const FieldValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .describe("Allowed entity field value: string | number | boolean | null");

export function registerEntitiesWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "create_entity",
    {
      title: "Create entity",
      description:
        "Create a new entity of a given type, optionally with initial field values (stored as the v0 init version snapshot). Use list_entity_types to discover valid type_ids.",
      inputSchema: {
        world_id: z.string().uuid(),
        type_id: z.string().uuid(),
        name: z.string().min(1),
        aliases: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        initial_fields: z.record(z.string(), FieldValueSchema).optional(),
        source_note_id: z.string().uuid().nullish(),
      },
    },
    async ({
      world_id,
      type_id,
      name,
      aliases,
      tags,
      initial_fields,
      source_note_id,
    }) => {
      const eRes = await ctx.supabase
        .from("entities")
        .insert({
          world_id,
          owner_id: ctx.ownerId,
          entity_type_id: type_id,
          name: name.trim(),
          aliases: aliases ?? [],
          tags: tags ?? [],
          source_note_id: source_note_id ?? null,
        })
        .select("*")
        .single();
      if (eRes.error) return fail(eRes.error.message);

      // v0 init version (always inserted, even if empty — keeps the per-field
      // walk consistent and matches what the app does when entities reach
      // their first version).
      const snap: Snapshot = (initial_fields ?? {}) as Snapshot;
      const vRes = await ctx.supabase
        .from("entity_versions")
        .insert({
          entity_id: eRes.data.id,
          world_id,
          owner_id: ctx.ownerId,
          valid_from_rank: INIT_RANK,
          snapshot: snap,
          source_note_id: source_note_id ?? null,
        })
        .select("id")
        .single();
      if (vRes.error) {
        // best-effort rollback: delete the entity we just created
        await ctx.supabase.from("entities").delete().eq("id", eRes.data.id);
        return fail(`init version: ${vRes.error.message}`);
      }

      await ctx.logAction({
        worldId: world_id,
        actionKind: "create_entity",
        targetKind: "entity",
        targetId: eRes.data.id,
        payload: {
          name: eRes.data.name,
          type_id,
          fields: Object.keys(snap),
        },
      });
      return ok({ ...eRes.data, init_version_id: vRes.data.id });
    },
  );

  server.registerTool(
    "update_entity",
    {
      title: "Update entity",
      description:
        "Update entity-level metadata (name, aliases, tags, type). Field values live on entity_versions — use set_entity_field for those.",
      inputSchema: {
        entity_id: z.string().uuid(),
        name: z.string().min(1).optional(),
        aliases: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        type_id: z.string().uuid().optional(),
      },
    },
    async ({ entity_id, name, aliases, tags, type_id }) => {
      const patch: Record<string, unknown> = {};
      if (name !== undefined) patch.name = name.trim();
      if (aliases !== undefined) patch.aliases = aliases;
      if (tags !== undefined) patch.tags = tags;
      if (type_id !== undefined) patch.entity_type_id = type_id;
      if (Object.keys(patch).length === 0) return fail("No fields to update");
      const r = await ctx.supabase
        .from("entities")
        .update(patch)
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Entity not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_entity",
        targetKind: "entity",
        targetId: entity_id,
        payload: { name: r.data.name, fields: Object.keys(patch) },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "set_entity_field",
    {
      title: "Set entity field",
      description:
        "Race-safe upsert of a single field on the entity_version anchored at (entity, event). Pass event_id=null to set on the v0 init version. valid_from_rank is required only when the version row doesn't yet exist (use the event's chronological_rank, or '!init').",
      inputSchema: {
        entity_id: z.string().uuid(),
        event_id: z.string().uuid().nullable(),
        field: z.string().min(1),
        value: FieldValueSchema,
        valid_from_rank: z.string().min(1),
        source_note_id: z.string().uuid().nullish(),
      },
    },
    async ({
      entity_id,
      event_id,
      field,
      value,
      valid_from_rank,
      source_note_id,
    }) => {
      const eRes = await ctx.supabase
        .from("entities")
        .select("world_id, name")
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Entity not found");
      const worldId = eRes.data.world_id;

      const insertRes = await ctx.supabase
        .from("entity_versions")
        .insert({
          entity_id,
          world_id: worldId,
          owner_id: ctx.ownerId,
          valid_from_rank,
          snapshot: { [field]: value },
          source_note_id: source_note_id ?? null,
          source_event_id: event_id,
        })
        .select("*")
        .single();
      if (!insertRes.error && insertRes.data) {
        await ctx.logAction({
          worldId,
          actionKind: "set_entity_field",
          targetKind: "entity",
          targetId: entity_id,
          payload: {
            entity_name: eRes.data.name,
            field,
            value,
            event_id,
            kind: "insert",
          },
        });
        return ok(insertRes.data);
      }
      const code = (insertRes.error as { code?: string } | null)?.code;
      if (code !== "23505") return fail(insertRes.error!.message);

      // Existing row — fetch and merge.
      let q = ctx.supabase
        .from("entity_versions")
        .select("*")
        .eq("entity_id", entity_id)
        .limit(1);
      q =
        event_id === null
          ? q.is("source_event_id", null)
          : q.eq("source_event_id", event_id);
      const sel = await q;
      if (sel.error) return fail(sel.error.message);
      const row = sel.data?.[0] as
        | { id: string; snapshot: Snapshot | null }
        | undefined;
      if (!row) return fail("entity_versions: row vanished after conflict");
      const next: Snapshot = {
        ...((row.snapshot ?? {}) as Snapshot),
        [field]: value,
      };
      const upd = await ctx.supabase
        .from("entity_versions")
        .update({ snapshot: next })
        .eq("id", row.id)
        .select("*")
        .single();
      if (upd.error) return fail(upd.error.message);
      await ctx.logAction({
        worldId,
        actionKind: "set_entity_field",
        targetKind: "entity",
        targetId: entity_id,
        payload: {
          entity_name: eRes.data.name,
          field,
          value,
          event_id,
          kind: "update",
        },
      });
      return ok(upd.data);
    },
  );

  server.registerTool(
    "reset_entity_field",
    {
      title: "Reset entity field",
      description:
        "Remove a field from the version anchored at (entity, event). The field then inherits from earlier versions. If the row's snapshot becomes empty AND it is event-anchored, the row is deleted (init versions are never deleted).",
      inputSchema: {
        entity_id: z.string().uuid(),
        event_id: z.string().uuid().nullable(),
        field: z.string().min(1),
      },
    },
    async ({ entity_id, event_id, field }) => {
      const eRes = await ctx.supabase
        .from("entities")
        .select("world_id, name")
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Entity not found");

      let q = ctx.supabase
        .from("entity_versions")
        .select("*")
        .eq("entity_id", entity_id)
        .limit(1);
      q =
        event_id === null
          ? q.is("source_event_id", null)
          : q.eq("source_event_id", event_id);
      const sel = await q;
      if (sel.error) return fail(sel.error.message);
      const row = sel.data?.[0] as
        | {
            id: string;
            snapshot: Snapshot | null;
            source_event_id: string | null;
          }
        | undefined;
      if (!row) return ok({ noop: true });
      const snap = { ...((row.snapshot ?? {}) as Snapshot) };
      if (!(field in snap)) return ok({ noop: true });
      delete snap[field];
      const isEventAnchored = row.source_event_id !== null;
      if (isEventAnchored && Object.keys(snap).length === 0) {
        const del = await ctx.supabase
          .from("entity_versions")
          .delete()
          .eq("id", row.id);
        if (del.error) return fail(del.error.message);
        await ctx.logAction({
          worldId: eRes.data.world_id,
          actionKind: "reset_entity_field",
          targetKind: "entity",
          targetId: entity_id,
          payload: {
            entity_name: eRes.data.name,
            field,
            event_id,
            kind: "delete-row",
          },
        });
        return ok({ deleted_row: true });
      }
      const upd = await ctx.supabase
        .from("entity_versions")
        .update({ snapshot: snap })
        .eq("id", row.id)
        .select("*")
        .single();
      if (upd.error) return fail(upd.error.message);
      await ctx.logAction({
        worldId: eRes.data.world_id,
        actionKind: "reset_entity_field",
        targetKind: "entity",
        targetId: entity_id,
        payload: {
          entity_name: eRes.data.name,
          field,
          event_id,
          kind: "update",
        },
      });
      return ok(upd.data);
    },
  );

  server.registerTool(
    "delete_entity",
    {
      title: "Delete entity",
      description: "Hard-delete an entity. Cascades all entity_versions.",
      inputSchema: { entity_id: z.string().uuid() },
    },
    async ({ entity_id }) => {
      const sel = await ctx.supabase
        .from("entities")
        .select("world_id, name")
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Entity not found");
      const r = await ctx.supabase
        .from("entities")
        .delete()
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_entity",
        targetKind: "entity",
        targetId: entity_id,
        payload: { name: sel.data.name },
      });
      return ok({ id: entity_id });
    },
  );
}
