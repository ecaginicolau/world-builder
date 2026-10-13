import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from '../context.js';
import { ok, fail } from '../response.js';
import { owned, allRows } from '../print/data.js';
import { editionPatch, editionSettings, validateEdition } from '../print/editions.js';

export function registerEditionTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    'list_book_editions',
    {
      description:
        'Read every print edition of an owned book, including trim, typography and image filters.',
      inputSchema: { book_id: z.string().uuid() },
    },
    async ({ book_id }) => {
      try {
        await owned(ctx, 'books', book_id);
        return ok(
          await allRows((a, b) =>
            ctx.supabase
              .from('book_editions')
              .select('*')
              .eq('book_id', book_id)
              .eq('owner_id', ctx.ownerId)
              .order('created_at')
              .order('id')
              .range(a, b),
          ),
        );
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'get_book_edition',
    { description: 'Read one print edition.', inputSchema: { edition_id: z.string().uuid() } },
    async ({ edition_id }) => {
      try {
        return ok(await owned(ctx, 'book_editions', edition_id));
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'create_book_edition',
    {
      description:
        'Create an edition, optionally copying settings from another owned edition (including across books). settings overrides copied values. New defaults: 6×9 color. For 5×8 monochrome set trim_width_mm=127, trim_height_mm=203.2, image_grayscale=true. Placements remain shared across editions.',
      inputSchema: {
        book_id: z.string().uuid(),
        copy_from_edition_id: z.string().uuid().optional(),
        settings: editionPatch,
      },
    },
    async ({ book_id, copy_from_edition_id, settings }) => {
      try {
        const book = await owned(ctx, 'books', book_id);
        const base = copy_from_edition_id
          ? editionSettings.parse(await owned(ctx, 'book_editions', copy_from_edition_id))
          : {};
        const draft = validateEdition({ ...base, ...settings });
        const { data, error } = await ctx.supabase
          .from('book_editions')
          .insert({ ...draft, book_id, world_id: book.world_id, owner_id: ctx.ownerId })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        await ctx.logAction({
          worldId: book.world_id,
          actionKind: 'create_book_edition',
          targetKind: 'book_edition',
          targetId: data.id,
          payload: { copy_from_edition_id, settings: draft },
        });
        return ok(data);
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'update_book_edition',
    {
      description:
        'Patch only specified edition settings. Use updated_at from get/list to reject stale writes.',
      inputSchema: {
        edition_id: z.string().uuid(),
        expected_updated_at: z.string(),
        settings: editionPatch,
      },
    },
    async ({ edition_id, expected_updated_at, settings }) => {
      try {
        const existing = await owned(ctx, 'book_editions', edition_id);
        validateEdition({ ...existing, ...settings });
        if (!Object.keys(settings).length) throw new Error('No settings provided');
        const { data, error } = await ctx.supabase
          .from('book_editions')
          .update(settings)
          .eq('id', edition_id)
          .eq('owner_id', ctx.ownerId)
          .eq('updated_at', expected_updated_at)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Edition changed; read again before retrying');
        await ctx.logAction({
          worldId: data.world_id,
          actionKind: 'update_book_edition',
          targetKind: 'book_edition',
          targetId: edition_id,
          payload: { settings },
        });
        return ok(data);
      } catch (e) {
        return fail(String(e));
      }
    },
  );
}
