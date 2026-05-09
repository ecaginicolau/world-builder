import { Document, Image, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { parseHtmlToBlocks } from '@/lib/htmlToPdfContent';
import type { IllustrationResolution, PdfBlock, TextRun } from '@/lib/htmlToPdfContent';
import { extractIllustrationIds } from '@/lib/illustrationHydration';
import { publicUrlFor } from '@/lib/queries/illustrations';
import { supabase } from '@/lib/supabase';

// A5 inner width = 148mm − 25mm − 20mm = ~103mm = ~291.5pt
const PAGE_INNER_WIDTH_PT = 291.5;
const ILLUSTRATION_MAX_HEIGHT_PT = 280;

// A5 (format poche): 148 × 210 mm = 419.5 × 595.3 pt
// Margins: ~23mm top/bottom, ~25mm left, ~20mm right
const styles = StyleSheet.create({
  page: {
    paddingTop: 65,
    paddingBottom: 65,
    paddingLeft: 71,
    paddingRight: 57,
    fontFamily: 'Times-Roman',
    fontSize: 11,
    lineHeight: 1.6,
    color: '#1a1a1a',
  },
  // Title / part pages: center via paddingTop (avoids flex:1 layout issues)
  titlePage: {
    paddingTop: 180,
    paddingLeft: 71,
    paddingRight: 57,
    paddingBottom: 65,
    fontFamily: 'Times-Roman',
    fontSize: 11,
    color: '#1a1a1a',
  },
  bookTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  bookDescription: {
    fontFamily: 'Times-Italic',
    fontSize: 11,
    textAlign: 'center',
    color: '#555',
  },
  partTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  chapterHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    marginBottom: 18,
    textAlign: 'center',
  },
  paragraph: {
    marginBottom: 7,
    textAlign: 'justify',
    fontFamily: 'Times-Roman',
    fontSize: 11,
  },
  inlineRoman: { fontFamily: 'Times-Roman' },
  inlineBold: { fontFamily: 'Times-Bold' },
  inlineItalic: { fontFamily: 'Times-Italic' },
  inlineBoldItalic: { fontFamily: 'Times-BoldItalic' },
  heading2: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginTop: 14,
    marginBottom: 6,
  },
  heading3: {
    fontFamily: 'Helvetica-BoldOblique',
    fontSize: 11,
    marginTop: 10,
    marginBottom: 4,
  },
  sceneBreak: {
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 14,
    color: '#666',
    fontFamily: 'Times-Roman',
    fontSize: 11,
  },
  blockquote: {
    marginLeft: 18,
    marginRight: 18,
    marginBottom: 7,
    fontFamily: 'Times-Italic',
    fontSize: 10.5,
    color: '#333',
    textAlign: 'justify',
  },
  listItem: {
    marginBottom: 5,
    fontFamily: 'Times-Roman',
    fontSize: 11,
  },
  // Page number: spacer + footer row, no absolute positioning
  pageFooterSpacer: {
    marginTop: 'auto',
  },
  pageNumber: {
    paddingTop: 14,
    textAlign: 'center',
    fontFamily: 'Times-Roman',
    fontSize: 9,
    color: '#888',
  },
  illustrationContainer: {
    marginTop: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  illustrationImage: {
    objectFit: 'contain',
  },
  illustrationCaption: {
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'Times-Italic',
    fontSize: 9.5,
    color: '#555',
  },
  illustrationMissing: {
    marginTop: 10,
    marginBottom: 12,
    textAlign: 'center',
    fontFamily: 'Times-Italic',
    fontSize: 9.5,
    color: '#999',
  },
});

function fitImage(width: number | null, height: number | null) {
  if (!width || !height) {
    return { width: PAGE_INNER_WIDTH_PT, height: ILLUSTRATION_MAX_HEIGHT_PT };
  }
  const ratio = width / height;
  let w = PAGE_INNER_WIDTH_PT;
  let h = w / ratio;
  if (h > ILLUSTRATION_MAX_HEIGHT_PT) {
    h = ILLUSTRATION_MAX_HEIGHT_PT;
    w = h * ratio;
  }
  return { width: w, height: h };
}

function renderRuns(runs: TextRun[]) {
  if (runs.length === 1 && !runs[0].bold && !runs[0].italic) {
    return runs[0].text;
  }
  return runs.map((r, i) => {
    const s =
      r.bold && r.italic
        ? styles.inlineBoldItalic
        : r.bold
          ? styles.inlineBold
          : r.italic
            ? styles.inlineItalic
            : styles.inlineRoman;
    return (
      <Text key={i} style={s}>
        {r.text}
      </Text>
    );
  });
}

function renderBlock(block: PdfBlock, key: number) {
  switch (block.kind) {
    case 'paragraph':
      return (
        <Text key={key} style={styles.paragraph}>
          {renderRuns(block.runs)}
        </Text>
      );
    case 'heading':
      return (
        <Text key={key} style={block.level <= 2 ? styles.heading2 : styles.heading3}>
          {renderRuns(block.runs)}
        </Text>
      );
    case 'scene_break':
      return (
        <Text key={key} style={styles.sceneBreak}>
          * * *
        </Text>
      );
    case 'blockquote':
      return (
        <Text key={key} style={styles.blockquote}>
          {renderRuns(block.runs)}
        </Text>
      );
    case 'list_item':
      return (
        <Text key={key} style={styles.listItem}>
          {block.ordered ? `${block.index}. ` : '• '}
          {renderRuns(block.runs)}
        </Text>
      );
    case 'illustration': {
      if (!block.src) {
        return (
          <Text key={key} style={styles.illustrationMissing}>
            [illustration unavailable]
          </Text>
        );
      }
      const dims = fitImage(block.width, block.height);
      return (
        <View key={key} style={styles.illustrationContainer} wrap={false}>
          <Image src={block.src} style={[styles.illustrationImage, dims]} />
          {block.caption ? (
            <Text style={styles.illustrationCaption}>{block.caption}</Text>
          ) : null}
        </View>
      );
    }
  }
}

export interface ChapterExportData {
  id: string;
  title: string | null;
  reading_rank: string;
  text: string;
}

export interface PartExportData {
  id: string;
  title: string | null;
  rank: string;
  chapters: ChapterExportData[];
}

export interface BookExportData {
  title: string;
  description?: string | null;
  parts: PartExportData[];
}

function PageFooter() {
  return (
    <View style={styles.pageFooterSpacer}>
      <Text
        style={styles.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function BookPdfDocument({
  book,
  illustrations,
}: {
  book: BookExportData;
  illustrations: Map<string, IllustrationResolution>;
}) {
  const multiPart = book.parts.length > 1;
  const pages: React.ReactElement[] = [];

  // Title page
  pages.push(
    <Page key="__title" size="A5" style={styles.titlePage}>
      <Text style={styles.bookTitle}>{book.title}</Text>
      {book.description ? (
        <Text style={styles.bookDescription}>{book.description}</Text>
      ) : null}
    </Page>,
  );

  for (const part of book.parts) {
    if (multiPart) {
      pages.push(
        <Page key={`part-${part.id}`} size="A5" style={styles.titlePage}>
          <Text style={styles.partTitle}>{part.title ?? ''}</Text>
          <PageFooter />
        </Page>,
      );
    }

    let chapterIndex = 0;
    for (const chapter of part.chapters) {
      chapterIndex++;
      const blocks = parseHtmlToBlocks(chapter.text, illustrations);
      const heading = chapter.title
        ? `Chapitre ${chapterIndex} — ${chapter.title}`
        : `Chapitre ${chapterIndex}`;

      pages.push(
        <Page key={chapter.id} size="A5" style={styles.page}>
          <Text style={styles.chapterHeading}>{heading}</Text>
          {blocks.map((b, i) => renderBlock(b, i))}
          <PageFooter />
        </Page>,
      );
    }
  }

  return <Document title={book.title}>{pages}</Document>;
}

async function resolveBookIllustrations(
  book: BookExportData,
): Promise<Map<string, IllustrationResolution>> {
  const ids = new Set<string>();
  for (const part of book.parts) {
    for (const ch of part.chapters) {
      for (const id of extractIllustrationIds(ch.text)) ids.add(id);
    }
  }
  const map = new Map<string, IllustrationResolution>();
  if (ids.size === 0) return map;
  const { data, error } = await supabase
    .from('entity_illustrations')
    .select('id, storage_path, caption, alt_text, width, height')
    .in('id', Array.from(ids));
  if (error) throw error;
  for (const row of (data ?? []) as Array<{
    id: string;
    storage_path: string;
    caption: string | null;
    alt_text: string | null;
    width: number | null;
    height: number | null;
  }>) {
    map.set(row.id, {
      src: publicUrlFor(row.storage_path),
      caption: row.caption,
      alt: row.alt_text ?? row.caption ?? '',
      width: row.width,
      height: row.height,
    });
  }
  return map;
}

export async function generateBookPdf(book: BookExportData): Promise<void> {
  const illustrations = await resolveBookIllustrations(book);
  const blob = await pdf(<BookPdfDocument book={book} illustrations={illustrations} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${book.title.replace(/[^\w\s\-_.]/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
