// Capture a text selection from the DOM as { text, before, after } with
// configurable context window. Pure logic for the path that takes the
// container's textContent + range offsets — testable independently from a
// real DOM via captureFromOffsets.

export const DEFAULT_CONTEXT = 30;

export interface CapturedSelection {
  selected_text: string;
  before_ctx: string;
  after_ctx: string;
}

export function captureFromOffsets(
  plaintext: string,
  startOffset: number,
  endOffset: number,
  contextSize = DEFAULT_CONTEXT,
): CapturedSelection | null {
  if (startOffset < 0 || endOffset > plaintext.length) return null;
  if (endOffset <= startOffset) return null;

  const selected_text = plaintext.slice(startOffset, endOffset);
  if (!selected_text.trim()) return null;

  const before_ctx = plaintext.slice(Math.max(0, startOffset - contextSize), startOffset);
  const after_ctx = plaintext.slice(endOffset, Math.min(plaintext.length, endOffset + contextSize));

  return { selected_text, before_ctx, after_ctx };
}

// Compute the absolute character offset of `node` (with `nodeOffset`) inside
// `root`'s textContent. Walks text nodes in document order. Returns null if
// `node` is not contained within `root`.
export function offsetWithin(root: Node, node: Node, nodeOffset: number): number | null {
  if (!root.contains(node)) return null;
  let count = 0;
  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) {
      return count + nodeOffset;
    }
    count += (current as Text).data.length;
    current = walker.nextNode();
  }
  // If the selection node is an element node (not a text node), nodeOffset
  // refers to a child index; we approximate by returning current count.
  if (node.nodeType !== Node.TEXT_NODE) return count;
  return null;
}

export function captureFromRange(root: HTMLElement, range: Range): CapturedSelection | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }
  const start = offsetWithin(root, range.startContainer, range.startOffset);
  const end = offsetWithin(root, range.endContainer, range.endOffset);
  if (start == null || end == null) return null;
  const text = root.textContent ?? '';
  return captureFromOffsets(text, Math.min(start, end), Math.max(start, end));
}
