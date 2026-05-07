// Tiptap stores rich text as HTML. Agents naturally write plain text with
// `\n` line breaks; without conversion, the whole text collapses into a single
// paragraph in the editor.
//
// Heuristic: if the input already looks like HTML (leading `<…>` block-level
// tag), pass it through. Otherwise split on blank lines for paragraphs and
// convert single newlines to `<br>` within a paragraph.

const HTML_LEADING = /^\s*<(p|div|h[1-6]|ul|ol|blockquote|pre)\b/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Best-effort HTML → plain text. Used to keep events.description in sync
 * with description_html when only the latter is provided. */
export function htmlToPlainText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** When agents pass plain text + html, return both synced.
 *  - both provided: use both as-is.
 *  - only plain: derive html.
 *  - only html: derive plain.
 *  - neither: both null. */
export function syncRichText(opts: {
  plain?: string | null;
  html?: string | null;
}): { plain: string | null; html: string | null } {
  const plain = opts.plain ?? null;
  const html = opts.html ?? null;
  if (plain !== null && html !== null) return { plain, html };
  if (plain !== null) return { plain, html: plainTextToHtml(plain) };
  if (html !== null) return { plain: htmlToPlainText(html), html };
  return { plain: null, html: null };
}

export function plainTextToHtml(input: string): string {
  if (!input) return "";
  if (HTML_LEADING.test(input)) return input;
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.replace(/^\n+|\n+$/g, "");
      if (trimmed.length === 0) return "";
      const escaped = escapeHtml(trimmed).replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .filter((s) => s.length > 0)
    .join("");
}
