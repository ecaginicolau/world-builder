import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { nextRankAfter } from "../ranks.js";
import {
  CURRENT_RANK_SENTINEL,
  resolveSnapshotMapAtRank,
  type EntityVersionRow,
  type FieldDef,
} from "../versioning.js";
import { buildPcc, formatPccBlock } from "../pcc.js";
import { readRoutingSettings } from "../llm/settings.js";
import { pickTransport } from "../llm/routing.js";
import { logRun } from "../llm/runsLog.js";
import { htmlToPlainText } from "../llm/html.js";
import {
  extractEntities,
  type EntityCandidate,
} from "../llm/extract.js";
import {
  proposeCanon,
  type CanonEntityCard,
} from "../llm/proposeCanon.js";
import { upscaleChapter, type UpscaleEntityCard } from "../llm/upscale.js";
import { summarize, type SummaryLength } from "../llm/summaries.js";

const SUMMARY_LEVEL = z.enum(["S", "M", "L"]);

type WorldRow = {
  id: string;
  world_memory: string | null;
  custom_prompt: string | null;
  description: string | null;
};

async function loadWorld(
  ctx: ServerContext,
  worldId: string,
): Promise<WorldRow | { error: string }> {
  const r = await ctx.supabase
    .from("worlds")
    .select("id, world_memory, custom_prompt, description")
    .eq("id", worldId)
    .eq("owner_id", ctx.ownerId)
    .maybeSingle();
  if (r.error) return { error: r.error.message };
  if (!r.data) return { error: "World not found" };
  return r.data as WorldRow;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function registerIntentsTools(server: McpServer, ctx: ServerContext) {
  // ─── auto_extract_from_note ───────────────────────────────────────────────
  server.registerTool(
    "auto_extract_from_note",
    {
      title: "Auto-extract entities from note",
      description:
        "Run the LLM extraction pass on a note (same flow as the app's auto-extract). Returns candidate entities (name + type + optional matchedEntityId). Already-linked entities are excluded from the suggestions. The agent should review and call create_entity / link_entity_to_chapter / etc. for each accepted candidate.",
      inputSchema: { note_id: z.string().uuid() },
    },
    async ({ note_id }) => {
      const noteRes = await ctx.supabase
        .from("notes")
        .select("id, world_id, title, content")
        .eq("id", note_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (noteRes.error) return fail(noteRes.error.message);
      if (!noteRes.data) return fail("Note not found");
      const note = noteRes.data as {
        id: string;
        world_id: string;
        title: string | null;
        content: string;
      };

      const typesRes = await ctx.supabase
        .from("entity_types")
        .select("id, name")
        .eq("world_id", note.world_id)
        .eq("owner_id", ctx.ownerId);
      if (typesRes.error) return fail(typesRes.error.message);
      const types = (typesRes.data ?? []) as Array<{ id: string; name: string }>;
      const typeNameById = new Map(types.map((t) => [t.id, t.name]));

      const entRes = await ctx.supabase
        .from("entities")
        .select("id, name, aliases, entity_type_id")
        .eq("world_id", note.world_id)
        .eq("owner_id", ctx.ownerId);
      if (entRes.error) return fail(entRes.error.message);
      const entities = (entRes.data ?? []) as Array<{
        id: string;
        name: string;
        aliases: string[];
        entity_type_id: string;
      }>;

      const linkedRes = await ctx.supabase
        .from("note_entities")
        .select("entity_id")
        .eq("note_id", note_id);
      if (linkedRes.error) return fail(linkedRes.error.message);
      const linked = new Set(
        (linkedRes.data ?? []).map((r) => (r as { entity_id: string }).entity_id),
      );

      const noteText = [
        note.title?.trim() || "",
        htmlToPlainText(note.content ?? ""),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!noteText.trim()) return fail("Note is empty");

      const settings = await readRoutingSettings(ctx.supabase, ctx.ownerId);
      const t = pickTransport(settings, "extract", "cheapest");

      const startedAt = Date.now();
      let candidates: EntityCandidate[];
      try {
        const result = await extractEntities(
          {
            noteText,
            existing: entities.map((e) => ({
              id: e.id,
              name: e.name,
              type: typeNameById.get(e.entity_type_id) ?? "Unknown",
              aliases: e.aliases,
            })),
            knownTypes: types.map((t) => t.name),
          },
          { transport: t.mode, model: t.model, supabase: ctx.supabase },
        );
        // Filter out candidates already linked to this note.
        candidates = result.candidates.filter(
          (c) => !c.matchedEntityId || !linked.has(c.matchedEntityId),
        );
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: note.world_id,
          kind: "auto_extract",
          parentKind: "note",
          parentId: note_id,
          model: result.model,
          provider: result.provider,
          status: "success",
          durationMs: Date.now() - startedAt,
          usage: result.usage
            ? {
                prompt: result.usage.prompt_tokens,
                completion: result.usage.completion_tokens,
              }
            : null,
          inputSummary: {
            noteLen: noteText.length,
            knownTypes: types.length,
            existingEntities: entities.length,
            candidateCount: candidates.length,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: note.world_id,
          kind: "auto_extract",
          parentKind: "note",
          parentId: note_id,
          model: t.model,
          provider: t.provider,
          status: "error",
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        });
        return fail(message);
      }

      await ctx.logAction({
        worldId: note.world_id,
        actionKind: "auto_extract_from_note",
        targetKind: "note",
        targetId: note_id,
        payload: {
          candidate_count: candidates.length,
          provider: t.provider,
          model: t.model,
        },
      });
      return ok({ candidates, provider: t.provider, model: t.model });
    },
  );

  // ─── propose_canon_from_chapter ───────────────────────────────────────────
  server.registerTool(
    "propose_canon_from_chapter",
    {
      title: "Propose canon from chapter",
      description:
        "Run the 'propose canon updates' LLM pass on a chapter's final version text. Returns a list of new event proposals (title + description + optional entityDiffs). Skips events already linked to this chapter. Snapshots are resolved at the chapter's derived chronological rank when available; otherwise current state is used. The agent applies accepted proposals via create_event / link_event_to_chapter / link_entity_to_event / set_entity_field.",
      inputSchema: { chapter_id: z.string().uuid() },
    },
    async ({ chapter_id }) => {
      const chRes = await ctx.supabase
        .from("chapters")
        .select("id, world_id, title, final_version_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (chRes.error) return fail(chRes.error.message);
      if (!chRes.data) return fail("Chapter not found");
      const chapter = chRes.data as {
        id: string;
        world_id: string;
        title: string | null;
        final_version_id: string | null;
      };

      let chapterText = "";
      if (chapter.final_version_id) {
        const vRes = await ctx.supabase
          .from("chapter_versions")
          .select("text")
          .eq("id", chapter.final_version_id)
          .maybeSingle();
        if (vRes.error) return fail(vRes.error.message);
        chapterText = htmlToPlainText((vRes.data?.text as string) ?? "");
      }
      if (!chapterText.trim()) return fail("Chapter final version is empty");

      const world = await loadWorld(ctx, chapter.world_id);
      if ("error" in world) return fail(world.error);

      // Linked events (existing canon — skip these in the proposal)
      const ceRes = await ctx.supabase
        .from("chapter_events")
        .select("event_id")
        .eq("chapter_id", chapter_id);
      if (ceRes.error) return fail(ceRes.error.message);
      const eventIds = (ceRes.data ?? []).map(
        (r) => (r as { event_id: string }).event_id,
      );
      let existingEvents: { title: string; description: string | null }[] = [];
      let chapterChrono: string = CURRENT_RANK_SENTINEL;
      if (eventIds.length > 0) {
        const eRes = await ctx.supabase
          .from("events")
          .select("title, description, chronological_rank")
          .in("id", eventIds);
        if (eRes.error) return fail(eRes.error.message);
        const evs = (eRes.data ?? []) as Array<{
          title: string;
          description: string | null;
          chronological_rank: string;
        }>;
        existingEvents = evs.map((e) => ({
          title: e.title,
          description: e.description,
        }));
        if (evs.length > 0) {
          chapterChrono = evs.reduce(
            (min, e) =>
              min === CURRENT_RANK_SENTINEL || e.chronological_rank < min
                ? e.chronological_rank
                : min,
            CURRENT_RANK_SENTINEL,
          );
        }
      }

      // Linked participants → entity cards
      const cpRes = await ctx.supabase
        .from("chapter_participants")
        .select("entity_id")
        .eq("chapter_id", chapter_id);
      if (cpRes.error) return fail(cpRes.error.message);
      const entityIds = (cpRes.data ?? []).map(
        (r) => (r as { entity_id: string }).entity_id,
      );
      const cards: CanonEntityCard[] = [];
      if (entityIds.length > 0) {
        const enRes = await ctx.supabase
          .from("entities")
          .select("id, name, entity_type_id")
          .in("id", entityIds);
        if (enRes.error) return fail(enRes.error.message);
        const ents = (enRes.data ?? []) as Array<{
          id: string;
          name: string;
          entity_type_id: string;
        }>;
        const typeIds = Array.from(new Set(ents.map((e) => e.entity_type_id)));
        const tRes = await ctx.supabase
          .from("entity_types")
          .select("id, name, fields")
          .in("id", typeIds);
        if (tRes.error) return fail(tRes.error.message);
        const typesById = new Map<
          string,
          { name: string; fields: FieldDef[] }
        >();
        for (const t of (tRes.data ?? []) as Array<{
          id: string;
          name: string;
          fields: FieldDef[];
        }>) {
          typesById.set(t.id, { name: t.name, fields: t.fields ?? [] });
        }
        const vRes = await ctx.supabase
          .from("entity_versions")
          .select(
            "id, entity_id, valid_from_rank, snapshot, source_event_id, source_note_id, note_excerpt, created_at",
          )
          .in("entity_id", entityIds);
        if (vRes.error) return fail(vRes.error.message);
        const versionsByEntity = new Map<string, EntityVersionRow[]>();
        for (const v of (vRes.data ?? []) as EntityVersionRow[]) {
          const arr = versionsByEntity.get(v.entity_id) ?? [];
          arr.push(v);
          versionsByEntity.set(v.entity_id, arr);
        }
        for (const e of ents) {
          const t = typesById.get(e.entity_type_id);
          const fields = t?.fields ?? [];
          const snap = resolveSnapshotMapAtRank(
            versionsByEntity.get(e.id) ?? [],
            chapterChrono,
            fields,
          );
          const currentSnapshot: Record<string, string> = {};
          for (const f of fields) {
            currentSnapshot[f.name] = fmt(snap[f.name] ?? null);
          }
          cards.push({
            id: e.id,
            name: e.name,
            type: t?.name ?? "Unknown",
            fields,
            currentSnapshot,
          });
        }
      }

      const settings = await readRoutingSettings(ctx.supabase, ctx.ownerId);
      const t = pickTransport(settings, "proposals", "medium");

      const startedAt = Date.now();
      try {
        const result = await proposeCanon(
          {
            worldMemory: world.world_memory ?? world.description ?? undefined,
            worldCustomPrompt: world.custom_prompt ?? undefined,
            chapterTitle: chapter.title ?? undefined,
            chapterText,
            entityCards: cards,
            existingEvents,
          },
          { transport: t.mode, model: t.model, supabase: ctx.supabase },
        );
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "propose_updates",
          parentKind: "chapter",
          parentId: chapter_id,
          model: result.model,
          provider: result.provider,
          status: "success",
          durationMs: Date.now() - startedAt,
          usage: result.usage
            ? {
                prompt: result.usage.prompt_tokens,
                completion: result.usage.completion_tokens,
              }
            : null,
          inputSummary: {
            entityCount: cards.length,
            eventsProposed: result.events.length,
            existingEventsCount: existingEvents.length,
          },
        });
        await ctx.logAction({
          worldId: chapter.world_id,
          actionKind: "propose_canon_from_chapter",
          targetKind: "chapter",
          targetId: chapter_id,
          payload: {
            event_count: result.events.length,
            provider: t.provider,
            model: t.model,
          },
        });
        return ok({
          events: result.events,
          provider: t.provider,
          model: t.model,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "propose_updates",
          parentKind: "chapter",
          parentId: chapter_id,
          model: t.model,
          provider: t.provider,
          status: "error",
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        });
        return fail(message);
      }
    },
  );

  // ─── upscale_chapter ──────────────────────────────────────────────────────
  server.registerTool(
    "upscale_chapter",
    {
      title: "Upscale chapter",
      description:
        "Run the LLM upscale pass on a chapter's current final text + a user prompt. Inserts a new chapter_versions row (origin='upscale') and points final_version_id at it. Linked entities are included as snapshot cards (resolved at the chapter's derived chrono). Set include_pcc=false to skip the previous-chapter context block (default true).",
      inputSchema: {
        chapter_id: z.string().uuid(),
        user_prompt: z.string().min(1),
        include_pcc: z.boolean().optional(),
      },
    },
    async ({ chapter_id, user_prompt, include_pcc }) => {
      const chRes = await ctx.supabase
        .from("chapters")
        .select("id, world_id, title, final_version_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (chRes.error) return fail(chRes.error.message);
      if (!chRes.data) return fail("Chapter not found");
      const chapter = chRes.data as {
        id: string;
        world_id: string;
        title: string | null;
        final_version_id: string | null;
      };
      if (!chapter.final_version_id)
        return fail("Chapter has no final version to upscale");

      const vRes = await ctx.supabase
        .from("chapter_versions")
        .select("id, text")
        .eq("id", chapter.final_version_id)
        .maybeSingle();
      if (vRes.error) return fail(vRes.error.message);
      if (!vRes.data) return fail("Final version not found");
      const parentVersion = vRes.data as { id: string; text: string };
      const currentText = htmlToPlainText(parentVersion.text ?? "");

      const world = await loadWorld(ctx, chapter.world_id);
      if ("error" in world) return fail(world.error);

      // Derive chapter chrono from min linked event chrono.
      const ceRes = await ctx.supabase
        .from("chapter_events")
        .select("event_id")
        .eq("chapter_id", chapter_id);
      if (ceRes.error) return fail(ceRes.error.message);
      const eventIds = (ceRes.data ?? []).map(
        (r) => (r as { event_id: string }).event_id,
      );
      let chapterChrono = CURRENT_RANK_SENTINEL;
      if (eventIds.length > 0) {
        const eRes = await ctx.supabase
          .from("events")
          .select("chronological_rank")
          .in("id", eventIds);
        if (eRes.error) return fail(eRes.error.message);
        const ranks = (eRes.data ?? []).map(
          (r) => (r as { chronological_rank: string }).chronological_rank,
        );
        if (ranks.length > 0) {
          chapterChrono = ranks.reduce((m, r) => (r < m ? r : m), ranks[0]);
        }
      }

      // Linked participants → entity cards
      const cpRes = await ctx.supabase
        .from("chapter_participants")
        .select("entity_id")
        .eq("chapter_id", chapter_id);
      if (cpRes.error) return fail(cpRes.error.message);
      const partIds = (cpRes.data ?? []).map(
        (r) => (r as { entity_id: string }).entity_id,
      );
      const cards: UpscaleEntityCard[] = [];
      if (partIds.length > 0) {
        const enRes = await ctx.supabase
          .from("entities")
          .select("id, name, entity_type_id")
          .in("id", partIds);
        if (enRes.error) return fail(enRes.error.message);
        const ents = (enRes.data ?? []) as Array<{
          id: string;
          name: string;
          entity_type_id: string;
        }>;
        const typeIds = Array.from(new Set(ents.map((e) => e.entity_type_id)));
        const tRes = await ctx.supabase
          .from("entity_types")
          .select("id, name, fields")
          .in("id", typeIds);
        if (tRes.error) return fail(tRes.error.message);
        const typesById = new Map<
          string,
          { name: string; fields: FieldDef[] }
        >();
        for (const t of (tRes.data ?? []) as Array<{
          id: string;
          name: string;
          fields: FieldDef[];
        }>) {
          typesById.set(t.id, { name: t.name, fields: t.fields ?? [] });
        }
        const evRes = await ctx.supabase
          .from("entity_versions")
          .select(
            "id, entity_id, valid_from_rank, snapshot, source_event_id, source_note_id, note_excerpt, created_at",
          )
          .in("entity_id", partIds);
        if (evRes.error) return fail(evRes.error.message);
        const versionsByEntity = new Map<string, EntityVersionRow[]>();
        for (const v of (evRes.data ?? []) as EntityVersionRow[]) {
          const arr = versionsByEntity.get(v.entity_id) ?? [];
          arr.push(v);
          versionsByEntity.set(v.entity_id, arr);
        }
        for (const e of ents) {
          const t = typesById.get(e.entity_type_id);
          const fields = t?.fields ?? [];
          const snap = resolveSnapshotMapAtRank(
            versionsByEntity.get(e.id) ?? [],
            chapterChrono,
            fields,
          );
          const snapshot: Record<string, string> = {};
          for (const f of fields) snapshot[f.name] = fmt(snap[f.name] ?? null);
          cards.push({
            id: e.id,
            name: e.name,
            type: t?.name ?? "Unknown",
            snapshot,
          });
        }
      }

      // PCC (default on)
      let worldMemoryWithPcc: string | undefined =
        world.world_memory ?? world.description ?? undefined;
      const wantPcc = include_pcc !== false;
      if (wantPcc) {
        const pccRes = await buildPcc(ctx.supabase, ctx.ownerId, chapter_id);
        if (pccRes.ok && pccRes.slots.length > 0) {
          const block = formatPccBlock(pccRes.slots);
          if (block) {
            worldMemoryWithPcc = worldMemoryWithPcc
              ? `${worldMemoryWithPcc}\n\n${block}`
              : block;
          }
        }
      }

      const settings = await readRoutingSettings(ctx.supabase, ctx.ownerId);
      const t = pickTransport(settings, "upscale", "best");
      const startedAt = Date.now();
      let upscaledText: string;
      let upRes: Awaited<ReturnType<typeof upscaleChapter>>;
      try {
        upRes = await upscaleChapter(
          {
            worldMemory: worldMemoryWithPcc,
            worldCustomPrompt: world.custom_prompt ?? undefined,
            chapterTitle: chapter.title ?? undefined,
            currentText,
            userPrompt: user_prompt,
            entityCards: cards,
          },
          { transport: t.mode, model: t.model, supabase: ctx.supabase },
        );
        upscaledText = upRes.text;
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "upscale",
          parentKind: "chapter",
          parentId: chapter_id,
          model: upRes.model,
          provider: upRes.provider,
          status: "success",
          durationMs: Date.now() - startedAt,
          usage: upRes.usage
            ? {
                prompt: upRes.usage.prompt_tokens,
                completion: upRes.usage.completion_tokens,
              }
            : null,
          inputSummary: {
            entityCount: cards.length,
            promptLen: user_prompt.length,
            includePcc: wantPcc,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "upscale",
          parentKind: "chapter",
          parentId: chapter_id,
          model: t.model,
          provider: t.provider,
          status: "error",
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        });
        return fail(message);
      }

      // Insert new chapter_versions row + flip final_version_id.
      const vListRes = await ctx.supabase
        .from("chapter_versions")
        .select("rank")
        .eq("chapter_id", chapter_id);
      if (vListRes.error) return fail(vListRes.error.message);
      const newRank = nextRankAfter(
        (vListRes.data ?? []).map((v) => ({
          rank: (v as { rank: string }).rank,
        })),
      );
      const insRes = await ctx.supabase
        .from("chapter_versions")
        .insert({
          chapter_id,
          world_id: chapter.world_id,
          owner_id: ctx.ownerId,
          rank: newRank,
          origin: "upscale",
          text: upscaledText,
          user_prompt,
          parent_version_id: parentVersion.id,
        })
        .select("*")
        .single();
      if (insRes.error) return fail(`insert version: ${insRes.error.message}`);
      const newVersion = insRes.data as { id: string };

      const updRes = await ctx.supabase
        .from("chapters")
        .update({ final_version_id: newVersion.id })
        .eq("id", chapter_id);
      if (updRes.error)
        return fail(`set final_version_id: ${updRes.error.message}`);

      await ctx.logAction({
        worldId: chapter.world_id,
        actionKind: "upscale_chapter",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: {
          version_id: newVersion.id,
          parent_version_id: parentVersion.id,
          provider: upRes.provider,
          model: upRes.model,
          prompt_excerpt: user_prompt.slice(0, 120),
        },
      });
      return ok({
        version_id: newVersion.id,
        text: upscaledText,
        provider: upRes.provider,
        model: upRes.model,
      });
    },
  );

  // ─── summarize_chapter ────────────────────────────────────────────────────
  server.registerTool(
    "summarize_chapter",
    {
      title: "Summarize chapter",
      description:
        "Generate a chapter summary at the requested length (S = ~50 words, M = ~150, L = ~400) and write it to chapters.summary_{level}. Returns the generated text. Re-running overwrites the previous value.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        level: SUMMARY_LEVEL,
      },
    },
    async ({ chapter_id, level }) => {
      const chRes = await ctx.supabase
        .from("chapters")
        .select("id, world_id, title, final_version_id")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (chRes.error) return fail(chRes.error.message);
      if (!chRes.data) return fail("Chapter not found");
      const chapter = chRes.data as {
        id: string;
        world_id: string;
        title: string | null;
        final_version_id: string | null;
      };
      if (!chapter.final_version_id)
        return fail("Chapter has no final version to summarize");

      const vRes = await ctx.supabase
        .from("chapter_versions")
        .select("text")
        .eq("id", chapter.final_version_id)
        .maybeSingle();
      if (vRes.error) return fail(vRes.error.message);
      if (!vRes.data) return fail("Final version not found");
      const chapterText = htmlToPlainText(
        ((vRes.data as { text: string | null }).text ?? "") as string,
      );
      if (!chapterText.trim()) return fail("Chapter text is empty");

      const world = await loadWorld(ctx, chapter.world_id);
      if ("error" in world) return fail(world.error);

      const settings = await readRoutingSettings(ctx.supabase, ctx.ownerId);
      const t = pickTransport(settings, "summaries", "cheapest");

      const lvl: SummaryLength = level;
      const startedAt = Date.now();
      let result: Awaited<ReturnType<typeof summarize>>;
      try {
        result = await summarize(
          {
            worldMemory: world.world_memory ?? world.description ?? undefined,
            worldCustomPrompt: world.custom_prompt ?? undefined,
            chapterTitle: chapter.title ?? undefined,
            chapterText,
            length: lvl,
          },
          { transport: t.mode, model: t.model, supabase: ctx.supabase },
        );
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "summarize",
          parentKind: "chapter",
          parentId: chapter_id,
          model: result.model,
          provider: result.provider,
          status: "success",
          durationMs: Date.now() - startedAt,
          usage: result.usage
            ? {
                prompt: result.usage.prompt_tokens,
                completion: result.usage.completion_tokens,
              }
            : null,
          inputSummary: { level: lvl, textLen: chapterText.length },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logRun(ctx.supabase, {
          ownerId: ctx.ownerId,
          worldId: chapter.world_id,
          kind: "summarize",
          parentKind: "chapter",
          parentId: chapter_id,
          model: t.model,
          provider: t.provider,
          status: "error",
          durationMs: Date.now() - startedAt,
          errorMessage: message,
        });
        return fail(message);
      }

      const col =
        lvl === "S" ? "summary_s" : lvl === "M" ? "summary_m" : "summary_l";
      const updRes = await ctx.supabase
        .from("chapters")
        .update({ [col]: result.text })
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId);
      if (updRes.error) return fail(`update summary: ${updRes.error.message}`);

      await ctx.logAction({
        worldId: chapter.world_id,
        actionKind: "summarize_chapter",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: {
          level: lvl,
          provider: result.provider,
          model: result.model,
          summary_len: result.text.length,
        },
      });
      return ok({
        level: lvl,
        text: result.text,
        provider: result.provider,
        model: result.model,
      });
    },
  );
}
