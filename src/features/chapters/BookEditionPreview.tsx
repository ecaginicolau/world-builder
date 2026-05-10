import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useIllustration, publicUrlFor } from '@/lib/queries/illustrations';
import type { Align, BookEdition, FooterPosition, HeaderMode } from './types';

// Webfont CSS imports — same families as the PDF export so what you see is
// (approximately) what you'll get. Only the latin subset is needed for FR
// content, but @fontsource files include unicode-range so the browser only
// downloads what the page actually uses.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/700.css';
import '@fontsource/eb-garamond/700-italic.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/400-italic.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/jetbrains-mono/700-italic.css';

// 1 mm = ~3.78 px at 96 dpi. We render the preview at a fixed scale factor so
// pages stay legible but never blow past the panel width. 0.55 = ~half real
// size, which keeps a 6×9 spread (~1150 px natural) at ~635 px scaled — fits
// within the panel without horizontal scroll.
//
// Both mm and pt measurements are scaled, so dimensions and typography stay
// proportional. The user can still feel margin/font choices accurately —
// just at a smaller printable-equivalent size.
const PREVIEW_SCALE = 0.55;
const mmPx = (v: number) => v * 3.78 * PREVIEW_SCALE;
const ptPx = (v: number) => v * 1.333 * PREVIEW_SCALE;

interface PreviewChapter {
  title: string | null;
  text: string;
  chapter_header: string | null;
  chapter_footer: string | null;
  opening_illustration_id: string | null;
}

/**
 * Fetches the first chapter of a book (by reading_rank order) along with its
 * final-version text. Used as the WYSIWYG preview content. Returns null while
 * loading or if the book has no chapter yet.
 */
function useFirstChapterForPreview(bookId: string): PreviewChapter | null {
  const { data } = useQuery<PreviewChapter | null>({
    queryKey: ['book_editions', 'preview_chapter', bookId],
    queryFn: async () => {
      const partsRes = await supabase
        .from('parts')
        .select('id, rank')
        .eq('book_id', bookId)
        .order('rank', { ascending: true });
      if (partsRes.error) throw partsRes.error;
      const firstPart = partsRes.data?.[0];
      if (!firstPart) return null;

      const chRes = await supabase
        .from('chapters')
        .select(
          'id, title, reading_rank, final_version_id, chapter_header, chapter_footer, opening_illustration_id',
        )
        .eq('part_id', firstPart.id)
        .order('reading_rank', { ascending: true });
      if (chRes.error) throw chRes.error;
      const firstChapter = chRes.data?.[0];
      if (!firstChapter) return null;

      let text = '';
      if (firstChapter.final_version_id) {
        const vRes = await supabase
          .from('chapter_versions')
          .select('text')
          .eq('id', firstChapter.final_version_id)
          .single();
        if (vRes.data) text = vRes.data.text;
      }

      return {
        title: firstChapter.title,
        text,
        chapter_header: firstChapter.chapter_header,
        chapter_footer: firstChapter.chapter_footer,
        opening_illustration_id: firstChapter.opening_illustration_id ?? null,
      };
    },
    enabled: !!bookId,
  });
  return data ?? null;
}

interface Props {
  edition: BookEdition;
  bookId: string;
  bookTitle: string;
}

/**
 * Live HTML/CSS approximation of what the PDF will look like. Renders a
 * 2-page facing spread: a verso with running typography on the left, the
 * chapter's first page (chapter title + first paragraphs + drop cap) on the
 * right. Mirror margins are TRUE here (CSS) — unlike the PDF, where they are
 * approximated symmetrically.
 *
 * Caveats:
 *   - HTML and @react-pdf use different layout engines. Justify, hyphenation
 *     and line breaks WILL differ. The preview is for picking typography, not
 *     for verifying exact line endings.
 *   - Pagination is heuristic: the right page shows the start of the chapter,
 *     the left page shows a running-pages estimate. This is enough to judge
 *     fonts, sizes, indents, headers/footers, drop cap, framing.
 */
export function BookEditionPreview({ edition, bookId, bookTitle }: Props) {
  const chapter = useFirstChapterForPreview(bookId);
  const blocks = useMemo(() => splitTextToBlocks(chapter?.text ?? ''), [chapter?.text]);


  if (!chapter) {
    return (
      <div className="rounded border border-border bg-bg-subtle/30 p-4 text-xs text-fg-muted">
        Add at least one chapter to see a preview.
      </div>
    );
  }

  const chapterTitle = chapter.title
    ? `Chapitre 1 — ${chapter.title}`
    : `Chapitre 1`;

  // Cap to ~15 paragraphs per page. Heavy enough to demo typography, light
  // enough that the layout doesn't choke at full-resolution + scale transform.
  const PER_PAGE = 15;
  const firstPageBlocks = blocks.slice(0, PER_PAGE);
  const secondPageBlocks = blocks.slice(PER_PAGE, PER_PAGE * 2);

  // Verso of the spread = a plate page, with priority:
  //   1. Frontispiece (chapter.opening_illustration_id) if set
  //   2. First inline full-page illustration encountered in the chapter text
  //   3. Otherwise running content (continuation of body)
  const firstFullPageId =
    chapter.opening_illustration_id ??
    blocks.find(
      (b): b is { kind: 'full_page_illustration'; illustrationId: string } =>
        b.kind === 'full_page_illustration',
    )?.illustrationId ??
    null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-fg-muted">
        Live preview · approximate · HTML rendering, not PDF — exact line breaks may differ
      </p>
      <div className="flex justify-center gap-2 overflow-x-auto rounded bg-neutral-800 p-4">
        {firstFullPageId ? (
          <FullPagePreviewPage
            edition={edition}
            illustrationId={firstFullPageId}
          />
        ) : (
          <PreviewPage
            side="verso"
            edition={edition}
            chapter={chapter}
            chapterTitle={chapterTitle}
            bookTitle={bookTitle}
            isChapterFirstPage={false}
            pageNumber={2}
            blocks={secondPageBlocks}
          />
        )}
        <PreviewPage
          side="recto"
          edition={edition}
          chapter={chapter}
          chapterTitle={chapterTitle}
          bookTitle={bookTitle}
          isChapterFirstPage={true}
          pageNumber={1}
          blocks={firstPageBlocks}
        />
      </div>
    </div>
  );
}

function FullPagePreviewPage({
  edition,
  illustrationId,
  pageNumber = 2,
}: {
  edition: BookEdition;
  illustrationId: string;
  pageNumber?: number;
}) {
  const { data: ill } = useIllustration(illustrationId);
  const widthPx = mmPx(edition.trim_width_mm);
  const heightPx = mmPx(edition.trim_height_mm);
  const padTop = mmPx(edition.margin_top_mm);
  const padBottom = mmPx(edition.margin_bottom_mm);
  // Plates use the same mirror margins as content pages — verso (left page)
  // has outside on the left, inside on the right.
  const padLeft = mmPx(edition.margin_outside_mm);
  const padRight = mmPx(edition.margin_inside_mm);
  const isRecto = pageNumber % 2 === 1;
  const fAlign = footerAlign(edition.footer_position, isRecto);

  return (
    <div
      style={{
        position: 'relative',
        width: widthPx,
        height: heightPx,
        background: 'white',
        color: '#1a1a1a',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        flexShrink: 0,
        paddingTop: padTop,
        paddingBottom: padBottom,
        paddingLeft: padLeft,
        paddingRight: padRight,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {ill ? (
        <>
          <img
            src={publicUrlFor(ill.storage_path)}
            alt={ill.alt_text ?? ill.caption ?? ''}
            style={{
              maxWidth: '100%',
              maxHeight: '88%',
              objectFit: 'contain',
            }}
          />
          {ill.caption ? (
            <p
              style={{
                textAlign: 'center',
                fontFamily: `"${edition.body_font}", serif`,
                fontSize: ptPx(edition.body_font_size_pt - 1),
                fontStyle: 'italic',
                color: '#555',
              }}
            >
              {ill.caption}
            </p>
          ) : null}
        </>
      ) : (
        <p style={{ color: '#999', fontStyle: 'italic' }}>Loading illustration…</p>
      )}

      {edition.footer_page_numbers ? (
        <div
          style={{
            position: 'absolute',
            bottom: padBottom / 2 - ptPx(edition.footer_size_pt) / 2,
            left: padLeft,
            right: padRight,
            textAlign: fAlign,
            fontFamily: `"${edition.footer_font}", serif`,
            fontSize: ptPx(edition.footer_size_pt),
            color: '#888',
          }}
        >
          {pageNumber}
        </div>
      ) : null}
    </div>
  );
}

// ── Page renderer ────────────────────────────────────────────────────────

interface PageProps {
  side: 'verso' | 'recto';
  edition: BookEdition;
  chapter: PreviewChapter;
  chapterTitle: string;
  bookTitle: string;
  isChapterFirstPage: boolean;
  pageNumber: number;
  blocks: SimpleBlock[];
}

function PreviewPage({
  side,
  edition,
  chapter,
  chapterTitle,
  bookTitle,
  isChapterFirstPage,
  pageNumber,
  blocks,
}: PageProps) {
  const isRecto = side === 'recto';
  const widthPx = mmPx(edition.trim_width_mm);
  const heightPx = mmPx(edition.trim_height_mm);
  const padTop = mmPx(edition.margin_top_mm);
  const padBottom = mmPx(edition.margin_bottom_mm);
  // Mirror margins (true): inside on gutter side.
  const padLeft = mmPx(isRecto ? edition.margin_inside_mm : edition.margin_outside_mm);
  const padRight = mmPx(isRecto ? edition.margin_outside_mm : edition.margin_inside_mm);

  const showHeader =
    edition.header_mode !== 'none' &&
    !(isChapterFirstPage && !edition.header_show_on_chapter_first_page);
  const showFooter =
    edition.footer_page_numbers &&
    !(isChapterFirstPage && !edition.footer_show_on_chapter_first_page);

  const hText = headerText(
    edition.header_mode,
    isRecto,
    bookTitle,
    chapter.title ?? 'Chapitre 1',
  );
  const hAlign: Align = isRecto ? 'right' : 'left';
  const fAlign = footerAlign(edition.footer_position, isRecto);

  return (
    <div
      style={{
        width: widthPx,
        height: heightPx,
        background: 'white',
        color: '#1a1a1a',
        position: 'relative',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        flexShrink: 0,
        paddingTop: padTop,
        paddingBottom: padBottom,
        paddingLeft: padLeft,
        paddingRight: padRight,
        fontFamily: `"${edition.body_font}", serif`,
        fontSize: ptPx(edition.body_font_size_pt),
        lineHeight: edition.body_line_height,
        overflow: 'hidden',
      }}
    >
      {showHeader && hText ? (
        <div
          style={{
            position: 'absolute',
            top: padTop / 2 - ptPx(edition.header_size_pt),
            left: padLeft,
            right: padRight,
            textAlign: hAlign,
            fontFamily: `"${edition.header_font}", serif`,
            fontSize: ptPx(edition.header_size_pt),
            fontStyle: edition.header_italic ? 'italic' : 'normal',
            color: '#888',
          }}
        >
          {hText}
        </div>
      ) : null}

      {isChapterFirstPage ? (
        <>
          <h2
            style={{
              textAlign: edition.chapter_title_align,
              marginBottom: 14 * PREVIEW_SCALE,
              fontFamily: `"${edition.chapter_title_font}", serif`,
              fontSize: ptPx(edition.chapter_title_size_pt),
              fontWeight: edition.chapter_title_bold ? 'bold' : 'normal',
              fontStyle: edition.chapter_title_italic ? 'italic' : 'normal',
            }}
          >
            {chapterTitle}
          </h2>
          {chapter.chapter_header && chapter.chapter_header.trim() ? (
            <div
              style={{
                textAlign: edition.chapter_header_align,
                marginBottom: 12 * PREVIEW_SCALE,
                fontFamily: `"${edition.chapter_header_font}", serif`,
                fontSize: ptPx(edition.chapter_header_size_pt),
                fontStyle: edition.chapter_header_italic ? 'italic' : 'normal',
                lineHeight: 1.3,
              }}
              dangerouslySetInnerHTML={{ __html: chapter.chapter_header }}
            />
          ) : null}
        </>
      ) : null}

      {/* Body */}
      {blocks.map((b, i) => {
        const isFirstParagraph = isChapterFirstPage && i === 0 && b.kind === 'paragraph';
        if (b.kind === 'paragraph') {
          // Inline drop cap (matches the PDF approach, not CSS ::first-letter,
          // so what you see in the preview maps to the exported PDF).
          let content: React.ReactNode = b.text;
          if (isFirstParagraph && edition.drop_cap && b.text.length > 0) {
            content = (
              <>
                <span
                  style={{
                    fontFamily: `"${edition.chapter_title_font}", serif`,
                    fontSize: ptPx(edition.body_font_size_pt * 2.6),
                    fontWeight: edition.chapter_title_bold ? 'bold' : 'normal',
                    lineHeight: 1,
                  }}
                >
                  {b.text.slice(0, 1)}
                </span>
                {b.text.slice(1)}
              </>
            );
          }
          return (
            <p
              key={i}
              style={{
                margin: `0 0 ${4 * PREVIEW_SCALE}px 0`,
                textAlign: edition.body_justify ? 'justify' : 'left',
                textIndent: i === 0 ? 0 : mmPx(edition.paragraph_indent_mm),
              }}
            >
              {content}
            </p>
          );
        }
        if (b.kind === 'scene_break') {
          return (
            <p
              key={i}
              style={{
                textAlign: 'center',
                margin: `${10 * PREVIEW_SCALE}px 0`,
                color: '#666',
              }}
            >
              * * *
            </p>
          );
        }
        return null;
      })}

      {showFooter ? (
        <div
          style={{
            position: 'absolute',
            bottom: padBottom / 2 - ptPx(edition.footer_size_pt) / 2,
            left: padLeft,
            right: padRight,
            textAlign: fAlign,
            fontFamily: `"${edition.footer_font}", serif`,
            fontSize: ptPx(edition.footer_size_pt),
            color: '#888',
          }}
        >
          {pageNumber}
        </div>
      ) : null}
    </div>
  );
}

// ── Helpers (kept here, not shared with PDF: divergence is desired) ──────

function headerText(
  mode: HeaderMode,
  isRecto: boolean,
  bookTitle: string,
  chapterTitle: string,
): string {
  switch (mode) {
    case 'none':
      return '';
    case 'book_title':
      return bookTitle;
    case 'chapter_title':
      return chapterTitle;
    case 'author':
      return '';
    case 'alternating':
      return isRecto ? chapterTitle : bookTitle;
  }
}

function footerAlign(position: FooterPosition, isRecto: boolean): Align {
  if (position === 'center') return 'center';
  if (position === 'outside') return isRecto ? 'right' : 'left';
  return isRecto ? 'left' : 'right';
}

// ── Tiptap HTML → simple blocks ──────────────────────────────────────────
// We don't share parseHtmlToBlocks with the PDF here because that path uses
// DOMParser (which is fine in browser) and emits richer block kinds. For the
// preview a simpler split is enough — paragraphs and scene breaks.

type SimpleBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'scene_break' }
  | { kind: 'full_page_illustration'; illustrationId: string };

function splitTextToBlocks(html: string): SimpleBlock[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: SimpleBlock[] = [];
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'div' && el.hasAttribute('data-page-break')) {
      const illId = el.getAttribute('data-illustration-id');
      if (illId) out.push({ kind: 'full_page_illustration', illustrationId: illId });
      // Empty page-breaks aren't visible in the preview; they're invisible
      // segmentation hints handled by the PDF.
    } else if (tag === 'p' || tag === 'div') {
      const text = (el.textContent ?? '').trim();
      if (text) out.push({ kind: 'paragraph', text });
    } else if (tag === 'hr') {
      out.push({ kind: 'scene_break' });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = (el.textContent ?? '').trim();
      if (text) out.push({ kind: 'paragraph', text });
    }
  }
  return out;
}
