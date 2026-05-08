import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, fromSupabase, ok } from "../response.js";

const ANNOTATION_LIMIT = 200;
const KIND = z.enum(["up", "down", "comment"]);

export function registerReaderAnnotationsTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "list_share_links",
    {
      title: "List share links",
      description:
        "List public share links for a world (optionally filtered to one book). Each link gives external readers token-gated access to a book and is the parent of reader sessions + annotations.",
      inputSchema: {
        world_id: z.string().uuid(),
        book_id: z.string().uuid().optional(),
      },
    },
    async ({ world_id, book_id }) => {
      let q = ctx.supabase
        .from("share_links")
        .select(
          "id, book_id, label, active, allow_comments, include_drafts, expires_at, created_at",
        )
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId)
        .order("created_at", { ascending: false });
      if (book_id) q = q.eq("book_id", book_id);
      const r = await q;
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "list_reader_sessions",
    {
      title: "List reader sessions",
      description:
        "List reader sessions registered against a share link (one row per reader who opened the link and entered a name). Sorted by last_seen_at desc.",
      inputSchema: { share_link_id: z.string().uuid() },
    },
    async ({ share_link_id }) => {
      const linkRes = await ctx.supabase
        .from("share_links")
        .select("id")
        .eq("id", share_link_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (linkRes.error) return fail(linkRes.error.message);
      if (!linkRes.data)
        return fail("Share link not found or not owned by this user");

      const r = await ctx.supabase
        .from("reader_sessions")
        .select("id, name, first_seen_at, last_seen_at")
        .eq("share_link_id", share_link_id)
        .order("last_seen_at", { ascending: false });
      return fromSupabase(r);
    },
  );

  server.registerTool(
    "list_reader_annotations",
    {
      title: "List reader annotations",
      description:
        "List reader annotations (👍 / 👎 / comment on a text selection) for a chapter or for a share link. Provide exactly one of `chapter_id` or `share_link_id`. Newest first. Each row includes the anchored selected_text + before/after context, the comment body (if any), and the reader's display name.",
      inputSchema: {
        chapter_id: z.string().uuid().optional(),
        share_link_id: z.string().uuid().optional(),
        kind: KIND.optional(),
        limit: z.number().int().min(1).max(500).optional(),
      },
    },
    async ({ chapter_id, share_link_id, kind, limit }) => {
      if (!chapter_id && !share_link_id)
        return fail("Provide one of chapter_id or share_link_id");
      if (chapter_id && share_link_id)
        return fail("Provide only one of chapter_id or share_link_id, not both");

      const lim = limit ?? ANNOTATION_LIMIT;

      // Owner scoping: annotations have no owner_id column. We always join
      // through share_links and require share_links.owner_id = ownerId via an
      // inner join, so the agent only sees annotations on its own books.
      let q = ctx.supabase
        .from("reader_annotations")
        .select(
          "id, share_link_id, reader_session_id, chapter_id, kind, selected_text, before_ctx, after_ctx, comment_body, created_at, share_links!inner(owner_id)",
        )
        .eq("share_links.owner_id", ctx.ownerId)
        .order("created_at", { ascending: false })
        .limit(lim);

      if (chapter_id) {
        // Validate chapter belongs to owner before exposing annotations.
        const chRes = await ctx.supabase
          .from("chapters")
          .select("id")
          .eq("id", chapter_id)
          .eq("owner_id", ctx.ownerId)
          .maybeSingle();
        if (chRes.error) return fail(chRes.error.message);
        if (!chRes.data)
          return fail("Chapter not found or not owned by this user");
        q = q.eq("chapter_id", chapter_id);
      } else if (share_link_id) {
        const linkRes = await ctx.supabase
          .from("share_links")
          .select("id")
          .eq("id", share_link_id)
          .eq("owner_id", ctx.ownerId)
          .maybeSingle();
        if (linkRes.error) return fail(linkRes.error.message);
        if (!linkRes.data)
          return fail("Share link not found or not owned by this user");
        q = q.eq("share_link_id", share_link_id);
      }

      if (kind) q = q.eq("kind", kind);

      const r = await q;
      if (r.error) return fail(r.error.message);
      type Row = {
        id: string;
        share_link_id: string;
        reader_session_id: string;
        chapter_id: string;
        kind: "up" | "down" | "comment";
        selected_text: string;
        before_ctx: string;
        after_ctx: string;
        comment_body: string | null;
        created_at: string;
      };
      const rows = ((r.data ?? []) as unknown[]).map((row) => {
        const { share_links: _sl, ...rest } = row as Row & {
          share_links: unknown;
        };
        return rest as Row;
      });

      const sessionIds = Array.from(
        new Set(rows.map((row) => row.reader_session_id)),
      );
      const sessionsById = new Map<string, { id: string; name: string }>();
      if (sessionIds.length > 0) {
        const sRes = await ctx.supabase
          .from("reader_sessions")
          .select("id, name")
          .in("id", sessionIds);
        if (sRes.error) return fail(sRes.error.message);
        for (const s of (sRes.data ?? []) as Array<{
          id: string;
          name: string;
        }>) {
          sessionsById.set(s.id, s);
        }
      }

      const enriched = rows.map((row) => ({
        ...row,
        reader_name: sessionsById.get(row.reader_session_id)?.name ?? null,
      }));

      return ok(enriched);
    },
  );
}
