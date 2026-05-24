import { Document, Image, Page, Text, View, pdf } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { PDFDocument } from 'pdf-lib';
import { parseHtmlToBlocks } from '@/lib/htmlToPdfContent';
import type { IllustrationResolution, PdfBlock, TextRun } from '@/lib/htmlToPdfContent';
import { extractIllustrationIds } from '@/lib/illustrationHydration';
import { publicUrlFor } from '@/lib/queries/illustrations';
import { supabase } from '@/lib/supabase';
import { ensureFontsRegistered, resolveFontStyle } from '@/lib/pdfFonts';
import type { Align, BookEdition, FooterPosition, HeaderMode } from './types';

// ── Units ─────────────────────────────────────────────────────────────────
// 1 mm = 2.83465 pt (PDF point = 1/72")
const mm = (v: number) => v * 2.83465;

export interface ChapterExportData {
  id: string;
  title: string | null;
  reading_rank: string;
  text: string;
  chapter_header: string | null;
  chapter_footer: string | null;
  /** Frontispiece — optional full-page illustration rendered as a dedicated
   * plate page IMMEDIATELY before the chapter's content. Conventionally lands
   * on the verso of the chapter-opening spread, but parity is not enforced. */
  opening_illustration_id?: string | null;
  /** Override for the displayed chapter number ("Chapitre N — title"). When
   * unset, the renderer falls back to the chapter's index inside its part
   * (1, 2, 3…). Used by single-chapter previews where the chapter is shown
   * outside its part context but should keep its real book-wide number. */
  chapter_number_override?: number | null;
}

export interface PartExportData {
  id: string;
  title: string | null;
  rank: string;
  chapters: ChapterExportData[];
}

export interface PrefaceExportData {
  id: string;
  title: string | null;
  text: string;
  chapter_header: string | null;
  chapter_footer: string | null;
}

export interface BookExportData {
  title: string;
  /** Optional series name rendered as a small line above the book title on
   * the cover page (no effect when `omitTitlePage` is true). */
  series_title?: string | null;
  description?: string | null;
  /** Optional preface — rendered first, no chapter number, fallback title "Preface". */
  preface?: PrefaceExportData | null;
  parts: PartExportData[];
  /** When true, skip the dedicated book-title page (the cover-like first
   * page with just title + description). Used by chapter-scoped previews
   * where the book title is irrelevant — the user is iterating on a single
   * chapter, not previewing the cover. */
  omitTitlePage?: boolean;
}

/**
 * V1 layout limitations to flag if pilot reveals issues:
 *
 *   1. Mirror margins: @react-pdf cannot vary Page padding by parity. We render
 *      with a symmetric L/R padding equal to (inside+outside)/2 — body width is
 *      identical to the asymmetric target, so line/page breaks are correct —
 *      then post-process the PDF with pdf-lib to shift each page horizontally
 *      by ±(inside-outside)/2 based on parity. See `applyMirrorMarginShift`.
 *
 *   2. `chapter_starts_on_recto` is NOT enforced — there is no way to
 *      conditionally insert a blank page from the React tree (parity is only
 *      known at layout time, after the tree is committed). Users wanting strict
 *      recto starts can use the manual page-break block.
 *
 *   3. Hyphenation is disabled (no FR dictionary). Justified text may show
 *      visible "rivers" on short body widths.
 *
 *   4. Drop caps are simulated with an inline larger-glyph span on the first
 *      paragraph of each chapter (not a true 2-line drop cap).
 */

// ── Block segmentation ────────────────────────────────────────────────────
// A page-break block starts a new visual segment. Two flavors:
//   - { kind: 'content' } — the running chapter Page with title/header/footer
//   - { kind: 'illustration_page' } — a dedicated full-page image, no header,
//     no footer, no chapter title; rendered between content segments when a
//     page-break carries an illustrationId.
type ChapterSegment =
  | { kind: 'content'; blocks: PdfBlock[] }
  | { kind: 'illustration_page'; illustrationId: string };

function segmentBlocks(blocks: PdfBlock[]): ChapterSegment[] {
  const segments: ChapterSegment[] = [{ kind: 'content', blocks: [] }];
  for (const b of blocks) {
    if (b.kind === 'page_break') {
      if (b.illustrationId) {
        segments.push({ kind: 'illustration_page', illustrationId: b.illustrationId });
      }
      segments.push({ kind: 'content', blocks: [] });
    } else {
      const last = segments[segments.length - 1];
      if (last.kind === 'content') last.blocks.push(b);
    }
  }
  return segments;
}

// ── Inline runs ───────────────────────────────────────────────────────────
function renderRuns(
  runs: TextRun[],
  baseFamily: string,
  italicByDefault = false,
  boldByDefault = false,
) {
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic && !italicByDefault && !boldByDefault) {
    return runs[0].text;
  }
  return runs.map((r, i) => {
    const bold = !!r.bold || boldByDefault;
    const italic = !!r.italic || italicByDefault;
    const style = resolveFontStyle(baseFamily, bold, italic);
    return (
      <Text key={i} style={style}>
        {r.text}
      </Text>
    );
  });
}

// ── Block renderer ────────────────────────────────────────────────────────
interface RenderCtx {
  edition: BookEdition;
  innerWidthPt: number;
  /** True for the first paragraph of the chapter — used for drop cap. */
  firstParagraphSeen: { value: boolean };
}

function renderBlock(block: PdfBlock, key: number | string, ctx: RenderCtx) {
  const { edition } = ctx;
  switch (block.kind) {
    case 'paragraph': {
      const isFirst = !ctx.firstParagraphSeen.value;
      ctx.firstParagraphSeen.value = true;
      const baseStyle: Style = {
        marginBottom: 4,
        textAlign: edition.body_justify ? 'justify' : 'left',
        textIndent: isFirst ? 0 : mm(edition.paragraph_indent_mm),
        ...resolveFontStyle(edition.body_font, false, false),
        fontSize: edition.body_font_size_pt,
        lineHeight: edition.body_line_height,
      };
      // Drop cap: render first character at ~3× size, rest of first paragraph
      // inline. Not a true 2-line drop cap but a visible flourish.
      if (isFirst && edition.drop_cap && block.runs.length > 0) {
        const first = block.runs[0];
        const head = first.text.slice(0, 1);
        const tail = first.text.slice(1);
        const restRuns: TextRun[] = [
          { ...first, text: tail },
          ...block.runs.slice(1),
        ];
        return (
          <Text key={key} style={baseStyle}>
            <Text
              style={{
                ...resolveFontStyle(edition.chapter_title_font, true, false),
                fontSize: edition.body_font_size_pt * 2.6,
                lineHeight: 1,
              }}
            >
              {head}
            </Text>
            {renderRuns(restRuns, edition.body_font)}
          </Text>
        );
      }
      return (
        <Text key={key} style={baseStyle}>
          {renderRuns(block.runs, edition.body_font)}
        </Text>
      );
    }
    case 'heading': {
      return (
        <Text
          key={key}
          style={{
            marginTop: block.level <= 2 ? 10 : 8,
            marginBottom: 4,
            ...resolveFontStyle(edition.chapter_title_font, true, block.level >= 3),
            fontSize: block.level <= 2
              ? edition.body_font_size_pt + 2
              : edition.body_font_size_pt + 1,
          }}
        >
          {renderRuns(block.runs, edition.chapter_title_font, false, true)}
        </Text>
      );
    }
    case 'scene_break':
      return (
        <Text
          key={key}
          style={{
            textAlign: 'center',
            marginTop: 10,
            marginBottom: 10,
            color: '#666',
            ...resolveFontStyle(edition.body_font, false, false),
            fontSize: edition.body_font_size_pt,
          }}
        >
          * * *
        </Text>
      );
    case 'page_break':
      return null; // handled via segmentation
    case 'blockquote':
      return (
        <Text
          key={key}
          style={{
            marginLeft: 14,
            marginRight: 14,
            marginBottom: 5,
            textAlign: edition.body_justify ? 'justify' : 'left',
            ...resolveFontStyle(edition.body_font, false, true),
            fontSize: edition.body_font_size_pt - 0.5,
            color: '#333',
          }}
        >
          {renderRuns(block.runs, edition.body_font, true)}
        </Text>
      );
    case 'list_item':
      return (
        <Text
          key={key}
          style={{
            marginBottom: 3,
            ...resolveFontStyle(edition.body_font, false, false),
            fontSize: edition.body_font_size_pt,
          }}
        >
          {block.ordered ? `${block.index}. ` : '• '}
          {renderRuns(block.runs, edition.body_font)}
        </Text>
      );
    case 'illustration': {
      if (!edition.include_illustrations) return null;
      if (!block.src) {
        return (
          <Text
            key={key}
            style={{
              marginTop: 8,
              marginBottom: 8,
              textAlign: 'center',
              ...resolveFontStyle(edition.body_font, false, true),
              fontSize: edition.body_font_size_pt - 1.5,
              color: '#999',
            }}
          >
            [illustration unavailable]
          </Text>
        );
      }
      const dims = fitImage(block.width, block.height, ctx.innerWidthPt);
      return (
        <View
          key={key}
          style={{ marginTop: 8, marginBottom: 10, alignItems: 'center' }}
          wrap={false}
        >
          <Image src={block.src} style={{ objectFit: 'contain', ...dims }} />
          {block.caption ? (
            <Text
              style={{
                marginTop: 3,
                textAlign: 'center',
                ...resolveFontStyle(edition.body_font, false, true),
                fontSize: edition.body_font_size_pt - 1.5,
                color: '#555',
              }}
            >
              {block.caption}
            </Text>
          ) : null}
        </View>
      );
    }
  }
}

function fitImage(
  width: number | null,
  height: number | null,
  maxWidth: number,
  maxHeight?: number,
) {
  const cap = maxHeight ?? maxWidth * 0.95;
  if (!width || !height) return { width: maxWidth, height: cap };
  const ratio = width / height;
  let w = maxWidth;
  let h = w / ratio;
  if (h > cap) {
    h = cap;
    w = h * ratio;
  }
  return { width: w, height: h };
}

// ── Chapter framing (chapter_header / chapter_footer Tiptap HTML) ────────
function renderFraming(
  html: string,
  illustrations: Map<string, IllustrationResolution>,
  align: Align,
  italic: boolean,
  font: string,
  size: number,
  marginTop: number,
  marginBottom: number,
  keyPrefix: string,
) {
  const blocks = parseHtmlToBlocks(html, illustrations);
  if (blocks.length === 0) return null;
  return (
    <View style={{ marginTop, marginBottom }}>
      {blocks.map((b, i) => {
        if (b.kind !== 'paragraph' && b.kind !== 'heading' && b.kind !== 'blockquote') {
          return null;
        }
        const runs = 'runs' in b ? b.runs : [];
        return (
          <Text
            key={`${keyPrefix}-${i}`}
            style={{
              textAlign: align,
              marginBottom: 2,
              ...resolveFontStyle(font, false, italic),
              fontSize: size,
              lineHeight: 1.3,
            }}
          >
            {renderRuns(runs, font, italic)}
          </Text>
        );
      })}
    </View>
  );
}

// ── Header / footer renderers ────────────────────────────────────────────
function headerText(
  mode: HeaderMode,
  isRecto: boolean,
  bookTitle: string,
  chapterTitle: string,
  authorName: string,
): string {
  switch (mode) {
    case 'none':
      return '';
    case 'book_title':
      return bookTitle;
    case 'chapter_title':
      return chapterTitle;
    case 'author':
      return authorName;
    case 'alternating':
      return isRecto ? chapterTitle : bookTitle;
  }
}

function footerAlign(position: FooterPosition, isRecto: boolean): Align {
  if (position === 'center') return 'center';
  // outside: recto = right, verso = left. inside: opposite.
  if (position === 'outside') return isRecto ? 'right' : 'left';
  return isRecto ? 'left' : 'right';
}

function headerAlign(isRecto: boolean): Align {
  // Headers conventionally align to the outside edge as well.
  return isRecto ? 'right' : 'left';
}

// ── Main document ────────────────────────────────────────────────────────
function BookPdfDocument({
  book,
  edition,
  illustrations,
}: {
  book: BookExportData;
  edition: BookEdition;
  illustrations: Map<string, IllustrationResolution>;
}) {
  const trimWidth = mm(edition.trim_width_mm);
  const trimHeight = mm(edition.trim_height_mm);
  // Symmetric L/R padding here keeps the body column width identical to what
  // proper mirror margins would produce — so line breaks and page breaks
  // match the asymmetric target. The horizontal offset is corrected after
  // rendering by `applyMirrorMarginShift`.
  const padLR = mm((edition.margin_inside_mm + edition.margin_outside_mm) / 2);
  const padTop = mm(edition.margin_top_mm);
  const padBottom = mm(edition.margin_bottom_mm);
  const innerWidth = trimWidth - padLR * 2;

  const pageStyle: Style = {
    paddingTop: padTop,
    paddingBottom: padBottom,
    paddingLeft: padLR,
    paddingRight: padLR,
    ...resolveFontStyle(edition.body_font, false, false),
    fontSize: edition.body_font_size_pt,
    lineHeight: edition.body_line_height,
    color: '#1a1a1a',
  };

  const titlePageStyle: Style = {
    ...pageStyle,
    paddingTop: trimHeight * 0.3,
  };

  const pages: React.ReactElement[] = [];

  // Title page (no header/footer). Omitted in chapter-preview mode where the
  // user is iterating on prose, not the cover.
  if (!book.omitTitlePage) {
    pages.push(
      <Page key="__title" size={[trimWidth, trimHeight]} style={titlePageStyle}>
        {book.series_title && book.series_title.trim() ? (
          <Text
            style={{
              textAlign: 'center',
              marginBottom: 10,
              ...resolveFontStyle(edition.chapter_title_font, false, true),
              fontSize: edition.chapter_title_size_pt - 2,
              letterSpacing: 1.5,
              color: '#555',
            }}
          >
            {book.series_title.trim()}
          </Text>
        ) : null}
        <Text
          style={{
            textAlign: 'center',
            marginBottom: 12,
            ...resolveFontStyle(edition.chapter_title_font, true, false),
            fontSize: edition.chapter_title_size_pt + 6,
          }}
        >
          {book.title}
        </Text>
        {book.description ? (
          <Text
            style={{
              textAlign: 'center',
              ...resolveFontStyle(edition.body_font, false, true),
              fontSize: edition.body_font_size_pt,
              color: '#555',
            }}
          >
            {book.description}
          </Text>
        ) : null}
      </Page>,
    );
  }

  /**
   * Render one "chapter unit" (preface or regular chapter) as an array of
   * Page elements, including chapter title, body segments, illustration
   * pages, framing (chapter_header / chapter_footer) and running header/
   * footer. `displayTitle` is shown on the first page AND used for the
   * running header (chapter_title / alternating modes).
   */
  function renderChapterUnit(
    chapter: {
      id: string;
      title: string | null;
      text: string;
      chapter_header: string | null;
      chapter_footer: string | null;
      opening_illustration_id?: string | null;
    },
    displayTitle: string,
    keyPrefix: string,
  ): React.ReactElement[] {
    const out: React.ReactElement[] = [];

    // Frontispiece — emit a dedicated plate page before any chapter content.
    // Same treatment as inline illustration pages (no header, page number
    // visible, image centered with mirror margins).
    if (chapter.opening_illustration_id) {
      const ill = illustrations.get(chapter.opening_illustration_id);
      const innerH = trimHeight - padTop - padBottom;
      const dims = ill?.src
        ? fitImage(ill.width, ill.height, innerWidth, innerH)
        : { width: innerWidth, height: innerH };
      out.push(
        <Page
          key={`${keyPrefix}-frontis`}
          size={[trimWidth, trimHeight]}
          style={{
            ...pageStyle,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {ill?.src ? (
            <View style={{ alignItems: 'center' }}>
              <Image src={ill.src} style={{ objectFit: 'contain', ...dims }} />
              {ill.caption ? (
                <Text
                  style={{
                    marginTop: 6,
                    textAlign: 'center',
                    ...resolveFontStyle(edition.body_font, false, true),
                    fontSize: edition.body_font_size_pt - 1,
                    color: '#555',
                  }}
                >
                  {ill.caption}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text
              style={{
                textAlign: 'center',
                ...resolveFontStyle(edition.body_font, false, true),
                fontSize: edition.body_font_size_pt,
                color: '#999',
              }}
            >
              [illustration unavailable]
            </Text>
          )}

          {edition.footer_page_numbers
            ? (['left', 'center', 'right'] as const).map((slot) => (
                <Text
                  key={`fpn-${slot}`}
                  fixed
                  style={{
                    position: 'absolute',
                    top: trimHeight - padBottom / 2 - edition.footer_size_pt,
                    left: padLR,
                    right: padLR,
                    textAlign: slot,
                    ...resolveFontStyle(edition.footer_font, false, false),
                    fontSize: edition.footer_size_pt,
                    color: '#888',
                  }}
                  render={({ pageNumber }) => {
                    const isRecto = pageNumber % 2 === 1;
                    const targetAlign = footerAlign(edition.footer_position, isRecto);
                    if (targetAlign !== slot) return '';
                    return String(pageNumber);
                  }}
                />
              ))
            : null}
        </Page>,
      );
    }

    const blocks = parseHtmlToBlocks(chapter.text, illustrations);
    const segments = segmentBlocks(blocks);
    const lastContentSegIdx = segments
      .map((s, i) => (s.kind === 'content' ? i : -1))
      .reduce((a, b) => Math.max(a, b), -1);

    segments.forEach((segment, segIdx) => {
      if (segment.kind === 'illustration_page') {
        const ill = illustrations.get(segment.illustrationId);
        const innerH = trimHeight - padTop - padBottom;
        const dims = ill?.src
          ? fitImage(ill.width, ill.height, innerWidth, innerH)
          : { width: innerWidth, height: innerH };
        out.push(
          <Page
            key={`${keyPrefix}-plate-${segIdx}`}
            size={[trimWidth, trimHeight]}
            style={{
              ...pageStyle,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {ill?.src ? (
              <View style={{ alignItems: 'center' }}>
                <Image src={ill.src} style={{ objectFit: 'contain', ...dims }} />
                {ill.caption ? (
                  <Text
                    style={{
                      marginTop: 6,
                      textAlign: 'center',
                      ...resolveFontStyle(edition.body_font, false, true),
                      fontSize: edition.body_font_size_pt - 1,
                      color: '#555',
                    }}
                  >
                    {ill.caption}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text
                style={{
                  textAlign: 'center',
                  ...resolveFontStyle(edition.body_font, false, true),
                  fontSize: edition.body_font_size_pt,
                  color: '#999',
                }}
              >
                [illustration unavailable]
              </Text>
            )}

            {/* Page number on plate pages (no header — convention keeps the
                running header off plates, but the page number is preserved
                so the reader's pagination feels continuous). */}
            {edition.footer_page_numbers
              ? (['left', 'center', 'right'] as const).map((slot) => (
                  <Text
                    key={`pn-${slot}`}
                    fixed
                    style={{
                      position: 'absolute',
                      top: trimHeight - padBottom / 2 - edition.footer_size_pt,
                      left: padLR,
                      right: padLR,
                      textAlign: slot,
                      ...resolveFontStyle(edition.footer_font, false, false),
                      fontSize: edition.footer_size_pt,
                      color: '#888',
                    }}
                    render={({ pageNumber }) => {
                      const isRecto = pageNumber % 2 === 1;
                      const targetAlign = footerAlign(edition.footer_position, isRecto);
                      if (targetAlign !== slot) return '';
                      return String(pageNumber);
                    }}
                  />
                ))
              : null}
          </Page>,
        );
        return;
      }

      const isFirstSegment = segIdx === 0;
      const isLastContentSegment = segIdx === lastContentSegIdx;
      const ctx: RenderCtx = {
        edition,
        innerWidthPt: innerWidth,
        firstParagraphSeen: { value: !isFirstSegment },
      };

      out.push(
        <Page
          key={`${keyPrefix}-${segIdx}`}
          size={[trimWidth, trimHeight]}
          style={pageStyle}
        >
          {edition.header_mode !== 'none'
            ? (['left', 'right'] as const).map((slot) => (
                <Text
                  key={`hd-${slot}`}
                  fixed
                  style={{
                    position: 'absolute',
                    top: padTop / 2,
                    left: padLR,
                    right: padLR,
                    textAlign: slot,
                    ...resolveFontStyle(edition.header_font, false, edition.header_italic),
                    fontSize: edition.header_size_pt,
                    color: '#888',
                  }}
                  render={({ pageNumber, subPageNumber }) => {
                    if (
                      isFirstSegment &&
                      subPageNumber === 1 &&
                      !edition.header_show_on_chapter_first_page
                    ) {
                      return '';
                    }
                    const isRecto = pageNumber % 2 === 1;
                    if (headerAlign(isRecto) !== slot) return '';
                    return headerText(
                      edition.header_mode,
                      isRecto,
                      book.title,
                      chapter.title ?? displayTitle,
                      '',
                    );
                  }}
                />
              ))
            : null}

          {isFirstSegment ? (
            <Text
              style={{
                textAlign: edition.chapter_title_align,
                marginBottom: 14,
                ...resolveFontStyle(
                  edition.chapter_title_font,
                  edition.chapter_title_bold,
                  edition.chapter_title_italic,
                ),
                fontSize: edition.chapter_title_size_pt,
              }}
            >
              {displayTitle}
            </Text>
          ) : null}

          {isFirstSegment && chapter.chapter_header && chapter.chapter_header.trim()
            ? renderFraming(
                chapter.chapter_header,
                illustrations,
                edition.chapter_header_align,
                edition.chapter_header_italic,
                edition.chapter_header_font,
                edition.chapter_header_size_pt,
                0,
                10,
                `ch-${chapter.id}`,
              )
            : null}

          {segment.blocks.map((b, i) => renderBlock(b, i, ctx))}

          {isLastContentSegment &&
          chapter.chapter_footer &&
          chapter.chapter_footer.trim()
            ? renderFraming(
                chapter.chapter_footer,
                illustrations,
                edition.chapter_footer_align,
                edition.chapter_footer_italic,
                edition.chapter_footer_font,
                edition.chapter_footer_size_pt,
                10,
                0,
                `cf-${chapter.id}`,
              )
            : null}

          {edition.footer_page_numbers
            ? (['left', 'center', 'right'] as const).map((slot) => (
                <Text
                  key={`fn-${slot}`}
                  fixed
                  style={{
                    position: 'absolute',
                    top: trimHeight - padBottom / 2 - edition.footer_size_pt,
                    left: padLR,
                    right: padLR,
                    textAlign: slot,
                    ...resolveFontStyle(edition.footer_font, false, false),
                    fontSize: edition.footer_size_pt,
                    color: '#888',
                  }}
                  render={({ pageNumber, subPageNumber }) => {
                    if (
                      isFirstSegment &&
                      subPageNumber === 1 &&
                      !edition.footer_show_on_chapter_first_page
                    ) {
                      return '';
                    }
                    const isRecto = pageNumber % 2 === 1;
                    const targetAlign = footerAlign(edition.footer_position, isRecto);
                    if (targetAlign !== slot) return '';
                    return String(pageNumber);
                  }}
                />
              ))
            : null}
        </Page>,
      );
    });

    return out;
  }

  // Preface — rendered first, no chapter number, fallback title "Preface".
  if (book.preface) {
    const prefaceTitle = book.preface.title?.trim()
      ? book.preface.title.trim()
      : 'Preface';
    pages.push(...renderChapterUnit(book.preface, prefaceTitle, `preface-${book.preface.id}`));
  }

  // Only emit part-title pages when the book actually splits into ≥2 parts
  // that contain chapters. A single part (or a single non-empty part with
  // stale empty siblings) doesn't need its own page — it would just render a
  // mostly-blank sheet with the part name.
  const partsWithChapters = book.parts.filter((p) => p.chapters.length > 0);
  const multiPart = partsWithChapters.length > 1;

  for (const part of partsWithChapters) {
    if (multiPart) {
      pages.push(
        <Page key={`part-${part.id}`} size={[trimWidth, trimHeight]} style={titlePageStyle}>
          <Text
            style={{
              textAlign: 'center',
              ...resolveFontStyle(edition.chapter_title_font, true, false),
              fontSize: edition.chapter_title_size_pt + 2,
            }}
          >
            {part.title ?? ''}
          </Text>
        </Page>,
      );
    }

    let chapterIndex = 0;
    for (const chapter of part.chapters) {
      chapterIndex++;
      // Honour an explicit number override (used by single-chapter previews
      // to display the real book-wide chapter number rather than 1).
      const displayedNumber = chapter.chapter_number_override ?? chapterIndex;
      const chapterTitle = chapter.title
        ? `Chapitre ${displayedNumber} — ${chapter.title}`
        : `Chapitre ${displayedNumber}`;
      pages.push(...renderChapterUnit(chapter, chapterTitle, chapter.id));
    }
  }

  return <Document title={book.title}>{pages}</Document>;
}

// ── Illustrations resolver ───────────────────────────────────────────────
async function resolveBookIllustrations(
  book: BookExportData,
  edition: BookEdition,
): Promise<Map<string, IllustrationResolution>> {
  const ids = new Set<string>();
  if (book.preface) {
    for (const id of extractIllustrationIds(book.preface.text)) ids.add(id);
    if (book.preface.chapter_header)
      for (const id of extractIllustrationIds(book.preface.chapter_header)) ids.add(id);
    if (book.preface.chapter_footer)
      for (const id of extractIllustrationIds(book.preface.chapter_footer)) ids.add(id);
  }
  for (const part of book.parts) {
    for (const ch of part.chapters) {
      for (const id of extractIllustrationIds(ch.text)) ids.add(id);
      if (ch.chapter_header)
        for (const id of extractIllustrationIds(ch.chapter_header)) ids.add(id);
      if (ch.chapter_footer)
        for (const id of extractIllustrationIds(ch.chapter_footer)) ids.add(id);
      if (ch.opening_illustration_id) ids.add(ch.opening_illustration_id);
    }
  }
  const map = new Map<string, IllustrationResolution>();
  if (ids.size === 0) return map;
  const { data, error } = await supabase
    .from('entity_illustrations')
    .select('id, storage_path, caption, alt_text, width, height, mime_type, updated_at')
    .in('id', Array.from(ids));
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    storage_path: string;
    caption: string | null;
    alt_text: string | null;
    width: number | null;
    height: number | null;
    mime_type: string;
    updated_at: string | null;
  }>;

  const needsFilter =
    edition.image_brightness !== 100 ||
    edition.image_contrast !== 100 ||
    edition.image_grayscale;

  // Fast path — no filter: pass the public URL straight through.
  if (!needsFilter) {
    for (const row of rows) {
      map.set(row.id, {
        src: publicUrlFor(row.storage_path, row.updated_at),
        caption: row.caption,
        alt: row.alt_text ?? row.caption ?? '',
        width: row.width,
        height: row.height,
      });
    }
    return map;
  }

  // Filtered path: download each blob, apply filter via Canvas, embed as data
  // URL. Done in parallel; each image is independent.
  const processed = await Promise.all(
    rows.map(async (row) => {
      try {
        const dataUrl = await fetchAndFilterImage(row.storage_path, row.mime_type, edition);
        return { row, src: dataUrl };
      } catch {
        // Fall back to the unfiltered public URL rather than dropping the image.
        return { row, src: publicUrlFor(row.storage_path, row.updated_at) };
      }
    }),
  );
  for (const { row, src } of processed) {
    map.set(row.id, {
      src,
      caption: row.caption,
      alt: row.alt_text ?? row.caption ?? '',
      width: row.width,
      height: row.height,
    });
  }
  return map;
}

async function fetchAndFilterImage(
  storagePath: string,
  mimeType: string,
  edition: BookEdition,
): Promise<string> {
  // Download bypasses CDN cache so the latest bytes are picked up if the user
  // has just replaced the asset.
  const { data, error } = await supabase.storage
    .from('illustrations')
    .download(storagePath);
  if (error || !data) throw error ?? new Error('Empty download');
  const url = URL.createObjectURL(data);
  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context unavailable');
    const filters: string[] = [];
    if (edition.image_brightness !== 100)
      filters.push(`brightness(${edition.image_brightness / 100})`);
    if (edition.image_contrast !== 100)
      filters.push(`contrast(${edition.image_contrast / 100})`);
    if (edition.image_grayscale) filters.push('grayscale(1)');
    if (filters.length > 0) ctx.filter = filters.join(' ');
    ctx.drawImage(img, 0, 0);
    // PNG preserves transparency, but pdf-lib + JPEG yields smaller PDFs for
    // photographic content. Keep PNG only when the source was PNG.
    const outMime = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(outMime, outMime === 'image/jpeg' ? 0.92 : undefined);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Mirror-margin correction. The React tree renders with symmetric padding
 * (inside+outside)/2 — body column width is correct, but each page sits
 * centered on the trim instead of offset toward the outside edge. We shift
 * each page's content by ±(inside-outside)/2 based on parity:
 *
 *   - Recto (page 1, 3, 5…): inside = left edge → shift content RIGHT, so
 *     the left (spine) margin widens to `inside_mm` and the right shrinks
 *     to `outside_mm`.
 *   - Verso (page 2, 4, 6…): inside = right edge → shift content LEFT.
 *
 * If inside == outside, no shift is applied and the original blob is returned.
 */
async function applyMirrorMarginShift(blob: Blob, edition: BookEdition): Promise<Blob> {
  const delta = edition.margin_inside_mm - edition.margin_outside_mm;
  if (delta === 0) return blob;
  const shiftPt = mm(delta / 2);
  const bytes = await blob.arrayBuffer();
  const doc = await PDFDocument.load(bytes);
  doc.getPages().forEach((page, i) => {
    const isRecto = (i + 1) % 2 === 1;
    const dx = isRecto ? shiftPt : -shiftPt;
    page.translateContent(dx, 0);
  });
  const out = await doc.save();
  // pdf-lib types save() as Uint8Array<ArrayBufferLike>; copy into a fresh
  // ArrayBuffer-backed view so it satisfies the strict BlobPart type.
  const copy = new Uint8Array(out.byteLength);
  copy.set(out);
  return new Blob([copy], { type: 'application/pdf' });
}

/**
 * Build a PDF blob without triggering a download. Used by the in-app preview
 * modal — the consumer is responsible for `URL.createObjectURL(blob)` and
 * later `URL.revokeObjectURL` once it's done with the iframe.
 */
export async function buildBookPdfBlob(
  book: BookExportData,
  edition: BookEdition,
): Promise<Blob> {
  ensureFontsRegistered();
  const illustrations = await resolveBookIllustrations(book, edition);
  const raw = await pdf(
    <BookPdfDocument book={book} edition={edition} illustrations={illustrations} />,
  ).toBlob();
  return applyMirrorMarginShift(raw, edition);
}

export async function generateBookPdf(
  book: BookExportData,
  edition: BookEdition,
): Promise<void> {
  const blob = await buildBookPdfBlob(book, edition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Sanitize both title and edition name down to ASCII-friendly characters.
  // Chrome silently drops downloads whose filename contains certain unicode
  // combinations (em dash + multiplication sign together has been observed),
  // and sticking to ASCII keeps the file portable across filesystems anyway.
  const safe = (s: string) => s.replace(/[^A-Za-z0-9\s\-_.]/g, '_').replace(/\s+/g, ' ').trim();
  a.download = `${safe(book.title)} - ${safe(edition.name)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
