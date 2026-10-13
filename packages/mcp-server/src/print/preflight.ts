import { PDFDocument, PDFDict, PDFName, PDFArray } from 'pdf-lib';
import type { Edition } from './editions.js';

export type PrintProfile = 'black_white' | 'black_cream' | 'standard_color' | 'premium_color';
export interface PrintIssue {
  code: string;
  message: string;
}
export async function preflightPdf(
  bytes: Uint8Array,
  edition: Edition,
  profile?: PrintProfile,
  chapterPreview = false,
) {
  const doc = await PDFDocument.load(bytes);
  const errors: PrintIssue[] = [];
  const warnings: PrintIssue[] = [];
  const count = doc.getPageCount();
  const roundedCount = count + (count % 2);
  const error = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const expected = [(edition.trim_width_mm * 72) / 25.4, (edition.trim_height_mm * 72) / 25.4];
  doc.getPages().forEach((page, i) => {
    const s = page.getSize();
    if (Math.abs(s.width - expected[0]) > 0.1 || Math.abs(s.height - expected[1]) > 0.1)
      error('page_size', `Page ${i + 1} has an unexpected trim size`);
  });
  const minimumInside =
    roundedCount <= 150
      ? 9.6
      : roundedCount <= 300
        ? 12.7
        : roundedCount <= 500
          ? 15.9
          : roundedCount <= 700
            ? 19.1
            : 22.3;
  if (edition.margin_inside_mm < minimumInside)
    error('gutter', `Inside margin must be at least ${minimumInside} mm for ${roundedCount} pages`);
  if (
    [edition.margin_outside_mm, edition.margin_top_mm, edition.margin_bottom_mm].some(
      (m) => m < 6.4,
    )
  )
    error('margins', 'No-bleed outside, top and bottom margins must be at least 6.4 mm');
  if (bytes.length > 650_000_000) error('file_size', 'PDF exceeds 650 MB');
  for (const [key, value] of Object.entries(edition))
    if (key.endsWith('_size_pt') && typeof value === 'number' && value < 7)
      error('font_size', `${key} is below 7 pt`);
  if (edition.body_font_size_pt - 1.5 < 7 && edition.include_illustrations)
    warn('caption_size', 'Inline captions may be smaller than 7 pt; use body size >= 8.5 pt');
  const unembedded = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of('Type'))?.toString() !== '/Font')
      continue;
    if (object.get(PDFName.of('Subtype'))?.toString() === '/Type0') continue;
    const descriptor = object.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
    if (
      !descriptor ||
      !['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)))
    )
      unembedded.add(object.get(PDFName.of('BaseFont'))?.toString() ?? 'unknown');
  }
  if (unembedded.size)
    error('unembedded_fonts', `Fonts not embedded: ${[...unembedded].join(', ')}`);
  if (
    doc
      .getPages()
      .some((p) => (p.node.lookupMaybe(PDFName.of('Annots'), PDFArray)?.size() ?? 0) > 0)
  )
    error('annotations', 'PDF contains annotations');
  if (chapterPreview)
    warn(
      'chapter_pagination',
      'Chapter preview starts at page 1; final book parity, numbering and gutter depend on the complete book',
    );
  else {
    if (!profile)
      warn('print_profile', 'Choose ink/paper profile to validate the final page-count limits');
    const supported =
      (Math.abs(edition.trim_width_mm - 127) < 0.1 &&
        Math.abs(edition.trim_height_mm - 203.2) < 0.1) ||
      (Math.abs(edition.trim_width_mm - 152.4) < 0.1 &&
        Math.abs(edition.trim_height_mm - 228.6) < 0.1);
    if (!supported)
      warn(
        'trim_profile',
        'Automated page-count limits cover 5×8 and 6×9 only; verify this trim in KDP',
      );
    if (profile && supported) {
      const min = profile === 'standard_color' ? 72 : 24;
      const max = profile === 'standard_color' ? 600 : profile === 'black_cream' ? 776 : 828;
      if (roundedCount < min || roundedCount > max)
        error('page_count', `${profile} requires ${min}–${max} pages; got ${roundedCount}`);
    }
  }
  if (profile?.startsWith('black') && edition.include_illustrations && !edition.image_grayscale)
    error('color_mode', 'Black-ink edition must enable image_grayscale');
  return {
    page_count: count,
    trim_mm: [edition.trim_width_mm, edition.trim_height_mm],
    errors,
    warnings,
    rules_source: 'https://kdp.amazon.com/en_US/help/topic/G201857950',
    rules_checked_on: '2026-10-12',
    scope:
      'Paperback interior, no bleed. Automated checks do not replace visual review or KDP Print Previewer.',
  };
}
