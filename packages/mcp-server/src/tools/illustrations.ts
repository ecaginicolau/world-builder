import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ServerContext } from '../context.js';
import { ok, fail } from '../response.js';
import { owned } from '../print/data.js';
import { inspectImage, artifactRoot } from '../print/runtime.js';

const bucket = 'illustrations';
export function imageMime(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  throw new Error('Only decodable PNG, JPEG and WebP images are supported');
}
function url(ctx: ServerContext, row: { storage_path: string; updated_at: string }) {
  return (
    ctx.supabase.storage.from(bucket).getPublicUrl(row.storage_path).data.publicUrl +
    `?v=${encodeURIComponent(row.updated_at)}`
  );
}
export function registerIllustrationTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    'list_illustrations',
    {
      description:
        'List reference images for an entity or world, with URLs, dimensions and captions. Returns a bounded page; continue with next_offset until null.',
      inputSchema: {
        world_id: z.string().uuid(),
        entity_id: z.string().uuid().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      },
    },
    async ({ world_id, entity_id, offset, limit }) => {
      try {
        await owned(ctx, 'worlds', world_id);
        if (entity_id) {
          const e = await owned(ctx, 'entities', entity_id);
          if (e.world_id !== world_id) throw new Error('Entity belongs to another world');
        }
        let q = ctx.supabase
          .from('entity_illustrations')
          .select('*')
          .eq('world_id', world_id)
          .eq('owner_id', ctx.ownerId);
        if (entity_id) q = q.eq('entity_id', entity_id);
        const { data, error } = await q
          .order('display_order')
          .order('id')
          .range(offset, offset + limit);
        if (error) throw new Error(error.message);
        return ok({
          items: (data ?? []).slice(0, limit).map((row) => ({ ...row, url: url(ctx, row) })),
          next_offset: (data?.length ?? 0) > limit ? offset + limit : null,
        });
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'get_illustration',
    {
      description:
        'Get metadata and optionally image pixels for visual reference. download=true saves an image locally for image generation reference inputs; returns a SHA-256 digest for duplicate checking.',
      inputSchema: {
        illustration_id: z.string().uuid(),
        include_image: z.boolean().default(false),
        download: z.boolean().default(false),
      },
    },
    async ({ illustration_id, include_image, download }) => {
      try {
        const row = await owned(ctx, 'entity_illustrations', illustration_id);
        if (!include_image && !download) return ok({ ...row, url: url(ctx, row) });
        const { data, error } = await ctx.supabase.storage.from(bucket).download(row.storage_path);
        if (error || !data) throw new Error(error?.message ?? 'Image unavailable');
        const bytes = Buffer.from(await data.arrayBuffer());
        const mime = imageMime(bytes);
        let local_path: string | undefined;
        if (download) {
          await mkdir(path.join(artifactRoot, 'references'), { recursive: true });
          local_path = path.join(
            artifactRoot,
            'references',
            `${row.id}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`,
          );
          await writeFile(local_path, bytes);
        }
        const result = ok({
          ...row,
          url: url(ctx, row),
          local_path,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        return {
          ...result,
          content: [
            ...result.content,
            ...(include_image
              ? [{ type: 'image' as const, mimeType: mime, data: bytes.toString('base64') }]
              : []),
          ],
        };
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'upload_illustration',
    {
      description:
        'Upload a local PNG/JPEG/WebP (max 10 MiB) onto an owned entity. image_id is a caller-generated UUID for idempotent retries. Never replaces an existing image. Returns actual decoded dimensions. Generate images with the agent image tool, then upload here.',
      inputSchema: {
        entity_id: z.string().uuid(),
        image_id: z.string().uuid(),
        file_path: z.string().min(1),
        caption: z.string().nullable().optional(),
        alt_text: z.string().nullable().optional(),
      },
    },
    async ({ entity_id, image_id, file_path, caption, alt_text }) => {
      try {
        const entity = await owned(ctx, 'entities', entity_id);
        if (!path.isAbsolute(file_path))
          throw new Error('file_path must be absolute on the MCP server host');
        const info = await stat(file_path);
        if (!info.isFile() || info.size > 10 * 1024 * 1024)
          throw new Error('Image must be a file of at most 10 MiB');
        const bytes = await readFile(file_path);
        const mime = imageMime(bytes);
        const hash = createHash('sha256').update(bytes).digest('hex');
        const { data: existing, error: readError } = await ctx.supabase
          .from('entity_illustrations')
          .select('*')
          .eq('id', image_id)
          .eq('owner_id', ctx.ownerId)
          .maybeSingle();
        if (readError) throw new Error(readError.message);
        if (existing) {
          if (existing.entity_id !== entity_id)
            throw new Error('image_id already belongs to a different entity');
          const old = await ctx.supabase.storage.from(bucket).download(existing.storage_path);
          if (old.error || !old.data) throw new Error('Existing upload cannot be verified');
          if (
            createHash('sha256')
              .update(Buffer.from(await old.data.arrayBuffer()))
              .digest('hex') !== hash
          )
            throw new Error('image_id already has different bytes; use a new UUID');
          return ok({ ...existing, url: url(ctx, existing), sha256: hash, reused: true });
        }
        const dimensions = await inspectImage(`data:${mime};base64,${bytes.toString('base64')}`);
        const storage_path = `${entity.world_id}/${entity_id}/${image_id}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`;
        const upload = await ctx.supabase.storage
          .from(bucket)
          .upload(storage_path, bytes, {
            contentType: mime,
            upsert: false,
            cacheControl: '31536000',
          });
        if (upload.error) {
          // Recover a retry after the upload succeeded but metadata insertion did not.
          const old = await ctx.supabase.storage.from(bucket).download(storage_path);
          if (
            old.error ||
            !old.data ||
            createHash('sha256')
              .update(Buffer.from(await old.data.arrayBuffer()))
              .digest('hex') !== hash
          )
            throw new Error(upload.error.message);
        }
        const { data, error } = await ctx.supabase
          .from('entity_illustrations')
          .insert({
            id: image_id,
            entity_id,
            world_id: entity.world_id,
            owner_id: ctx.ownerId,
            storage_path,
            mime_type: mime,
            byte_size: bytes.length,
            ...dimensions,
            caption: caption ?? null,
            alt_text: alt_text ?? null,
            display_order: 0,
          })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        await ctx.logAction({
          worldId: entity.world_id,
          actionKind: 'upload_illustration',
          targetKind: 'illustration',
          targetId: image_id,
          payload: { entity_id, sha256: hash },
        });
        return ok({ ...data, url: url(ctx, data), sha256: hash });
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'update_illustration',
    {
      description:
        'Edit caption, alt text or display order without replacing image bytes or breaking chapter references.',
      inputSchema: {
        illustration_id: z.string().uuid(),
        expected_updated_at: z.string(),
        caption: z.string().nullable().optional(),
        alt_text: z.string().nullable().optional(),
        display_order: z.number().int().min(0).optional(),
      },
    },
    async ({ illustration_id, expected_updated_at, ...patch }) => {
      try {
        const row = await owned(ctx, 'entity_illustrations', illustration_id);
        const fields = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
        if (!Object.keys(fields).length) throw new Error('No fields provided');
        const { data, error } = await ctx.supabase
          .from('entity_illustrations')
          .update(fields)
          .eq('id', illustration_id)
          .eq('owner_id', ctx.ownerId)
          .eq('updated_at', expected_updated_at)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Illustration changed; read again');
        await ctx.logAction({
          worldId: row.world_id,
          actionKind: 'update_illustration',
          targetKind: 'illustration',
          targetId: illustration_id,
          payload: fields,
        });
        return ok(data);
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'replace_illustration_asset',
    {
      description:
        'Replace image bytes while keeping its illustration ID and all placements. This affects every use in every edition. Uploads to a new immutable path, checks expected_updated_at, and retains the previous object for recovery. Use a stable new asset_key UUID for retries.',
      inputSchema: {
        illustration_id: z.string().uuid(),
        expected_updated_at: z.string(),
        asset_key: z.string().uuid(),
        file_path: z.string().min(1),
      },
    },
    async ({ illustration_id, expected_updated_at, asset_key, file_path }) => {
      try {
        const row = await owned(ctx, 'entity_illustrations', illustration_id);
        if (!path.isAbsolute(file_path))
          throw new Error('file_path must be absolute on the MCP server host');
        const info = await stat(file_path);
        if (!info.isFile() || info.size > 10 * 1024 * 1024)
          throw new Error('Image must be a file of at most 10 MiB');
        const bytes = await readFile(file_path);
        const mime = imageMime(bytes);
        const hash = createHash('sha256').update(bytes).digest('hex');
        const storage_path = `${row.world_id}/${row.entity_id}/${illustration_id}-${asset_key}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`;
        if (row.storage_path !== storage_path && row.updated_at !== expected_updated_at)
          throw new Error('Illustration changed; read again');
        const dimensions = await inspectImage(`data:${mime};base64,${bytes.toString('base64')}`);
        const upload = await ctx.supabase.storage
          .from(bucket)
          .upload(storage_path, bytes, {
            contentType: mime,
            upsert: false,
            cacheControl: '31536000',
          });
        if (upload.error) {
          const old = await ctx.supabase.storage.from(bucket).download(storage_path);
          if (
            old.error ||
            !old.data ||
            createHash('sha256')
              .update(Buffer.from(await old.data.arrayBuffer()))
              .digest('hex') !== hash
          )
            throw new Error('Asset key collision or upload failure');
        }
        if (row.storage_path === storage_path)
          return ok({ ...row, url: url(ctx, row), sha256: hash, reused: true });
        const { data, error } = await ctx.supabase
          .from('entity_illustrations')
          .update({ storage_path, mime_type: mime, byte_size: bytes.length, ...dimensions })
          .eq('id', illustration_id)
          .eq('owner_id', ctx.ownerId)
          .eq('updated_at', expected_updated_at)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error('Illustration changed; previous asset preserved');
        await ctx.logAction({
          worldId: row.world_id,
          actionKind: 'replace_illustration_asset',
          targetKind: 'illustration',
          targetId: illustration_id,
          payload: { previous_storage_path: row.storage_path, storage_path, sha256: hash },
        });
        return ok({
          ...data,
          url: url(ctx, data),
          sha256: hash,
          previous_storage_path: row.storage_path,
        });
      } catch (e) {
        return fail(String(e));
      }
    },
  );
}
