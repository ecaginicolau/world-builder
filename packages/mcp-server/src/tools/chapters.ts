import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { buildPcc } from "../pcc.js";

const SUMMARY_LEVEL = z.enum(["s", "m", "l"]);

export function registerChaptersReadTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "list_chapters",
    {
      title: "List chapters",
      description:
        "List chapters in a world (or limited to one book), in full reading order: book.rank → part.rank → reading_rank. " +
        "Each row carries a 1-indexed `position` (across the returned set) and `book_position` (within its book). " +
        "ALWAYS use these ordinals — not the fractional `reading_rank` strings (e.g. 'a0', 'a0V') — when telling the user 'chapter N' or comparing order. " +
        "Fractional ranks sort correctly lexicographically but are easy to misread; the ordinals are the single source of truth.",
      inputSchema: {
        world_id: z.string().uuid(),
        book_id: z.string().uuid().optional(),
      },
    },
    async ({ world_id, book_id }) => {
      let q = ctx.supabase
        .from("chapters")
        .select(
          "*, parts!inner(rank, book_id, title, books!inner(rank, title))",
        )
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId);
      if (book_id) {
        q = q.eq("parts.book_id", book_id);
      }
      const r = await q;
      if (r.error) return fail(r.error.message);
      type Row = Record<string, unknown> & {
        reading_rank: string;
        parts: {
          rank: string;
          book_id: string;
          title: string | null;
          books: { rank: string; title: string };
        };
      };
      const rows = (r.data ?? []) as Row[];
      rows.sort((a, b) => {
        const ba = a.parts.books.rank;
        const bb = b.parts.books.rank;
        if (ba !== bb) return ba < bb ? -1 : 1;
        const pa = a.parts.rank;
        const pb = b.parts.rank;
        if (pa !== pb) return pa < pb ? -1 : 1;
        if (a.reading_rank === b.reading_rank) return 0;
        return a.reading_rank < b.reading_rank ? -1 : 1;
      });
      const bookCounters = new Map<string, number>();
      const stripped = rows.map((row, i) => {
        const bookId = row.parts.book_id;
        const bookPos = (bookCounters.get(bookId) ?? 0) + 1;
        bookCounters.set(bookId, bookPos);
        const { parts: _parts, ...rest } = row;
        return {
          position: i + 1,
          book_position: bookPos,
          book_id: bookId,
          book_title: row.parts.books.title,
          part_title: row.parts.title,
          ...rest,
        };
      });
      return ok(stripped);
    },
  );

  server.registerTool(
    "get_chapter",
    {
      title: "Get chapter",
      description:
        "Fetch a chapter with its current final version text, linked events (ordered by narrative_rank), and pinned participants. " +
        "Includes optional `chapter_header` and `chapter_footer` (rich-text HTML rendered above/below the chapter in reader views — null/empty = none).",
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
      const r = await buildPcc(ctx.supabase, ctx.ownerId, chapter_id);
      if (!r.ok) return fail(r.error);
      return ok(
        r.slots.map((s) => ({
          chapter_id: s.chapter_id,
          level: s.level,
          text: s.text,
        })),
      );
    },
  );
}
