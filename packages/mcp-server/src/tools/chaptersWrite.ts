import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";
import { nextRankAfter, START_RANK } from "../ranks.js";
import { plainTextToHtml, syncRichText } from "../richText.js";

const ORIGIN = z.enum(["manual_edit", "upscale"]);

export function registerChaptersWriteTools(
  server: McpServer,
  ctx: ServerContext,
) {
  server.registerTool(
    "create_chapter",
    {
      title: "Create chapter",
      description:
        "Create a chapter in a part. The first event title is REQUIRED — the tool inserts the event + chapter_events link in the same flow (business rule: every chapter has at least one linked event). The initial draft text becomes the v0 chapter_versions row.",
      inputSchema: {
        part_id: z.string().uuid(),
        title: z.string().nullish(),
        first_event_title: z.string().min(1),
        first_event_description: z.string().nullish(),
        draft: z
          .string()
          .optional()
          .describe(
            "Initial draft text. Plain text (newlines = paragraph breaks) OR Tiptap HTML for rich formatting. Supported tags: <p>, <strong>, <em>, <s>, <code>, <h1>-<h6>, <ul>/<ol>/<li>, <blockquote>, <br>, <hr>. Plain text is auto-wrapped server-side.",
          ),
        source_note_id: z.string().uuid().nullish(),
      },
    },
    async ({
      part_id,
      title,
      first_event_title,
      first_event_description,
      draft,
      source_note_id,
    }) => {
      const partRes = await ctx.supabase
        .from("parts")
        .select("id, world_id")
        .eq("id", part_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (partRes.error) return fail(partRes.error.message);
      if (!partRes.data) return fail("Part not found");
      const worldId = partRes.data.world_id;

      const sib = await ctx.supabase
        .from("chapters")
        .select("reading_rank")
        .eq("part_id", part_id);
      if (sib.error) return fail(sib.error.message);
      const reading_rank = nextRankAfter(
        (sib.data ?? []).map((s: { reading_rank: string }) => ({
          rank: s.reading_rank,
        })),
      );

      const cRes = await ctx.supabase
        .from("chapters")
        .insert({
          world_id: worldId,
          part_id,
          owner_id: ctx.ownerId,
          reading_rank,
          title: title?.trim() || null,
          source_note_id: source_note_id ?? null,
        })
        .select("*")
        .single();
      if (cRes.error) return fail(cRes.error.message);
      const chapter = cRes.data;

      const v0 = await ctx.supabase
        .from("chapter_versions")
        .insert({
          chapter_id: chapter.id,
          world_id: worldId,
          owner_id: ctx.ownerId,
          rank: START_RANK,
          origin: "draft",
          text: plainTextToHtml(draft ?? ""),
        })
        .select("id")
        .single();
      if (v0.error) {
        await ctx.supabase.from("chapters").delete().eq("id", chapter.id);
        return fail(`v0 chapter_version: ${v0.error.message}`);
      }

      const upd = await ctx.supabase
        .from("chapters")
        .update({ final_version_id: v0.data.id })
        .eq("id", chapter.id)
        .select("*")
        .single();
      if (upd.error) return fail(upd.error.message);

      // First event + link.
      const wEv = await ctx.supabase
        .from("events")
        .select("chronological_rank")
        .eq("world_id", worldId)
        .eq("owner_id", ctx.ownerId);
      if (wEv.error) return fail(wEv.error.message);
      const chronoRank = nextRankAfter(
        (wEv.data ?? []).map((e: { chronological_rank: string }) => ({
          rank: e.chronological_rank,
        })),
      );
      const evDesc = syncRichText({
        plain: first_event_description?.trim() || null,
        html: null,
      });
      const ev = await ctx.supabase
        .from("events")
        .insert({
          world_id: worldId,
          owner_id: ctx.ownerId,
          title: first_event_title.trim(),
          chronological_rank: chronoRank,
          description: evDesc.plain,
          description_html: evDesc.html,
        })
        .select("id, title")
        .single();
      if (ev.error) {
        await ctx.supabase.from("chapters").delete().eq("id", chapter.id);
        return fail(`first_event: ${ev.error.message}`);
      }
      const ce = await ctx.supabase.from("chapter_events").insert({
        chapter_id: chapter.id,
        event_id: ev.data.id,
        world_id: worldId,
        owner_id: ctx.ownerId,
        narrative_rank: START_RANK,
      });
      if (ce.error) return fail(ce.error.message);

      await ctx.logAction({
        worldId,
        actionKind: "create_chapter",
        targetKind: "chapter",
        targetId: chapter.id,
        payload: {
          title: chapter.title,
          first_event_id: ev.data.id,
          first_event_title: ev.data.title,
        },
      });
      return ok({
        ...upd.data,
        first_event_id: ev.data.id,
        v0_version_id: v0.data.id,
      });
    },
  );

  server.registerTool(
    "update_chapter",
    {
      title: "Update chapter",
      description:
        "Patch a chapter. status='published' freezes mutations app-side (the agent can still write, but the app UI will surface this as published).",
      inputSchema: {
        chapter_id: z.string().uuid(),
        title: z.string().nullish(),
        reading_rank: z.string().min(1).optional(),
        summary_s: z.string().nullish(),
        summary_m: z.string().nullish(),
        summary_l: z.string().nullish(),
        status: z.enum(["draft", "published"]).optional(),
      },
    },
    async ({
      chapter_id,
      title,
      reading_rank,
      summary_s,
      summary_m,
      summary_l,
      status,
    }) => {
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title;
      if (reading_rank !== undefined) patch.reading_rank = reading_rank;
      if (summary_s !== undefined) patch.summary_s = summary_s;
      if (summary_m !== undefined) patch.summary_m = summary_m;
      if (summary_l !== undefined) patch.summary_l = summary_l;
      if (status !== undefined) {
        patch.status = status;
        patch.published_at =
          status === "published" ? new Date().toISOString() : null;
      }
      if (Object.keys(patch).length === 0) return fail("No fields to update");
      const r = await ctx.supabase
        .from("chapters")
        .update(patch)
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Chapter not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "update_chapter",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: { title: r.data.title, fields: Object.keys(patch) },
      });
      return ok(r.data);
    },
  );

  server.registerTool(
    "delete_chapter",
    {
      title: "Delete chapter",
      description:
        "Hard-delete a chapter. Cascades chapter_versions, chapter_events, chapter_participants.",
      inputSchema: { chapter_id: z.string().uuid() },
    },
    async ({ chapter_id }) => {
      const sel = await ctx.supabase
        .from("chapters")
        .select("world_id, title")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (sel.error) return fail(sel.error.message);
      if (!sel.data) return fail("Chapter not found");
      const r = await ctx.supabase
        .from("chapters")
        .delete()
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId);
      if (r.error) return fail(r.error.message);
      await ctx.logAction({
        worldId: sel.data.world_id,
        actionKind: "delete_chapter",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: { title: sel.data.title },
      });
      return ok({ id: chapter_id });
    },
  );

  server.registerTool(
    "append_chapter_version",
    {
      title: "Append chapter version",
      description:
        "Append a new chapter_versions row (origin='manual_edit' or 'upscale') and set it as the chapter's final_version_id by default. Use for: agent-driven manual edits, snapshots, or when you have an upscaled text without going through the upscale_chapter intent. `text` may be plain text (newlines = paragraph breaks) or Tiptap-compatible HTML; plain text is auto-wrapped server-side.",
      inputSchema: {
        chapter_id: z.string().uuid(),
        text: z
          .string()
          .describe(
            "Chapter text. Plain text (newlines = paragraph breaks) OR Tiptap HTML for rich formatting. Supported tags: <p>, <strong>, <em>, <s>, <code>, <h1>-<h6>, <ul>/<ol>/<li>, <blockquote>, <br>, <hr>. Plain text is auto-wrapped server-side.",
          ),
        origin: ORIGIN,
        user_prompt: z.string().nullish(),
        parent_version_id: z.string().uuid().nullish(),
        make_final: z.boolean().optional(),
      },
    },
    async ({
      chapter_id,
      text,
      origin,
      user_prompt,
      parent_version_id,
      make_final,
    }) => {
      const cRes = await ctx.supabase
        .from("chapters")
        .select("world_id, title")
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .maybeSingle();
      if (cRes.error) return fail(cRes.error.message);
      if (!cRes.data) return fail("Chapter not found");
      const worldId = cRes.data.world_id;

      const ex = await ctx.supabase
        .from("chapter_versions")
        .select("rank")
        .eq("chapter_id", chapter_id);
      if (ex.error) return fail(ex.error.message);
      const rank = nextRankAfter(
        (ex.data ?? []).map((v: { rank: string }) => ({ rank: v.rank })),
      );

      const ins = await ctx.supabase
        .from("chapter_versions")
        .insert({
          chapter_id,
          world_id: worldId,
          owner_id: ctx.ownerId,
          rank,
          origin,
          text: plainTextToHtml(text),
          user_prompt: user_prompt ?? null,
          parent_version_id: parent_version_id ?? null,
        })
        .select("*")
        .single();
      if (ins.error) return fail(ins.error.message);

      const isFinal = make_final ?? true;
      if (isFinal) {
        const upd = await ctx.supabase
          .from("chapters")
          .update({ final_version_id: ins.data.id })
          .eq("id", chapter_id);
        if (upd.error) return fail(upd.error.message);
      }

      await ctx.logAction({
        worldId,
        actionKind: "append_chapter_version",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: {
          chapter_title: cRes.data.title,
          version_id: ins.data.id,
          origin,
          made_final: isFinal,
        },
      });
      return ok(ins.data);
    },
  );

  server.registerTool(
    "set_chapter_final_version",
    {
      title: "Set chapter final version",
      description:
        "Explicitly point a chapter's final_version_id at an existing chapter_versions row (e.g. to roll back to an earlier draft).",
      inputSchema: {
        chapter_id: z.string().uuid(),
        version_id: z.string().uuid(),
      },
    },
    async ({ chapter_id, version_id }) => {
      const vRes = await ctx.supabase
        .from("chapter_versions")
        .select("id, chapter_id")
        .eq("id", version_id)
        .maybeSingle();
      if (vRes.error) return fail(vRes.error.message);
      if (!vRes.data) return fail("Version not found");
      if (vRes.data.chapter_id !== chapter_id)
        return fail("Version does not belong to this chapter");
      const r = await ctx.supabase
        .from("chapters")
        .update({ final_version_id: version_id })
        .eq("id", chapter_id)
        .eq("owner_id", ctx.ownerId)
        .select("*")
        .maybeSingle();
      if (r.error) return fail(r.error.message);
      if (!r.data) return fail("Chapter not found");
      await ctx.logAction({
        worldId: r.data.world_id,
        actionKind: "set_chapter_final_version",
        targetKind: "chapter",
        targetId: chapter_id,
        payload: { version_id },
      });
      return ok(r.data);
    },
  );
}
