import { Font } from '@react-pdf/renderer';

import ebGaramondRegular from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import ebGaramondItalic from '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url';
import ebGaramondBold from '@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url';
import ebGaramondBoldItalic from '@fontsource/eb-garamond/files/eb-garamond-latin-700-italic.woff?url';

import cormorantRegular from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff?url';
import cormorantItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff?url';
import cormorantBold from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff?url';
import cormorantBoldItalic from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-700-italic.woff?url';

import jetbrainsRegular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import jetbrainsItalic from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-italic.woff?url';
import jetbrainsBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url';
import jetbrainsBoldItalic from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-italic.woff?url';

/**
 * Catalog of fonts available in the PDF export.
 *
 * Each entry maps a family name (stored verbatim in `book_editions.body_font`
 * etc.) to either:
 *   - `kind: 'standard'` — a PDF Standard-14 font that @react-pdf/renderer
 *     resolves natively (no embedding needed). The four PostScript variant
 *     names are returned as-is to consuming styles.
 *   - `kind: 'embedded'` — a custom font registered via Font.register; the
 *     family name is the same string used by callers.
 *
 * The `resolve(family, bold, italic)` helper returns the style props to pass
 * to a @react-pdf <Text>: either { fontFamily } when the family handles
 * weight/style internally (embedded fonts registered with `fonts: [...]`), or
 * { fontFamily } pointing at a per-variant PostScript name (Standard-14).
 */

interface StandardEntry {
  kind: 'standard';
  family: string;
  /** PostScript variant names — order: regular, bold, italic, bold-italic */
  variants: [string, string, string, string];
}

interface EmbeddedEntry {
  kind: 'embedded';
  family: string;
  registered?: boolean;
  variants: {
    regular: string;
    italic: string;
    bold: string;
    boldItalic: string;
  };
}

type Entry = StandardEntry | EmbeddedEntry;

const CATALOG: Record<string, Entry> = {
  'EB Garamond': {
    kind: 'embedded',
    family: 'EB Garamond',
    variants: {
      regular: ebGaramondRegular,
      italic: ebGaramondItalic,
      bold: ebGaramondBold,
      boldItalic: ebGaramondBoldItalic,
    },
  },
  'Cormorant Garamond': {
    kind: 'embedded',
    family: 'Cormorant Garamond',
    variants: {
      regular: cormorantRegular,
      italic: cormorantItalic,
      bold: cormorantBold,
      boldItalic: cormorantBoldItalic,
    },
  },
  'JetBrains Mono': {
    kind: 'embedded',
    family: 'JetBrains Mono',
    variants: {
      regular: jetbrainsRegular,
      italic: jetbrainsItalic,
      bold: jetbrainsBold,
      boldItalic: jetbrainsBoldItalic,
    },
  },
  // PDF Standard-14 fonts — always available, no embedding cost. KDP technically
  // wants embedded fonts, so prefer the embedded ones above for production
  // exports. These are kept for fallback and for ultra-light test exports.
  'Times Roman': {
    kind: 'standard',
    family: 'Times Roman',
    variants: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
  },
  Helvetica: {
    kind: 'standard',
    family: 'Helvetica',
    variants: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
  },
  Courier: {
    kind: 'standard',
    family: 'Courier',
    variants: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'],
  },
};

let registered = false;

/**
 * Vite's `?url` returns a path like `/assets/x.woff`. @react-pdf's `is-url`
 * check requires a protocol; without it, the loader falls through to a
 * filesystem-only path and font metrics come back as NaN, blowing up layout
 * with `unsupported number: ...e+23` in PDFDocument.translate.
 *
 * Make the URL absolute against the current origin to keep the loader on the
 * fetch() branch.
 */
function absolutize(pathOrUrl: string): string {
  if (typeof window === 'undefined') return pathOrUrl;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, window.location.origin).toString();
}

export function ensureFontsRegistered() {
  if (registered) return;
  for (const entry of Object.values(CATALOG)) {
    if (entry.kind !== 'embedded') continue;
    Font.register({
      family: entry.family,
      fonts: [
        { src: absolutize(entry.variants.regular), fontWeight: 'normal', fontStyle: 'normal' },
        { src: absolutize(entry.variants.italic), fontWeight: 'normal', fontStyle: 'italic' },
        { src: absolutize(entry.variants.bold), fontWeight: 'bold', fontStyle: 'normal' },
        { src: absolutize(entry.variants.boldItalic), fontWeight: 'bold', fontStyle: 'italic' },
      ],
    });
  }
  // Disable hyphenation entirely for now — @react-pdf has no hyphen dictionary
  // for French and the default English splitter inserts hyphens at the wrong
  // places. Re-enable later via a dedicated FR dictionary if "rivers" become
  // visually painful on real manuscripts.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export { FONT_CATALOG_NAMES } from './pdfFontCatalog';

/**
 * Resolve a font family + variant flags to the (fontFamily, fontStyle, fontWeight)
 * triple to apply to a @react-pdf style object. Falls back to "Times Roman" if
 * the requested family is unknown — keeps the renderer crash-free for legacy
 * rows or typos.
 */
export function resolveFontStyle(
  family: string,
  bold = false,
  italic = false,
): { fontFamily: string; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic' } {
  const entry = CATALOG[family] ?? CATALOG['Times Roman'];
  if (entry.kind === 'standard') {
    const idx = (bold ? 1 : 0) + (italic ? 2 : 0);
    return { fontFamily: entry.variants[idx] };
  }
  return {
    fontFamily: entry.family,
    fontWeight: bold ? 'bold' : 'normal',
    fontStyle: italic ? 'italic' : 'normal',
  };
}
