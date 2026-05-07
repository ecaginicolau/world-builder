// Re-renders chapter HTML with `<mark data-annotation-id=… data-kind=…>`
// wrappers around the text ranges resolved by anchorAnnotations.
//
// The wrap is computed against the rendered plaintext (concatenation of all
// text nodes in document order). We walk the HTML linearly, reconstruct the
// plaintext-position cursor as we go, and re-emit chunks with marks inserted
// at the right boundaries. Tags are preserved verbatim.
//
// Limitation: a mark that spans across HTML tag boundaries will be split into
// multiple <mark> wrappers (one per text-node chunk it covers), which is fine
// — they share the same data-annotation-id, so click handlers can resolve them
// to a single annotation.

import type { AnchorRange } from './anchorAnnotations';
import { findAnchor } from './anchorAnnotations';

export interface InlineAnnotation {
  id: string;
  kind: 'up' | 'down' | 'comment';
  selected_text: string;
  before_ctx: string;
  after_ctx: string;
}

export interface RenderResult {
  html: string;
  orphans: InlineAnnotation[];
}

export function htmlToPlaintext(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      if (close === -1) break;
      const tag = html.slice(i, close + 1);
      // Treat block-level closing tags as a newline-equivalent. We don't add
      // them to plaintext to match `textContent` semantics in the browser.
      i = close + 1;
      // Note: textContent ignores tags entirely, no spacing inserted. We do
      // the same so offsets stay aligned.
      void tag;
    } else {
      const next = html.indexOf('<', i);
      const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
      out += decodeEntities(chunk);
      i = next === -1 ? html.length : next;
    }
  }
  return out;
}

export function renderAnnotated(
  html: string,
  annotations: InlineAnnotation[],
  options: { className?: string } = {},
): RenderResult {
  const className = options.className ?? 'reader-annotation';
  const plaintext = htmlToPlaintext(html);

  type Resolved = { ann: InlineAnnotation; range: AnchorRange };
  const resolved: Resolved[] = [];
  const orphans: InlineAnnotation[] = [];
  for (const ann of annotations) {
    const range = findAnchor(plaintext, ann);
    if (range) resolved.push({ ann, range });
    else orphans.push(ann);
  }

  if (resolved.length === 0) return { html, orphans };

  // Build sorted boundary events.
  type Boundary = { pos: number; kind: 'open' | 'close'; ann: InlineAnnotation };
  const boundaries: Boundary[] = [];
  for (const r of resolved) {
    boundaries.push({ pos: r.range.start, kind: 'open', ann: r.ann });
    boundaries.push({ pos: r.range.end, kind: 'close', ann: r.ann });
  }
  // Sort: closes before opens at the same position, otherwise by position.
  boundaries.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.kind !== b.kind) return a.kind === 'close' ? -1 : 1;
    return 0;
  });

  // Walk html and plaintext in lockstep. For each text chunk, split on the
  // boundaries that fall inside it.
  let out = '';
  let i = 0;
  let plainCursor = 0;
  let bIdx = 0;
  // Stack of currently-open marks (for cross-tag splitting).
  const openStack: InlineAnnotation[] = [];

  function flushBoundariesUpTo(targetPos: number) {
    while (bIdx < boundaries.length && boundaries[bIdx].pos <= targetPos) {
      const b = boundaries[bIdx];
      if (b.kind === 'close') {
        // Close the mark — but only if it's the topmost open. If not, we close
        // and re-open inner marks. For simplicity we close all then reopen
        // those that should remain open.
        const idx = openStack.findIndex((a) => a.id === b.ann.id);
        if (idx !== -1) {
          // Close all from top of stack down to (and including) idx.
          const toReopen: InlineAnnotation[] = [];
          for (let j = openStack.length - 1; j >= idx; j--) {
            out += '</mark>';
            if (j > idx) toReopen.unshift(openStack[j]);
          }
          openStack.splice(idx, openStack.length - idx);
          for (const a of toReopen) {
            out += openTag(a, className);
            openStack.push(a);
          }
        }
      } else {
        out += openTag(b.ann, className);
        openStack.push(b.ann);
      }
      bIdx++;
    }
  }

  while (i < html.length) {
    if (html[i] === '<') {
      const close = html.indexOf('>', i);
      if (close === -1) {
        out += html.slice(i);
        break;
      }
      // Before emitting the tag, close any open marks (they shouldn't span tag
      // boundaries) — we'll reopen on the other side if still active.
      // We emit the tag, then mark stack is preserved logically; we close all
      // currently-open marks before tag and reopen after.
      const reopen = [...openStack];
      for (let j = openStack.length - 1; j >= 0; j--) out += '</mark>';
      out += html.slice(i, close + 1);
      for (const a of reopen) out += openTag(a, className);
      i = close + 1;
    } else {
      const next = html.indexOf('<', i);
      const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
      // Iterate char-by-char to honor entity boundaries (a `&amp;` is one
      // logical char). Cheaper: walk the decoded chunk and re-encode pieces.
      const decoded = decodeEntities(chunk);
      let chunkPos = 0;
      while (chunkPos < decoded.length) {
        const remainingPlain = decoded.length - chunkPos;
        // Next boundary inside this chunk?
        const nextBoundaryPos =
          bIdx < boundaries.length ? boundaries[bIdx].pos : Infinity;
        const charsUntilBoundary = nextBoundaryPos - plainCursor;
        if (charsUntilBoundary <= 0) {
          flushBoundariesUpTo(plainCursor);
          continue;
        }
        const take = Math.min(remainingPlain, charsUntilBoundary);
        out += encodeEntities(decoded.slice(chunkPos, chunkPos + take));
        chunkPos += take;
        plainCursor += take;
      }
      i = next === -1 ? html.length : next;
    }
  }
  // Close any still-open marks at the very end.
  while (openStack.length > 0) {
    out += '</mark>';
    openStack.pop();
  }

  return { html: out, orphans };
}

function openTag(ann: InlineAnnotation, className: string): string {
  return `<mark class="${className}" data-annotation-id="${escapeAttr(ann.id)}" data-kind="${ann.kind}">`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function encodeEntities(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
