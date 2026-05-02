import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";

const SEARCH_LIMIT = 15;

function htmlToText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text: string, query: string, maxLen = 200): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const q = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const idx = q ? lower.indexOf(q) : -1;
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + 140);
  const prefix = start > 0 ? "… " : "";
  const suffix = end < text.length ? " …" : "";
  return prefix + text.slice(start, end) + suffix;
}

export function registerSearchTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "search",
    {
      title: "Search world",
      description:
        "Full-text search across notes, chapters (final version text), and entities in a world. Returns up to ~15 hits per kind, grouped.",
      inputSchema: {
        world_id: z.string().uuid(),
        query: z.string().min(2),
      },
    },
    async ({ world_id, query }) => {
      const trimmed = query.trim();
      const cfg = { config: "simple", type: "websearch" as const };

      const [notesRes, chaptersRes, entitiesRes] = await Promise.all([
        ctx.supabase
          .from("notes")
          .select("id, title, content")
          .eq("world_id", world_id)
          .eq("owner_id", ctx.ownerId)
          .textSearch("search_text", trimmed, cfg)
          .limit(SEARCH_LIMIT),
        ctx.supabase
          .from("chapter_versions")
          .select("id, chapter_id, text")
          .eq("world_id", world_id)
          .eq("owner_id", ctx.ownerId)
          .textSearch("search_text", trimmed, cfg)
          .limit(SEARCH_LIMIT),
        ctx.supabase
          .from("entities")
          .select("id, name, aliases")
          .eq("world_id", world_id)
          .eq("owner_id", ctx.ownerId)
          .textSearch("search_text", trimmed, cfg)
          .limit(SEARCH_LIMIT),
      ]);
      if (notesRes.error) return fail(notesRes.error.message);
      if (chaptersRes.error) return fail(chaptersRes.error.message);
      if (entitiesRes.error) return fail(entitiesRes.error.message);

      const chapterIds = Array.from(
        new Set(
          (chaptersRes.data ?? []).map(
            (cv: { chapter_id: string }) => cv.chapter_id,
          ),
        ),
      );
      const chapterTitleById = new Map<string, string | null>();
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
          chapterTitleById.set(c.id, c.title);
        }
      }

      const notes = (notesRes.data ?? []).map((n) => ({
        id: n.id,
        title: n.title?.trim() || "(untitled)",
        snippet: snippet(htmlToText(n.content as string | null), trimmed),
      }));
      const seen = new Set<string>();
      const chapters: Array<{
        chapter_id: string;
        title: string;
        snippet: string;
      }> = [];
      for (const cv of (chaptersRes.data ?? []) as Array<{
        chapter_id: string;
        text: string | null;
      }>) {
        if (seen.has(cv.chapter_id)) continue;
        seen.add(cv.chapter_id);
        chapters.push({
          chapter_id: cv.chapter_id,
          title:
            chapterTitleById.get(cv.chapter_id)?.trim() ||
            "(untitled chapter)",
          snippet: snippet(htmlToText(cv.text), trimmed),
        });
      }
      const entities = (entitiesRes.data ?? []).map(
        (e: { id: string; name: string; aliases: string[] | null }) => ({
          id: e.id,
          name: e.name,
          aliases: e.aliases ?? [],
        }),
      );

      return ok({ notes, chapters, entities });
    },
  );
}
