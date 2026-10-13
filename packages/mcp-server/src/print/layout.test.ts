import { describe, it, expect } from 'vitest';
import { editLayout, layoutBlocks, illustrationUses } from './layout.js';
import { editionPatch, editionSettings, validateEdition } from './editions.js';

describe('layout-only editing', () => {
  const image = '48c70460-b08d-4454-8213-576e56f1f782';
  const entity = '2ea70460-b08d-4454-8213-576e56f1f783';
  const prose =
    '<p class="keep">Élise &amp; <em>les ombres</em>.</p>\n<blockquote><p>Ne rien réécrire.</p></blockquote><p>Fin.</p>';
  it('inserts at an original top-level boundary preserving all prose bytes', () => {
    const result = editLayout(
      prose,
      [],
      [{ before_block: 1, kind: 'full_page', illustration_id: image, entity_id: entity }],
    );
    expect(result.replace(/<div data-page-break="true"[^>]*><\/div>/, '')).toBe(prose);
    expect(illustrationUses(result)).toEqual([
      { illustration_id: image, kind: 'full_page', block_index: 1 },
    ]);
  });
  it('moves a plate atomically relative to original anchors', () => {
    const first = editLayout(
      prose,
      [],
      [{ before_block: 1, kind: 'full_page', illustration_id: image, entity_id: entity }],
    );
    const moved = editLayout(
      first,
      [1],
      [{ before_block: 4, kind: 'inline', illustration_id: image, entity_id: entity }],
    );
    expect(moved).toBe(
      prose + `<figure data-illustration-id="${image}" data-entity-id="${entity}"></figure>`,
    );
  });
  it('refuses to delete prose or insert at nonexistent anchors', () => {
    expect(() => editLayout(prose, [1], [])).toThrow('not a removable');
    expect(() => editLayout(prose, [], [{ before_block: 4, kind: 'page_break' }])).toThrow(
      'Invalid',
    );
  });
  it('retains the order of several insertions at one anchor', () => {
    const result = editLayout(
      prose,
      [],
      [
        { before_block: 0, kind: 'page_break' },
        { before_block: 0, kind: 'inline', illustration_id: image, entity_id: entity },
      ],
    );
    expect(
      layoutBlocks(result)
        .map((b) => b.kind)
        .slice(0, 3),
    ).toEqual(['page_break', 'inline', 'text']);
  });
  it('finds every occurrence, including nested nodes and repeated images', () => {
    const plate = `<figure data-illustration-id='${image}'><img></figure>`;
    expect(illustrationUses(`<blockquote>${plate}</blockquote>${plate}`)).toHaveLength(2);
  });
});

describe('edition settings', () => {
  it('partial updates do not reset unrelated settings to defaults', () => {
    expect(editionPatch.parse({ image_grayscale: true })).toEqual({ image_grayscale: true });
    expect(editionPatch.parse({})).toEqual({});
  });
  it('prevents identifier mutation and impossible margins', () => {
    expect(() => editionPatch.parse({ owner_id: 'someone' })).toThrow();
    expect(() =>
      validateEdition({ trim_width_mm: 127, margin_inside_mm: 65, margin_outside_mm: 65 }),
    ).toThrow('printable area');
    expect(editionSettings.parse({}).trim_width_mm).toBe(152.4);
  });
});
