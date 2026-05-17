import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { nextRankAfter } from "../ranks.js";

export function registerBooksPartsWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  // Books
  server.registerTool(
    "create_book",
    {
      title: "Create book",
      description: "Create a new book at the end of the world's book list.",
      inputSchema: {
        world_id: z.string().uuid(),
        title: z.string().min(1),
        series_title: z.string().nullish(),
        description: z.string().nullish(),
      },
    },
    async ({ world_id, title, series_title, description }) => {
      const ex = await ctx.supabase
        .from("books")
        .select("rank")
        .eq("world_id", world_id);
      if (ex.error) return fail(ex.error.message);
      const rank = nextRankAfter(ex.data ?? []);
      const r = await ctx.supabase
        .from("books")
        .insert({
          world_id,
          owner_id: ctx.ownerId,
          title: title.trim(),
          series_title: series_title ?? null,
          description: description ?? null,
          rank,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: world_id,
        actionKind: "create_book",
        targetKind: "book",
        targetId: r.data.id,
        payload: { title: r.data.title },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "update_book",
    {
      title: "Update book",
      description: "Patch a book's title, series, description, or back cover.",
      inputSchema: {
        book_id: z.string().uuid(),
        title: z.string().min(1).optional(),
        series_title: z.string().nullish(),
        description: z.string().nullish(),
        back_cover: z.string().nullish(),
      },
    },
    async ({ book_id, title, series_title, description, back_cover }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title.trim();
      if (series_title !== undefined) patch.series_title = series_title;
      if (description !== undefined) patch.description = description;
      if (back_cover !== undefined) patch.back_cover = back_cover;
      if (Object.keys(patch).length === 0) return fail("No fields to update");
      const r = await ctx.supabase
        .from("books")
        .update(patch)
        .eq("id", book_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Book not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_book",
        targetKind: "book",
        targetId: book_id,
        payload: { title: r.data.title, fields: Object.keys(patch) },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "delete_book",
    {
      title: "Delete book",
      description:
        "Hard-delete a book. Cascades parts and chapters and their versions.",
      inputSchema: { book_id: z.string().uuid() },
    },
    async ({ book_id }) => {
      const sel = await ctx.supabase
        .from("books")
        .select("world_id, title")
        .eq("id", book_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Book not found");
      const r = await ctx.supabase
        .from("books")
        .delete()
        .eq("id", book_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_book",
        targetKind: "book",
        targetId: book_id,
        payload: { title: sel.data.title },
      });
      return ok({ id: book_id });
    },
  );

  // Parts
  server.registerTool(
    "create_part",
    {
      title: "Create part",
      description:
        "Create a new part inside a book. Title is optional (single-part books typically have null titles).",
      inputSchema: {
        book_id: z.string().uuid(),
        title: z.string().nullish(),
      },
    },
    async ({ book_id, title }) => {
      const bRes = await ctx.supabase
        .from("books")
        .select("world_id")
        .eq("id", book_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (bRes.error) return fail(bRes.error.message);
      if (!bRes.data) return fail("Book not found");
      const ex = await ctx.supabase
        .from("parts")
        .select("rank")
        .eq("book_id", book_id);
      if (ex.error) return fail(ex.error.message);
      const rank = nextRankAfter(ex.data ?? []);
      const r = await ctx.supabase
        .from("parts")
        .insert({
          book_id,
          world_id: bRes.data.world_id,
          owner_id: ctx.ownerId,
          rank,
          title: title?.trim() || null,
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: bRes.data.world_id,
        actionKind: "create_part",
        targetKind: "part",
        targetId: r.data.id,
        payload: { title: r.data.title, book_id },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "update_part",
    {
      title: "Update part",
      description: "Patch a part's title.",
      inputSchema: {
        part_id: z.string().uuid(),
        title: z.string().nullish(),
      },
    },
    async ({ part_id, title }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (Object.keys(patch).length === 0) return fail("No fields to update");
      const r = await ctx.supabase
        .from("parts")
        .update(patch)
        .eq("id", part_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Part not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_part",
        targetKind: "part",
        targetId: part_id,
        payload: { title: r.data.title },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "delete_part",
    {
      title: "Delete part",
      description: "Hard-delete a part. Cascades chapters.",
      inputSchema: { part_id: z.string().uuid() },
    },
    async ({ part_id }) => {
      const sel = await ctx.supabase
        .from("parts")
        .select("world_id, title")
        .eq("id", part_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Part not found");
      const r = await ctx.supabase
        .from("parts")
        .delete()
        .eq("id", part_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_part",
        targetKind: "part",
        targetId: part_id,
        payload: { title: sel.data.title },
      });
      return ok({ id: part_id });
    },
  );
}
