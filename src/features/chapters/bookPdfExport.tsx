import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { parseHtmlToBlocks } from '@/lib/htmlToPdfContent';
import type { PdfBlock, TextRun } from '@/lib/htmlToPdfContent';

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
});

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

function BookPdfDocument({ book }: { book: BookExportData }) {
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
      const blocks = parseHtmlToBlocks(chapter.text);
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

export async function generateBookPdf(book: BookExportData): Promise<void> {
  const blob = await pdf(<BookPdfDocument book={book} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${book.title.replace(/[^\w\s\-_.]/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
