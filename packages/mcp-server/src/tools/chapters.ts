import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";

const SUMMARY_LEVEL = z.enum(["s", "m", "l"]);
const PCC_LEVEL = z.enum(["raw", "L", "M", "S"]);

export function registerChaptersReadTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "list_chapters",
    {
      title: "List chapters",
      description:
        "List chapters in a world (or limited to one book), sorted by reading_rank within their part.",
      inputSchema: {
        world_id: z.string().uuid(),
        book_id: z.string().uuid().optional(),
      },
    },
    async ({ world_id, book_id }) => {
      let q = ctx.supabase
        .from("chapters")
        .select("*")
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId)
        .order("reading_rank", { ascending: true });
      if (book_id) {
        const partsRes = await ctx.supabase
          .from("parts")
          .select("id")
          .eq("book_id", book_id);
        if (partsRes.error) return fail(partsRes.error.message);
        const partIds = (partsRes.data ?? []).map((p) => p.id);
        if (partIds.length === 0) return ok([]);
        q = q.in("part_id", partIds);
      }
      const r = await q;
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "get_chapter",
    {
      title: "Get chapter",
      description:
        "Fetch a chapter with its current final version text, linked events (ordered by narrative_rank), and pinned participants.",
      inputSchema: { chapter_id: z.string().uuid() },
    },
    async ({ chapter_id }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("*")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");
      const chapter = cRes.data as {
        id: string;
        final_version_id: string | null;
      } & Record<string, unknown>;

      let final_version_text: string | null = null;
      if (chapter.final_version_id) {
        const vRes = await ctx.supabase
          .from("chapter_versions")
          .select("text")
          .eq("id", chapter.final_version_id)
          .maybeSingle();
        if (vRes.error) return fail(vRes.error.message);
        final_version_text = (vRes.data?.text ?? null) as string | null;
      }

      const ceRes = await ctx.supabase
        .from("chapter_events")
        .select("event_id, narrative_rank")
        .eq("chapter_id", chapter_id)
        .order("narrative_rank", { ascending: true });
      if (ceRes.error) return fail(ceRes.error.message);
      const eventIds = (ceRes.data ?? []).map((x) => x.event_id);
      const eventsById = new Map<
        string,
        {
          id: string;
          title: string;
          chronological_rank: string;
        }
      >();
      if (eventIds.length > 0) {
        const eRes = await ctx.supabase
          .from("events")
          .select("id, title, chronological_rank")
          .in("id", eventIds);
        if (eRes.error) return fail(eRes.error.message);
        for (const e of (eRes.data ?? []) as Array<{
          id: string;
          title: string;
          chronological_rank: string;
        }>) {
          eventsById.set(e.id, e);
        }
      }
      const linked_events = (ceRes.data ?? []).map((x) => ({
        event_id: x.event_id,
        narrative_rank: x.narrative_rank,
        title: eventsById.get(x.event_id)?.title ?? null,
        chronological_rank:
          eventsById.get(x.event_id)?.chronological_rank ?? null,
      }));

      const cpRes = await ctx.supabase
        .from("chapter_participants")
        .select("entity_id")
        .eq("chapter_id", chapter_id);
      if (cpRes.error) return fail(cpRes.error.message);
      const entityIds = (cpRes.data ?? []).map((x) => x.entity_id);
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
      const participants = (cpRes.data ?? []).map((x) => ({
        entity_id: x.entity_id,
        entity_name: entitiesById.get(x.entity_id)?.name ?? null,
      }));

      return ok({
        ...chapter,
        final_version_text,
        linked_events,
        participants,
      });
    },
  );

  server.registerTool(
    "get_chapter_summary",
    {
      title: "Get chapter summary",
      description:
        "Read the chapter's pre-computed summary at level 's' (short), 'm' (medium) or 'l' (long). Returns null if not generated yet.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        level: SUMMARY_LEVEL,
      },
    },
    async ({ chapter_id, level }) => {
      const col =
        level === "s" ? "summary_s" : level === "m" ? "summary_m" : "summary_l";
      const r = await ctx.supabase
        .from("chapters")
        .select(col)
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Chapter not found");
      return ok({
        chapter_id,
        level,
        text: (r.data as Record<string, string | null>)[col] ?? null,
      });
    },
  );

  server.registerTool(
    "get_pcc",
    {
      title: "Get previous chapter context",
      description:
        "Build the PCC (Previous Chapter Context) array for a chapter: for each prior chapter (in reading order), the configured detail level (raw / L / M / S). Mirrors the world's `previous_chapter_context` config.",
      inputSchema: { chapter_id: z.string().uuid() },
    },
    async ({ chapter_id }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("id, world_id, part_id, reading_rank")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");

      const wRes = await ctx.supabase
        .from("worlds")
        .select("previous_chapter_context")
        .eq("id", cRes.data.world_id)
        .maybeSingle();
      if (wRes.error) return fail(wRes.error.message);
      const pccConfig = (wRes.data?.previous_chapter_context ?? []) as Array<
        "raw" | "L" | "M" | "S"
      >;
      if (pccConfig.length === 0) return ok([]);

      // All chapters in the world, with their part to derive global reading order.
      const chRes = await ctx.supabase
        .from("chapters")
        .select(
          "id, part_id, reading_rank, final_version_id, summary_s, summary_m, summary_l",
        )
        .eq("world_id", cRes.data.world_id)
        .eq("owner_id", ctx.ownerId);
      if (chRes.error) return fail(chRes.error.message);
      const partsRes = await ctx.supabase
        .from("parts")
        .select("id, book_id, rank")
        .eq("world_id", cRes.data.world_id)
        .eq("owner_id", ctx.ownerId);
      if (partsRes.error) return fail(partsRes.error.message);
      const booksRes = await ctx.supabase
        .from("books")
        .select("id, rank")
        .eq("world_id", cRes.data.world_id)
        .eq("owner_id", ctx.ownerId);
      if (booksRes.error) return fail(booksRes.error.message);
      const partRank = new Map<string, string>();
      const partBook = new Map<string, string>();
      for (const p of (partsRes.data ?? []) as Array<{
        id: string;
        book_id: string;
        rank: string;
      }>) {
        partRank.set(p.id, p.rank);
        partBook.set(p.id, p.book_id);
      }
      const bookRank = new Map<string, string>();
      for (const b of (booksRes.data ?? []) as Array<{
        id: string;
        rank: string;
      }>) {
        bookRank.set(b.id, b.rank);
      }
      const chapters = (chRes.data ?? []) as Array<{
        id: string;
        part_id: string;
        reading_rank: string;
        final_version_id: string | null;
        summary_s: string | null;
        summary_m: string | null;
        summary_l: string | null;
      }>;
      const sorted = chapters.slice().sort((a, b) => {
        const ba = bookRank.get(partBook.get(a.part_id) ?? "") ?? "";
        const bb = bookRank.get(partBook.get(b.part_id) ?? "") ?? "";
        if (ba !== bb) return ba < bb ? -1 : 1;
        const pa = partRank.get(a.part_id) ?? "";
        const pb = partRank.get(b.part_id) ?? "";
        if (pa !== pb) return pa < pb ? -1 : 1;
        return a.reading_rank < b.reading_rank
          ? -1
          : a.reading_rank > b.reading_rank
            ? 1
            : 0;
      });
      const idx = sorted.findIndex((c) => c.id === chapter_id);
      if (idx === -1) return ok([]);
      const priors = sorted.slice(Math.max(0, idx - pccConfig.length), idx);
      // pccConfig[0] = configuration for chapter immediately before; pccConfig[1] = two before; ...
      const out: Array<{
        chapter_id: string;
        level: "raw" | "L" | "M" | "S";
        text: string | null;
      }> = [];
      for (let i = 0; i < priors.length; i++) {
        const prior = priors[priors.length - 1 - i];
        const level = pccConfig[i];
        let text: string | null = null;
        if (level === "raw" && prior.final_version_id) {
          const fvRes = await ctx.supabase
            .from("chapter_versions")
            .select("text")
            .eq("id", prior.final_version_id)
            .maybeSingle();
          text = (fvRes.data?.text ?? null) as string | null;
        } else if (level === "L") {
          text = prior.summary_l;
        } else if (level === "M") {
          text = prior.summary_m;
        } else if (level === "S") {
          text = prior.summary_s;
        }
        out.push({ chapter_id: prior.id, level, text });
      }
      return ok(out);
    },
  );

  // Re-exports the level enum for completeness; not registered as its own tool.
  void PCC_LEVEL;
}
