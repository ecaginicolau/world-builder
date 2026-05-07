// Re-locate text selections inside a (potentially edited) chapter plaintext.
//
// Strategy: try to find `before_ctx + selected_text + after_ctx` as a single
// needle (most discriminating). If missing, fall back to the first occurrence
// of `selected_text` alone. If still missing, the annotation is "orphaned" —
// we keep it in the sidebar but skip the inline highlight.

export interface AnchorInput {
  selected_text: string;
  before_ctx: string;
  after_ctx: string;
}

export interface AnchorRange {
  start: number;
  end: number;
  fuzzy: boolean;
}

export function findAnchor(plaintext: string, ann: AnchorInput): AnchorRange | null {
  if (!ann.selected_text) return null;

  // 1. Exact context-bracketed match.
  if (ann.before_ctx || ann.after_ctx) {
    const needle = ann.before_ctx + ann.selected_text + ann.after_ctx;
    const idx = plaintext.indexOf(needle);
    if (idx >= 0) {
      const start = idx + ann.before_ctx.length;
      const end = start + ann.selected_text.length;
      return { start, end, fuzzy: false };
    }
  }

  // 2. Fallback: first occurrence of selected_text.
  const idx = plaintext.indexOf(ann.selected_text);
  if (idx >= 0) {
    return {
      start: idx,
      end: idx + ann.selected_text.length,
      fuzzy: true,
    };
  }

  return null;
}

export interface AnchoredAnnotation<T extends AnchorInput> {
  annotation: T;
  range: AnchorRange | null;
}

export function anchorAll<T extends AnchorInput>(
  plaintext: string,
  annotations: T[],
): AnchoredAnnotation<T>[] {
  return annotations.map((a) => ({ annotation: a, range: findAnchor(plaintext, a) }));
}
