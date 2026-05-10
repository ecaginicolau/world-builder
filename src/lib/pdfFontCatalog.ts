/**
 * Font names available for PDF export. Kept in a tiny file with no @react-pdf
 * dependency so it can be statically imported from UI components without
 * pulling the @react-pdf bundle (and ~400 kB of woff files) into the main
 * chunk. The actual font registration lives in `pdfFonts.ts`, which is only
 * touched from the PDF export entry point (dynamically imported).
 */
export const FONT_CATALOG_NAMES: readonly string[] = [
  'EB Garamond',
  'Cormorant Garamond',
  'JetBrains Mono',
  'Times Roman',
  'Helvetica',
  'Courier',
];
