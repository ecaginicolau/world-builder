import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { editionSettings } from '../packages/mcp-server/src/print/editions';
import { writeFile } from 'node:fs/promises';
import { withPrintBrowser } from '../packages/mcp-server/src/print/runtime';

test.describe.configure({ mode: 'serial' });

test('recto pagination keeps opening plates opposite chapter titles and numbers physical pages', async () => {
  test.setTimeout(120_000);
  const result = await withPrintBrowser(page => page.evaluate(async defaults => {
    const bridgePath = '/src/features/chapters/mcpPrintBridge.ts';
    const bridge = await import(bridgePath);
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 900;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red'; ctx.fillRect(0, 0, 600, 900);
    const images = [{ id: 'plate', src: canvas.toDataURL(), width: 600, height: 900, caption: null, alt: null }];
    const chapters = [1, 2, 3].map(n => ({
      id: `c${n}`, title: `TEST${n}`, reading_rank: String(n),
      text: '<p>FIRST BODY</p><div data-page-break="true"></div><p>LAST BODY</p>',
      opening_illustration_id: n === 3 ? null : 'plate', chapter_header: null, chapter_footer: null,
    }));
    const book = { title: 'BOOK', parts: [{ id: 'p', title: '', rank: 'a', chapters }] };
    const edition = { ...defaults, id: 'e', book_id: 'b', world_id: 'w', owner_id: 'o', created_at: '', updated_at: '' };
    const outputs = [];
    for (const mode of ['recto', 'free', 'no-images', 'chapter']) {
      const pdf = await bridge.renderPrint(mode === 'chapter' ? { ...book, omitTitlePage: true, parts: [{ ...book.parts[0], chapters: [chapters[0]] }] } : book,
        { ...edition, chapter_starts_on_recto: mode !== 'free', include_illustrations: mode !== 'no-images' }, images);
      const first = await bridge.renderPdfPage(pdf, 1, .2);
      const texts = [first.text];
      for (let i = 2; i <= first.page_count; i++) texts.push((await bridge.renderPdfPage(pdf, i, .2)).text);
      outputs.push({ mode, texts });
    }
    return outputs;
  }, editionSettings.parse({ footer_page_numbers: true, footer_show_on_chapter_first_page: true })));
  for (const { mode, texts } of result) {
    const starts = texts.flatMap((text, i) => /Chapitre\s+\d+/.test(text) ? [i + 1] : []);
    if (mode === 'free') { expect(starts).toEqual([3, 6, 8]); continue; }
    expect(starts).toEqual(mode === 'recto' ? [3, 7, 9] : mode === 'no-images' ? [3, 5, 7] : [3]);
    expect(starts.every(n => n % 2 === 1)).toBe(true);
    for (const n of starts) expect(texts[n - 1]).toMatch(new RegExp(`\\b${n}\\s*$`));
    if (mode === 'recto' || mode === 'chapter') {
      for (const n of starts.slice(0, 2)) expect(texts[n - 2].trim()).toBe(String(n - 1));
      expect(texts.some(t => !t.trim())).toBe(true);
    }
    if (mode === 'no-images') expect(texts.join(' ')).not.toContain('PLATE');
  }
});

test('shared PDF engine produces color and monochrome interiors and page previews', async ({browserName}, testInfo) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(120_000);
  const defaults = editionSettings.parse({ chapter_starts_on_recto: false });
  const result = await withPrintBrowser(async (page) => {
    expect((await fetch(new URL('/src/features/chapters/mcpPrintBridge.ts', page.url()))).status).toBe(403);
    expect(await page.evaluate(async () => (await fetch('/.mcp.json')).status)).toBe(403);
    return page.evaluate(async (defaults) => {
      const modulePath = '/src/features/chapters/mcpPrintBridge.ts';
      const bridge = await import(modulePath);
      const canvas = document.createElement('canvas');
      canvas.width = 1500;
      canvas.height = 2100;
      const context = canvas.getContext('2d')!;
      const gradient = context.createRadialGradient(750, 1050, 100, 750, 1050, 750);
      gradient.addColorStop(0, '#c23b16');
      gradient.addColorStop(1, 'rgba(194,59,22,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1500, 2100);
      const images = [
        {
          id: 'image',
          src: canvas.toDataURL(),
          width: 1500,
          height: 2100,
          caption: null,
          alt: 'A red light fading into white',
        },
      ];
      const book = {
        title: 'Essai — Le livre',
        parts: [
          {
            id: 'part',
            title: 'Partie',
            rank: 'a',
            chapters: [
              {
                id: 'chapter',
                title: 'Les lumières',
                reading_rank: 'a',
                text: '<p>Élise regarde les lumières. Une phrase française avec des accents.</p><div data-page-break="true" data-illustration-id="image"></div><p>La fin du chapitre.</p>',
                opening_illustration_id: 'image',
                chapter_header: null,
                chapter_footer: null,
              },
            ],
          },
        ],
      };
      const outputs = [];
      for (const grayscale of [false, true]) {
        const edition = {
          ...defaults,
          id: 'e',
          book_id: 'b',
          world_id: 'w',
          owner_id: 'o',
          created_at: '',
          updated_at: '',
          image_grayscale: grayscale,
          trim_width_mm: grayscale ? 127 : 152.4,
          trim_height_mm: grayscale ? 203.2 : 228.6,
        };
        const pdf = await bridge.renderPrint(book, edition, images);
        const preview = await bridge.renderPdfPage(pdf, 2, 1);
        const img = new Image();
        img.src = 'data:image/png;base64,' + preview.png;
        await img.decode();
        const out = document.createElement('canvas');
        out.width = img.width;
        out.height = img.height;
        const ctx = out.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const pixel = [
          ...ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data,
        ];
        outputs.push({ pdf, png: preview.png, pixel, grayscale });
      }
      const chapterPdf = await bridge.renderPrint(
        { ...book, omitTitlePage: true },
        {
          ...defaults,
          id: 'e',
          book_id: 'b',
          world_id: 'w',
          owner_id: 'o',
          created_at: '',
          updated_at: '',
        },
        images,
      );
      const textOnlyPdf = await bridge.renderPrint(
        book,
        {
          ...defaults,
          id: 'e',
          book_id: 'b',
          world_id: 'w',
          owner_id: 'o',
          created_at: '',
          updated_at: '',
          include_illustrations: false,
        },
        [],
      );
      const textOnlyPage = await bridge.renderPdfPage(textOnlyPdf, 2, 1);
      return { outputs, chapterPdf, textOnlyPdf, textOnlyText: textOnlyPage.text };
    }, defaults);
  });
  for (const output of result.outputs) {
    const bytes = Buffer.from(output.pdf, 'base64');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(5);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(output.grayscale ? 360 : 432, 1);
    if (output.grayscale)
      expect(
        Math.max(...output.pixel.slice(0, 3)) - Math.min(...output.pixel.slice(0, 3)),
      ).toBeLessThan(2);
    else expect(output.pixel[0] - output.pixel[1]).toBeGreaterThan(50);
    await writeFile(testInfo.outputPath(output.grayscale ? 'mono.pdf' : 'color.pdf'), bytes);
    await writeFile(
      testInfo.outputPath(output.grayscale ? 'mono.png' : 'color.png'),
      Buffer.from(output.png, 'base64'),
    );
  }
  expect((await PDFDocument.load(Buffer.from(result.chapterPdf, 'base64'))).getPageCount()).toBe(4);
  expect((await PDFDocument.load(Buffer.from(result.textOnlyPdf, 'base64'))).getPageCount()).toBe(
    3,
  );
  expect(result.textOnlyText).toContain('Élise');
  expect(result.textOnlyText).not.toContain('illustration unavailable');
});
