import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ok, fail } from '../response.js';
import { owned, bookData } from '../print/data.js';
import { editLayout, layoutBlocks, illustrationUses, textHash } from '../print/layout.js';
import { nextRankAfter } from '../ranks.js';

export async function layoutState(ctx: ServerContext, id: string) {
  const chapter = await owned(ctx, 'chapters', id);
  if (!chapter.final_version_id) throw new Error('Chapter has no final version');
  const version = await owned(ctx, 'chapter_versions', chapter.final_version_id);
  if (version.chapter_id !== id) throw new Error('Chapter version mismatch');
  return {
    chapter,
    version,
    revision: textHash(
      JSON.stringify([chapter.updated_at, chapter.final_version_id, version.text]),
    ),
  };
}

export async function usageReport(ctx: ServerContext, bookId: string) {
  const { book, chapters } = await bookData(ctx, bookId);
  const uses = chapters.flatMap((c) => [
    ...(c.opening_illustration_id
      ? [
          {
            chapter_id: c.id,
            chapter_title: c.title,
            illustration_id: c.opening_illustration_id,
            kind: 'opening',
            location: 'opening',
            block_index: -1,
          },
        ]
      : []),
    ...(['text', 'chapter_header', 'chapter_footer'] as const).flatMap((location) =>
      illustrationUses(c[location] ?? '').map((u) => ({
        ...u,
        chapter_id: c.id,
        chapter_title: c.title,
        location,
      })),
    ),
  ]);
  const ids = [...new Set(uses.map((u) => u.illustration_id))];
  const illustrations = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await ctx.supabase
      .from('entity_illustrations')
      .select('*')
      .in('id', ids.slice(i, i + 200))
      .eq('owner_id', ctx.ownerId)
      .eq('world_id', book.world_id);
    if (error) throw new Error(error.message);
    illustrations.push(...(data ?? []));
  }
  const present = new Set(illustrations.map((i) => i.id));
  return {
    book_id: bookId,
    uses,
    illustrations,
    missing_ids: ids.filter((id) => !present.has(id)),
    duplicates: ids
      .filter((id) => uses.filter((u) => u.illustration_id === id).length > 1)
      .map((id) => ({ illustration_id: id, uses: uses.filter((u) => u.illustration_id === id) })),
    chapters: chapters.map((c) => ({
      chapter_id: c.id,
      title: c.title,
      is_preface: c.is_preface,
      illustration_count: uses.filter((u) => u.chapter_id === c.id).length,
      has_opening: !!c.opening_illustration_id,
      body_illustration_count: uses.filter((u) => u.chapter_id === c.id && u.location === 'text')
        .length,
    })),
  };
}

export function registerLayoutTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    'get_chapter_layout',
    {
      description:
        'Read layout revision and zero-based top-level block anchors with complete text. Use this before editing. Placements are shared by all editions.',
      inputSchema: { chapter_id: z.string().uuid() },
    },
    async ({ chapter_id }) => {
      try {
        const { chapter, version, revision } = await layoutState(ctx, chapter_id);
        return ok({
          chapter_id,
          revision,
          final_version_id: version.id,
          opening_illustration_id: chapter.opening_illustration_id,
          chapter_header: chapter.chapter_header,
          chapter_footer: chapter.chapter_footer,
          blocks: layoutBlocks(version.text),
        });
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'get_book_illustration_usage',
    {
      description:
        'Inventory opening, inline, full-page and framing illustrations across all chapters and preface. Reports missing assets, repeated IDs and per-chapter counts. Sharing an image between two editions is normal; this checks repetitions within the book.',
      inputSchema: { book_id: z.string().uuid() },
    },
    async ({ book_id }) => {
      try {
        return ok(await usageReport(ctx, book_id));
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'edit_chapter_layout',
    {
      description:
        'Safely change layout only, including published chapters. Anchors and removal indices refer to get_chapter_layout original blocks; prose bytes are preserved. Move an image by removing its block and inserting it at another anchor in one call. Produces a recoverable chapter version atomically. Requires migration V025. dry_run previews without writing.',
      inputSchema: {
        chapter_id: z.string().uuid(),
        expected_revision: z.string().length(64),
        opening_illustration_id: z.string().uuid().nullable().optional(),
        remove_blocks: z.array(z.number().int().min(0)).default([]),
        insert: z
          .array(
            z.object({
              before_block: z.number().int().min(0),
              kind: z.enum(['inline', 'full_page', 'page_break']),
              illustration_id: z.string().uuid().optional(),
            }),
          )
          .default([]),
        dry_run: z.boolean().default(false),
      },
    },
    async ({
      chapter_id,
      expected_revision,
      opening_illustration_id,
      remove_blocks,
      insert,
      dry_run,
    }) => {
      try {
        const { chapter, version, revision } = await layoutState(ctx, chapter_id);
        if (revision !== expected_revision)
          throw new Error('Layout changed; read get_chapter_layout again');
        const ids = [
          ...new Set([
            ...(opening_illustration_id ? [opening_illustration_id] : []),
            ...insert.flatMap((p) => (p.illustration_id ? [p.illustration_id] : [])),
          ]),
        ];
        const entities = new Map<string, string>();
        for (const id of ids) {
          const image = await owned(ctx, 'entity_illustrations', id);
          if (image.world_id !== chapter.world_id)
            throw new Error('Illustration belongs to another world');
          entities.set(id, image.entity_id);
        }
        const next = editLayout(
          version.text,
          remove_blocks,
          insert.map((p) => ({
            ...p,
            entity_id: p.illustration_id ? entities.get(p.illustration_id) : undefined,
          })),
        );
        const opening =
          opening_illustration_id === undefined
            ? chapter.opening_illustration_id
            : opening_illustration_id;
        if (dry_run || (next === version.text && opening === chapter.opening_illustration_id))
          return ok({
            dry_run,
            unchanged: next === version.text && opening === chapter.opening_illustration_id,
            revision,
            opening_illustration_id: opening,
            blocks: layoutBlocks(next),
          });
        const { data: ranks, error: rankError } = await ctx.supabase
          .from('chapter_versions')
          .select('rank')
          .eq('chapter_id', chapter_id)
          .eq('owner_id', ctx.ownerId)
          .order('rank', { ascending: false })
          .limit(1);
        if (rankError) throw new Error(rankError.message);
        const { data, error } = await ctx.supabase.rpc('mcp_edit_chapter_layout', {
          p_owner_id: ctx.ownerId,
          p_chapter_id: chapter_id,
          p_expected_updated_at: chapter.updated_at,
          p_expected_version_id: version.id,
          p_expected_text: version.text,
          p_text: next,
          p_opening_illustration_id: opening,
          p_rank: nextRankAfter(ranks ?? []),
        });
        if (error) throw new Error(`${error.message} (layout writes require migration V025)`);
        await ctx.logAction({
          worldId: chapter.world_id,
          actionKind: 'edit_chapter_layout',
          targetKind: 'chapter',
          targetId: chapter_id,
          payload: { previous_version_id: version.id, ...data },
        });
        return ok({ ...data, previous_version_id: version.id, shared_across_editions: true });
      } catch (e) {
        return fail(String(e));
      }
    },
  );
}
