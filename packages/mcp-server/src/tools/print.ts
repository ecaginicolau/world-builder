import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ServerContext } from '../context.js';
import { ok, fail } from '../response.js';
import { owned, bookData } from '../print/data.js';
import { validateEdition, type Edition } from '../print/editions.js';
import { illustrationUses, layoutBlocks } from '../print/layout.js';
import { preflightPdf } from '../print/preflight.js';
import { withPrintBrowser, artifactRoot } from '../print/runtime.js';
import { imageMime } from './illustrations.js';

export function registerPrintTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    'generate_print_pdf',
    {
      description:
        'Generate a chapter preview or complete book PDF using the same renderer as the app. Returns local PDF, manifest and preflight. Missing/undecodable images fail explicitly. purpose=final requires a print_profile and passes only if automated checks succeed. Use get_print_pdf_page to visually inspect pages. No-bleed paperback interiors only; chapter previews use local page numbers.',
      inputSchema: {
        edition_id: z.string().uuid(),
        chapter_id: z.string().uuid().optional(),
        purpose: z.enum(['preview', 'final']).default('preview'),
        print_profile: z
          .enum(['black_white', 'black_cream', 'standard_color', 'premium_color'])
          .optional(),
        expected_illustrations_per_chapter: z.number().int().min(0).max(20).optional(),
        allow_repeated_illustrations: z.boolean().default(false),
      },
    },
    async ({
      edition_id,
      chapter_id,
      purpose,
      print_profile,
      expected_illustrations_per_chapter,
      allow_repeated_illustrations,
    }) => {
      try {
        if (purpose === 'final' && (!print_profile || chapter_id))
          throw new Error('Final export requires a whole book and explicit print_profile');
        const row = await owned(ctx, 'book_editions', edition_id);
        const edition = { ...row, ...validateEdition(row) } as Edition;
        const { book, chapters, exportData } = await bookData(ctx, edition.book_id);
        if (edition.world_id !== book.world_id) throw new Error('Edition and book world mismatch');
        if (chapter_id) {
          const selected = chapters.find((c) => c.id === chapter_id);
          if (!selected) throw new Error('Chapter is not in the edition book');
          selected.chapter_number_override =
            exportData.parts.flatMap((p) => p.chapters).findIndex((c) => c.id === chapter_id) + 1;
          exportData.preface = selected.is_preface ? selected : null;
          exportData.parts = exportData.parts
            .map((p) => ({ ...p, chapters: p.chapters.filter((c) => c.id === chapter_id) }))
            .filter((p) => p.chapters.length);
          exportData.omitTitlePage = true;
        }
        const selected = [
          ...(exportData.preface ? [exportData.preface] : []),
          ...exportData.parts.flatMap((p) => p.chapters),
        ];
        if (!selected.length) throw new Error('Book has no chapters');
        for (const c of selected)
          if (!c.final_version_id || !c.text.trim())
            throw new Error(`Chapter ${c.id} has no final text`);
        const uses = selected.flatMap((c) => [
          ...(c.opening_illustration_id
            ? [{ illustration_id: c.opening_illustration_id, kind: 'opening', chapter_id: c.id }]
            : []),
          ...illustrationUses(c.text).map((u) => ({ ...u, chapter_id: c.id })),
        ]);
        const ids = edition.include_illustrations
          ? [...new Set(uses.map((u) => u.illustration_id))]
          : [];
        const images: {
          id: string;
          src: string;
          caption: string | null;
          alt: string;
          width: number | null;
          height: number | null;
          sha256: string;
        }[] = [];
        for (const id of ids) {
          const image = await owned(ctx, 'entity_illustrations', id);
          if (image.world_id !== book.world_id)
            throw new Error(`Image ${id} belongs to another world`);
          const { data, error } = await ctx.supabase.storage
            .from('illustrations')
            .download(image.storage_path);
          if (error || !data) throw new Error(`Image ${id} unavailable: ${error?.message}`);
          const bytes = Buffer.from(await data.arrayBuffer());
          const mime = imageMime(bytes);
          images.push({
            id,
            src: `data:${mime};base64,${bytes.toString('base64')}`,
            caption: image.caption,
            alt: image.alt_text ?? '',
            width: image.width,
            height: image.height,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
        }
        // Explicitly suppress opening plates as well as inline images for image-free editions.
        if (!edition.include_illustrations)
          for (const c of selected) c.opening_illustration_id = null;
        const result = await withPrintBrowser((page) =>
          page.evaluate(
            async (payload) => {
              const modulePath = '/src/features/chapters/mcpPrintBridge.ts';
              const bridge = await import(/* @vite-ignore */ modulePath);
              const dimensions = [];
              for (const img of payload.images)
                dimensions.push({ id: img.id, ...(await bridge.inspectImage(img.src)) });
              const pdf = await bridge.renderPrint(payload.book, payload.edition, payload.images);
              return {
                pdf: pdf as string,
                dimensions: dimensions as { id: string; width: number; height: number }[],
              };
            },
            { book: exportData, edition, images },
          ),
        );
        const bytes = Buffer.from(result.pdf, 'base64');
        const report = await preflightPdf(bytes, edition, print_profile, !!chapter_id);
        if (images.some((i) => i.caption) && edition.body_font_size_pt - 1.5 < 7)
          report.errors.push({
            code: 'caption_size',
            message: 'Illustration captions require body_font_size_pt >= 8.5 to stay at least 7 pt',
          });
        if (!edition.include_illustrations && expected_illustrations_per_chapter)
          report.errors.push({
            code: 'illustrations_disabled',
            message: 'This edition disables the requested illustrations',
          });
        const duplicateIds = ids.filter(
          (id) => uses.filter((u) => u.illustration_id === id).length > 1,
        );
        const hashes = new Map<string, string[]>();
        for (const img of images)
          hashes.set(img.sha256, [...(hashes.get(img.sha256) ?? []), img.id]);
        const duplicateBytes = [...hashes.values()].filter((group) => group.length > 1);
        if (!allow_repeated_illustrations && (duplicateIds.length || duplicateBytes.length))
          report.errors.push({
            code: 'repeated_illustrations',
            message: `Repeated image IDs: ${duplicateIds.join(', ')}; identical assets: ${JSON.stringify(duplicateBytes)}`,
          });
        for (const c of selected) {
          if (
            illustrationUses(c.text).length !==
            layoutBlocks(c.text).filter((b) => b.layout && b.illustration_id).length
          )
            report.errors.push({
              code: 'nested_images',
              message: `Chapter ${c.id} contains nested illustrations unsupported by the renderer; move them to top-level blocks`,
            });
          if (
            !c.is_preface &&
            expected_illustrations_per_chapter !== undefined &&
            uses.filter((u) => u.chapter_id === c.id).length !== expected_illustrations_per_chapter
          )
            report.errors.push({
              code: 'illustration_count',
              message: `Chapter ${c.id} does not have ${expected_illustrations_per_chapter} illustrations`,
            });
          if (
            illustrationUses(c.chapter_header ?? '').length ||
            illustrationUses(c.chapter_footer ?? '').length
          )
            report.errors.push({
              code: 'framing_images',
              message: `Chapter ${c.id}: the renderer does not support images in chapter header/footer`,
            });
        }
        const width = edition.trim_width_mm - edition.margin_inside_mm - edition.margin_outside_mm;
        const height = edition.trim_height_mm - edition.margin_top_mm - edition.margin_bottom_mm;
        const imageChecks = result.dimensions.map((img) => {
          const fullPage = uses.some((u) => u.illustration_id === img.id && u.kind !== 'inline');
          const maxH = fullPage ? height : width * 0.95;
          const printWidth = Math.min(width, (maxH * img.width) / img.height);
          const dpi = img.width / (printWidth / 25.4);
          if (dpi < 299.5)
            report.errors.push({
              code: 'image_dpi',
              message: `Image ${img.id}: ${Math.round(dpi)} DPI at rendered size; need at least 300`,
            });
          return { ...img, estimated_dpi: Math.round(dpi) };
        });
        if (purpose === 'final' && report.warnings.some((w) => w.code === 'trim_profile'))
          report.errors.push({
            code: 'unverified_trim',
            message: 'Final validation currently supports 5×8 and 6×9 only',
          });
        const exportId = randomUUID();
        const dir = path.join(artifactRoot, exportId);
        await mkdir(dir, { recursive: true });
        const pdfPath = path.join(dir, 'interior.pdf');
        await writeFile(pdfPath, bytes);
        const manifest = {
          export_id: exportId,
          owner_id: ctx.ownerId,
          book_id: edition.book_id,
          edition_id,
          chapter_id: chapter_id ?? null,
          purpose,
          status:
            purpose === 'final' && report.errors.length
              ? 'blocked'
              : purpose === 'final'
                ? 'validated'
                : 'preview',
          pdf_path: pdfPath,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          created_at: new Date().toISOString(),
          edition,
          sources: selected.map((c) => ({
            chapter_id: c.id,
            final_version_id: c.final_version_id,
            text_sha256: createHash('sha256').update(c.text).digest('hex'),
          })),
          images: images.map(({ src: _src, ...rest }) => rest),
          image_checks: imageChecks,
          preflight: report,
        };
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        await ctx.logAction({
          worldId: book.world_id,
          actionKind: 'generate_print_pdf',
          targetKind: 'book_edition',
          targetId: edition_id,
          payload: { export_id: exportId, purpose, status: manifest.status, chapter_id },
        });
        return {
          ...ok({ ...manifest, manifest_path: path.join(dir, 'manifest.json') }),
          ...(manifest.status === 'blocked' ? { isError: true } : {}),
        };
      } catch (e) {
        return fail(String(e));
      }
    },
  );
  server.registerTool(
    'get_print_pdf_page',
    {
      description:
        'Render one page of a previously generated PDF as a PNG and return its pixels plus extracted text. Use every page for final visual QA, especially illustrations, chapter starts and endings. Page numbers are 1-based.',
      inputSchema: {
        export_id: z.string().uuid(),
        page_number: z.number().int().min(1),
        scale: z.number().min(0.5).max(2).default(1.3),
      },
    },
    async ({ export_id, page_number, scale }) => {
      try {
        const dir = path.join(artifactRoot, export_id);
        const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
        if (manifest.owner_id !== ctx.ownerId) throw new Error('Export not owned');
        await owned(ctx, 'books', manifest.book_id);
        if (page_number > manifest.preflight.page_count)
          throw new Error('Page number exceeds page count');
        const bytes = await readFile(path.join(dir, 'interior.pdf'));
        if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
          throw new Error('PDF changed since export');
        const result = await withPrintBrowser((page) =>
          page.evaluate(
            async (p) => {
              const modulePath = '/src/features/chapters/mcpPrintBridge.ts';
              const bridge = await import(/* @vite-ignore */ modulePath);
              return bridge.renderPdfPage(p.base64, p.number, p.scale) as Promise<{
                png: string;
                text: string;
              }>;
            },
            { base64: bytes.toString('base64'), number: page_number, scale },
          ),
        );
        const pngPath = path.join(dir, `page-${page_number}.png`);
        await writeFile(pngPath, Buffer.from(result.png, 'base64'));
        return {
          content: [
            ...ok({ export_id, page_number, png_path: pngPath, text: result.text }).content,
            { type: 'image' as const, mimeType: 'image/png', data: result.png },
          ],
        };
      } catch (e) {
        return fail(String(e));
      }
    },
  );
}
