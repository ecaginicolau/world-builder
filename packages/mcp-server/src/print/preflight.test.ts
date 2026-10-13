import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { preflightPdf } from './preflight.js';
import { editionSettings, type Edition } from './editions.js';

const edition = {
  ...editionSettings.parse({}),
  id: 'e',
  book_id: 'b',
  world_id: 'w',
  owner_id: 'o',
  updated_at: '',
} as Edition;
describe('PDF preflight', () => {
  it('checks actual page geometry and embedded fonts, not just edition declarations', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText('Test', { font });
    const report = await preflightPdf(await doc.save(), edition, 'premium_color');
    expect(report.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(['page_size', 'unembedded_fonts', 'page_count']),
    );
  });
  it('allows short chapter previews but reports their pagination limitation', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([432, 648]);
    const report = await preflightPdf(await doc.save(), edition, undefined, true);
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((e) => e.code)).toContain('chapter_pagination');
  });
  it('distinguishes standard color minimum page count from premium color', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 24; i++) doc.addPage([432, 648]);
    const bytes = await doc.save();
    expect(
      (await preflightPdf(bytes, edition, 'standard_color')).errors.map((e) => e.code),
    ).toContain('page_count');
    expect((await preflightPdf(bytes, edition, 'premium_color')).errors).toEqual([]);
  });
});
