import { createHash } from 'node:crypto';
import { parseFragment, type DefaultTreeAdapterTypes as T } from 'parse5';

const attr = (e: T.Element, key: string) => e.attrs.find((a) => a.name === key)?.value;
const element = (n: T.Node): n is T.Element => 'tagName' in n;
const isLayout = (e: T.Element) =>
  (e.tagName === 'div' && attr(e, 'data-page-break') !== undefined) ||
  (e.tagName === 'figure' && attr(e, 'data-illustration-id') !== undefined);
function textOf(n: T.Node): string {
  return 'value' in n ? n.value : 'childNodes' in n ? n.childNodes.map(textOf).join('') : '';
}
export const textHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function layoutBlocks(html: string) {
  return parseFragment(html, { sourceCodeLocationInfo: true })
    .childNodes.filter(element)
    .map((e, index) => ({
      index,
      tag: e.tagName,
      text: textOf(e),
      layout: isLayout(e),
      kind:
        e.tagName === 'figure'
          ? 'inline'
          : attr(e, 'data-page-break') !== undefined
            ? 'page_break'
            : 'text',
      illustration_id: attr(e, 'data-illustration-id') ?? null,
      start: e.sourceCodeLocation?.startOffset,
      end: e.sourceCodeLocation?.endOffset,
    }));
}
export function illustrationUses(html: string) {
  const uses: { illustration_id: string; kind: string; block_index: number }[] = [];
  function visit(n: T.Node, index: number) {
    if (!element(n)) return;
    const id = attr(n, 'data-illustration-id');
    if (id && isLayout(n))
      uses.push({
        illustration_id: id,
        kind: n.tagName === 'figure' ? 'inline' : 'full_page',
        block_index: index,
      });
    else n.childNodes.forEach((c) => visit(c, index));
  }
  parseFragment(html).childNodes.filter(element).forEach(visit);
  return uses;
}
export interface Placement {
  before_block: number;
  kind: 'inline' | 'full_page' | 'page_break';
  illustration_id?: string;
  entity_id?: string;
}
export function editLayout(html: string, remove: number[], insert: Placement[]) {
  const blocks = layoutBlocks(html);
  const removals = new Set(remove);
  for (const index of removals) {
    if (!blocks[index]?.layout) throw new Error(`Block ${index} is not a removable layout block`);
  }
  const edits: { start: number; end: number; value: string; order: number }[] = [];
  for (const index of removals) {
    const b = blocks[index];
    if (b.start === undefined || b.end === undefined) throw new Error('Cannot locate block');
    edits.push({ start: b.start, end: b.end, value: '', order: -1 });
  }
  insert.forEach((p, order) => {
    if (p.kind === 'page_break' && p.illustration_id)
      throw new Error('page_break must not carry an illustration; use full_page');
    if (!Number.isInteger(p.before_block) || p.before_block < 0 || p.before_block > blocks.length)
      throw new Error('Invalid before_block');
    if (p.kind !== 'page_break' && (!p.illustration_id || !p.entity_id))
      throw new Error('Illustration and entity required');
    const start = p.before_block === blocks.length ? html.length : blocks[p.before_block].start;
    if (start === undefined) throw new Error('Cannot locate anchor');
    const attrs =
      p.kind === 'page_break'
        ? ''
        : ` data-illustration-id="${p.illustration_id}" data-entity-id="${p.entity_id}"`;
    const value =
      p.kind === 'inline'
        ? `<figure${attrs}></figure>`
        : `<div data-page-break="true"${attrs}></div>`;
    edits.push({ start, end: start, value, order });
  });
  // All anchors refer to the original document, and prose bytes are never serialized.
  edits.sort((a, b) => b.start - a.start || b.end - a.end || b.order - a.order);
  let result = html;
  for (const e of edits) result = result.slice(0, e.start) + e.value + result.slice(e.end);
  return result;
}
