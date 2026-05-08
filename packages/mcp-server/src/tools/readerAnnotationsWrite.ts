import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";

export function registerReaderAnnotationsWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "delete_reader_annotation",
    {
      title: "Delete reader annotation",
      description:
        "Delete a reader annotation (👍 / 👎 / comment) once it has been addressed in the prose. Use this for moderation or to clear feedback the author has acted on. Owner-scoped via the parent share_link. Logged in agent_actions.",
      inputSchema: { annotation_id: z.string().uuid() },
    },
    async ({ annotation_id }) => {
      // Load the annotation + parent share_link in one shot, with an inner
      // join so we can verify ownership and pull world_id for logging.
      const aRes = await ctx.supabase
        .from("reader_annotations")
        .select(
          "id, chapter_id, kind, share_link_id, share_links!inner(owner_id, world_id)",
        )
        .eq("id", annotation_id)
        .maybeSingle();
      if (aRes.error) return fail(aRes.error.message);
      if (!aRes.data) return fail("Annotation not found");

      const ann = aRes.data as unknown as {
        id: string;
        chapter_id: string;
        kind: "up" | "down" | "comment";
        share_link_id: string;
        share_links: { owner_id: string; world_id: string };
      };
      if (ann.share_links.owner_id !== ctx.ownerId) {
        return fail("Annotation not owned by this user");
      }

      const dRes = await ctx.supabase
        .from("reader_annotations")
        .delete()
        .eq("id", annotation_id);
      if (dRes.error) return fail(dRes.error.message);

      await ctx.logAction({
        worldId: ann.share_links.world_id,
        actionKind: "delete_reader_annotation",
        targetKind: "reader_annotation",
        targetId: annotation_id,
        payload: {
          annotation_id,
          chapter_id: ann.chapter_id,
          share_link_id: ann.share_link_id,
          kind: ann.kind,
        },
      });
      return ok({ annotation_id });
    },
  );
}
