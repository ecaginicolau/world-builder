import { describe, it, expect } from 'vitest';
import { htmlToPlaintext, renderAnnotated } from './renderAnnotatedHtml';

describe('htmlToPlaintext', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToPlaintext('<p>Hello <strong>world</strong>!</p>')).toBe('Hello world!');
    expect(htmlToPlaintext('<p>5 &lt; 10 &amp; ok</p>')).toBe('5 < 10 & ok');
  });
});

describe('renderAnnotated', () => {
  it('wraps a single match with a mark tag carrying the kind', () => {
    const html = '<p>The hero met a wise mentor.</p>';
    const result = renderAnnotated(html, [
      {
        id: 'a1',
        kind: 'comment',
        selected_text: 'wise mentor',
        before_ctx: 'met a ',
        after_ctx: '.',
      },
    ]);
    expect(result.orphans).toEqual([]);
    expect(result.html).toContain('data-annotation-id="a1"');
    expect(result.html).toContain('data-kind="comment"');
    expect(result.html).toContain('>wise mentor</mark>');
    // Surrounding text preserved.
    expect(result.html).toContain('The hero met a ');
    expect(result.html).toContain('.</p>');
  });

  it('returns orphans for missing selections', () => {
    const html = '<p>nothing to see</p>';
    const result = renderAnnotated(html, [
      { id: 'orphan', kind: 'up', selected_text: 'dragon', before_ctx: '', after_ctx: '' },
    ]);
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].id).toBe('orphan');
    expect(result.html).toBe(html);
  });

  it('handles multiple non-overlapping annotations', () => {
    const html = '<p>The hero spoke. The mentor smiled.</p>';
    const result = renderAnnotated(html, [
      { id: 'a', kind: 'up', selected_text: 'hero', before_ctx: 'The ', after_ctx: ' spoke' },
      { id: 'b', kind: 'down', selected_text: 'mentor', before_ctx: 'The ', after_ctx: ' smiled' },
    ]);
    expect(result.orphans).toEqual([]);
    expect(result.html).toContain('data-annotation-id="a"');
    expect(result.html).toContain('data-annotation-id="b"');
  });

  it('splits a mark across an inline tag boundary', () => {
    const html = '<p>The <em>wise</em> mentor stood.</p>';
    const result = renderAnnotated(html, [
      {
        id: 'span',
        kind: 'comment',
        selected_text: 'wise mentor',
        before_ctx: 'The ',
        after_ctx: ' stood',
      },
    ]);
    expect(result.orphans).toEqual([]);
    // The mark is split across the <em> tags but both halves carry the same id.
    const matches = result.html.match(/data-annotation-id="span"/g);
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
