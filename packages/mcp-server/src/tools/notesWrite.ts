import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { plainTextToHtml } from "../richText.js";

export function registerNotesWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description:
        "Create a new open note in a world. Content can be plain text or HTML (Tiptap-compatible).",
      inputSchema: {
        world_id: z.string().uuid(),
        title: z.string().nullish(),
        content: z
          .string()
          .optional()
          .describe(
            "Note body. Plain text (newlines = paragraph breaks) OR Tiptap HTML for rich formatting. Supported tags: <p>, <strong>, <em>, <s>, <code>, <h1>-<h6>, <ul>/<ol>/<li>, <blockquote>, <br>, <hr>. Plain text is auto-wrapped server-side.",
          ),
      },
    },
    async ({ world_id, title, content }) => {
      const r = await ctx.supabase
        .from("notes")
        .insert({
          world_id,
          owner_id: ctx.ownerId,
          title: title ?? null,
          content: plainTextToHtml(content ?? ""),
        })
        .select("*")
        .single();
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: world_id,
        actionKind: "create_note",
        targetKind: "note",
        targetId: r.data.id,
        payload: { title: r.data.title },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description:
        "Patch an existing note. Pass only the fields you want to change.",
      inputSchema: {
        note_id: z.string().uuid(),
        title: z.string().nullish(),
        content: z
          .string()
          .optional()
          .describe(
            "Note body. Plain text (newlines = paragraph breaks) OR Tiptap HTML for rich formatting. Supported tags: <p>, <strong>, <em>, <s>, <code>, <h1>-<h6>, <ul>/<ol>/<li>, <blockquote>, <br>, <hr>. Plain text is auto-wrapped server-side.",
          ),
        status: z.enum(["open", "archived"]).optional(),
      },
    },
    async ({ note_id, title, content, status }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = plainTextToHtml(content);
      if (status !== undefined) patch.status = status;
      if (Object.keys(patch).length === 0)
        return fail("No fields to update");
      const r = await ctx.supabase
        .from("notes")
        .update(patch)
        .eq("id", note_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Note not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_note",
        targetKind: "note",
        targetId: note_id,
        payload: { fields: Object.keys(patch), title: r.data.title },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description:
        "Hard-delete a note. Cascades note_entities, note_promotions, note↔chat_threads.",
      inputSchema: { note_id: z.string().uuid() },
    },
    async ({ note_id }) => {
      const sel = await ctx.supabase
        .from("notes")
        .select("world_id, title")
        .eq("id", note_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Note not found");
      const r = await ctx.supabase
        .from("notes")
        .delete()
        .eq("id", note_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_note",
        targetKind: "note",
        targetId: note_id,
        payload: { title: sel.data.title },
      });
      return ok({ id: note_id });
    },
  );
}
