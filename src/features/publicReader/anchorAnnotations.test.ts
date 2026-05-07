import { describe, it, expect } from 'vitest';
import { findAnchor, anchorAll } from './anchorAnnotations';

const PLAIN =
  'Once upon a time there was a young hero. The hero met a wise mentor at the edge of the forest. They spoke for hours.';

describe('findAnchor', () => {
  it('matches via context windows', () => {
    const r = findAnchor(PLAIN, {
      selected_text: 'wise mentor',
      before_ctx: 'hero met a ',
      after_ctx: ' at the edge',
    });
    expect(r).not.toBeNull();
    expect(r!.fuzzy).toBe(false);
    expect(PLAIN.slice(r!.start, r!.end)).toBe('wise mentor');
  });

  it('falls back to first occurrence when context is broken', () => {
    const r = findAnchor(PLAIN, {
      selected_text: 'hero',
      before_ctx: 'XYZ_NOT_THERE',
      after_ctx: ' was a',
    });
    expect(r).not.toBeNull();
    expect(r!.fuzzy).toBe(true);
    expect(PLAIN.slice(r!.start, r!.end)).toBe('hero');
  });

  it('returns null when selected_text is missing entirely', () => {
    const r = findAnchor(PLAIN, {
      selected_text: 'dragon',
      before_ctx: '',
      after_ctx: '',
    });
    expect(r).toBeNull();
  });

  it('returns null for empty selection', () => {
    const r = findAnchor(PLAIN, { selected_text: '', before_ctx: '', after_ctx: '' });
    expect(r).toBeNull();
  });

  it('disambiguates between two occurrences via context', () => {
    const text = 'hero. The hero spoke. Hero!';
    const r = findAnchor(text, {
      selected_text: 'hero',
      before_ctx: 'The ',
      after_ctx: ' spoke',
    });
    expect(r).not.toBeNull();
    expect(r!.fuzzy).toBe(false);
    expect(r!.start).toBe(text.indexOf('The hero spoke') + 4);
  });
});

describe('anchorAll', () => {
  it('reports orphans (range null) without dropping them', () => {
    const result = anchorAll(PLAIN, [
      { selected_text: 'hero', before_ctx: 'young ', after_ctx: '.' },
      { selected_text: 'dragon', before_ctx: '', after_ctx: '' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].range).not.toBeNull();
    expect(result[1].range).toBeNull();
  });
});
