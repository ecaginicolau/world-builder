import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";
import {
  CURRENT_RANK_SENTINEL,
  resolveSnapshotMapAtRank,
  type EntityVersionRow,
  type FieldDef,
} from "../versioning.js";

type EntityRow = {
  id: string;
  world_id: string;
  entity_type_id: string;
  name: string;
  aliases: string[];
  tags: string[];
  source_note_id: string | null;
  created_at: string;
  updated_at: string;
};

type EntityTypeRow = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  fields: FieldDef[];
};

async function loadFieldsForType(
  ctx: ServerContext,
  typeId: string,
): Promise<FieldDef[] | { error: string }> {
  const r = await ctx.supabase
    .from("entity_types")
    .select("fields")
    .eq("id", typeId)
    .maybeSingle();
  if (r.error) return { error: r.error.message };
  if (!r.data) return { error: "Entity type not found" };
  return (r.data.fields ?? []) as FieldDef[];
}

export function registerEntitiesReadTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "list_entities",
    {
      title: "List entities",
      description:
        "List entities in a world, optionally filtered by type or by FTS query. Returns name + type + current snapshot (latest-rank values, per-field).",
      inputSchema: {
        world_id: z.string().uuid(),
        type_id: z.string().uuid().optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ world_id, type_id, query, limit }) => {
      const lim = limit ?? 100;
      let q = ctx.supabase
        .from("entities")
        .select(
          "id, world_id, entity_type_id, name, aliases, tags, source_note_id, created_at, updated_at",
        )
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId);
      if (type_id) q = q.eq("entity_type_id", type_id);
      if (query && query.trim().length > 0) {
        q = q.textSearch("search_text", query.trim(), {
          config: "simple",
          type: "websearch",
        });
      } else {
        q = q.order("updated_at", { ascending: false });
      }
      const r = await q.limit(lim);
      if (r.error) return fail(r.error.message);
      const rows = (r.data ?? []) as EntityRow[];
      if (rows.length === 0) return ok([]);

      const typeIds = Array.from(new Set(rows.map((e) => e.entity_type_id)));
      const typesRes = await ctx.supabase
        .from("entity_types")
        .select("id, name, icon, color, fields")
        .in("id", typeIds);
      if (typesRes.error) return fail(typesRes.error.message);
      const typesById = new Map<string, EntityTypeRow>();
      for (const t of (typesRes.data ?? []) as EntityTypeRow[]) {
        typesById.set(t.id, t);
      }

      const versRes = await ctx.supabase
        .from("entity_versions")
        .select(
          "id, entity_id, valid_from_rank, snapshot, source_event_id, source_note_id, note_excerpt, created_at",
        )
        .in(
          "entity_id",
          rows.map((e) => e.id),
        );
      if (versRes.error) return fail(versRes.error.message);
      const versionsByEntity = new Map<string, EntityVersionRow[]>();
      for (const v of (versRes.data ?? []) as EntityVersionRow[]) {
        const arr = versionsByEntity.get(v.entity_id) ?? [];
        arr.push(v);
        versionsByEntity.set(v.entity_id, arr);
      }

      const out = rows.map((e) => {
        const type = typesById.get(e.entity_type_id);
        const fields = type?.fields ?? [];
        const snapshot = resolveSnapshotMapAtRank(
          versionsByEntity.get(e.id) ?? [],
          CURRENT_RANK_SENTINEL,
          fields,
        );
        return {
          id: e.id,
          name: e.name,
          aliases: e.aliases,
          tags: e.tags,
          type_id: e.entity_type_id,
          type_name: type?.name ?? null,
          source_note_id: e.source_note_id,
          created_at: e.created_at,
          updated_at: e.updated_at,
          snapshot,
        };
      });
      return ok(out);
    },
  );

  server.registerTool(
    "get_entity",
    {
      title: "Get entity",
      description:
        "Fetch a single entity with its type's field definitions and the current snapshot (latest values per field).",
      inputSchema: { entity_id: z.string().uuid() },
    },
    async ({ entity_id }) => {
      const eRes = await ctx.supabase
        .from("entities")
        .select(
          "id, world_id, entity_type_id, name, aliases, tags, source_note_id, created_at, updated_at",
        )
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Entity not found");
      const entity = eRes.data as EntityRow;

      const tRes = await ctx.supabase
        .from("entity_types")
        .select("id, name, icon, color, fields")
        .eq("id", entity.entity_type_id)
        .maybeSingle();
      if (tRes.error) return fail(tRes.error.message);
      const type = tRes.data as EntityTypeRow | null;

      const vRes = await ctx.supabase
        .from("entity_versions")
        .select(
          "id, entity_id, valid_from_rank, snapshot, source_event_id, source_note_id, note_excerpt, created_at",
        )
        .eq("entity_id", entity_id)
        .order("valid_from_rank", { ascending: true });
      if (vRes.error) return fail(vRes.error.message);
      const versions = (vRes.data ?? []) as EntityVersionRow[];

      const fields = type?.fields ?? [];
      const snapshot = resolveSnapshotMapAtRank(
        versions,
        CURRENT_RANK_SENTINEL,
        fields,
      );

      return ok({
        ...entity,
        type: type
          ? {
              id: type.id,
              name: type.name,
              icon: type.icon,
              color: type.color,
              fields,
            }
          : null,
        snapshot,
        version_count: versions.length,
      });
    },
  );

  server.registerTool(
    "get_entity_state_at_rank",
    {
      title: "Get entity state at rank",
      description:
        "Resolve an entity's snapshot at a specific rank (per-field walk). Pass an event's chronological_rank to get the state right at/before that event.",
      inputSchema: {
        entity_id: z.string().uuid(),
        rank: z.string().min(1),
      },
    },
    async ({ entity_id, rank }) => {
      const eRes = await ctx.supabase
        .from("entities")
        .select("id, entity_type_id")
        .eq("id", entity_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (eRes.error) return fail(eRes.error.message);
      if (!eRes.data) return fail("Entity not found");
      const fields = await loadFieldsForType(ctx, eRes.data.entity_type_id);
      if ("error" in fields) return fail(fields.error);

      const vRes = await ctx.supabase
        .from("entity_versions")
        .select(
          "id, entity_id, valid_from_rank, snapshot, source_event_id, source_note_id, note_excerpt, created_at",
        )
        .eq("entity_id", entity_id)
        .order("valid_from_rank", { ascending: true });
      if (vRes.error) return fail(vRes.error.message);
      const snapshot = resolveSnapshotMapAtRank(
        (vRes.data ?? []) as EntityVersionRow[],
        rank,
        fields,
      );
      return ok({ rank, snapshot });
    },
  );

  server.registerTool(
    "list_entity_versions",
    {
      title: "List entity versions",
      description:
        "Return raw entity_versions rows (deltas) sorted by valid_from_rank. Each row's `snapshot` only contains fields explicitly set at that anchor.",
      inputSchema: { entity_id: z.string().uuid() },
    },
    async ({ entity_id }) => {
      const r = await ctx.supabase
        .from("entity_versions")
        .select("*")
        .eq("entity_id", entity_id)
        .order("valid_from_rank", { ascending: true });
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "list_entity_types",
    {
      title: "List entity types",
      description:
        "Return all entity types defined in a world (name + icon + color + field schema). Needed to know which type_id to pass when creating entities.",
      inputSchema: { world_id: z.string().uuid() },
    },
    async ({ world_id }) => {
      const r = await ctx.supabase
        .from("entity_types")
        .select("id, name, icon, color, fields, created_at, updated_at")
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId)
        .order("name", { ascending: true });
      return fromSupabase(r);
    },
  );
}
