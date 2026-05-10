export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
};

export interface IllustrationResolution {
  src: string;
  caption: string | null;
  alt: string;
  width: number | null;
  height: number | null;
}

export type PdfBlock =
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'heading'; level: number; runs: TextRun[] }
  | { kind: 'list_item'; ordered: boolean; index: number; runs: TextRun[] }
  | { kind: 'blockquote'; runs: TextRun[] }
  | { kind: 'scene_break' }
  | { kind: 'page_break'; illustrationId?: string; entityId?: string }
  | {
      kind: 'illustration';
      illustrationId: string;
      src: string | null;
      caption: string | null;
      alt: string;
      width: number | null;
      height: number | null;
    };

function extractRuns(node: Node, bold = false, italic = false): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return text ? [{ text, ...(bold && { bold: true }), ...(italic && { italic: true }) }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const isBold = bold || tag === 'strong' || tag === 'b';
  const isItalic = italic || tag === 'em' || tag === 'i';
  const runs: TextRun[] = [];
  el.childNodes.forEach((child) => runs.push(...extractRuns(child, isBold, isItalic)));
  return runs;
}

export function parseHtmlToBlocks(
  html: string,
  illustrations?: Map<string, IllustrationResolution>,
): PdfBlock[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: PdfBlock[] = [];

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'div' && el.hasAttribute('data-page-break')) {
      const illId = el.getAttribute('data-illustration-id');
      const entId = el.getAttribute('data-entity-id');
      blocks.push({
        kind: 'page_break',
        ...(illId ? { illustrationId: illId } : {}),
        ...(entId ? { entityId: entId } : {}),
      });
    } else if (tag === 'figure' && el.hasAttribute('data-illustration-id')) {
      const id = el.getAttribute('data-illustration-id') ?? '';
      const rec = illustrations?.get(id);
      blocks.push({
        kind: 'illustration',
        illustrationId: id,
        src: rec?.src ?? null,
        caption: rec?.caption ?? null,
        alt: rec?.alt ?? '',
        width: rec?.width ?? null,
        height: rec?.height ?? null,
      });
    } else if (tag === 'p' || tag === 'div') {
      const runs = extractRuns(el);
      if (runs.some((r) => r.text.trim())) blocks.push({ kind: 'paragraph', runs });
    } else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const level = parseInt(tag[1]);
      const runs = extractRuns(el);
      if (runs.length) blocks.push({ kind: 'heading', level, runs });
    } else if (tag === 'hr') {
      blocks.push({ kind: 'scene_break' });
    } else if (tag === 'blockquote') {
      const runs = extractRuns(el);
      if (runs.length) blocks.push({ kind: 'blockquote', runs });
    } else if (tag === 'ul' || tag === 'ol') {
      let idx = 0;
      for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
        const runs = extractRuns(li);
        if (runs.length) {
          blocks.push({ kind: 'list_item', ordered: tag === 'ol', index: ++idx, runs });
        }
      }
    }
  }

  return blocks;
}
