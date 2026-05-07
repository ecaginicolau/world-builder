import { describe, it, expect } from 'vitest';
import { captureFromOffsets, DEFAULT_CONTEXT } from './selectionContext';

const TEXT =
  'Once upon a time there was a young hero. The hero met a wise mentor at the edge of the forest.';

describe('captureFromOffsets', () => {
  it('captures selection with default 30-char context', () => {
    const start = TEXT.indexOf('wise mentor');
    const end = start + 'wise mentor'.length;
    const cap = captureFromOffsets(TEXT, start, end);
    expect(cap).not.toBeNull();
    expect(cap!.selected_text).toBe('wise mentor');
    expect(cap!.before_ctx.length).toBeLessThanOrEqual(DEFAULT_CONTEXT);
    expect(cap!.before_ctx.endsWith('met a ')).toBe(true);
    expect(cap!.after_ctx.startsWith(' at the edge')).toBe(true);
  });

  it('clamps before_ctx at start of document', () => {
    const cap = captureFromOffsets(TEXT, 0, 4);
    expect(cap!.selected_text).toBe('Once');
    expect(cap!.before_ctx).toBe('');
  });

  it('clamps after_ctx at end of document', () => {
    const cap = captureFromOffsets(TEXT, TEXT.length - 7, TEXT.length);
    expect(cap!.selected_text).toBe('forest.');
    expect(cap!.after_ctx).toBe('');
  });

  it('returns null for collapsed range', () => {
    const cap = captureFromOffsets(TEXT, 5, 5);
    expect(cap).toBeNull();
  });

  it('returns null for whitespace-only selection', () => {
    const cap = captureFromOffsets('aaa   bbb', 3, 6);
    expect(cap).toBeNull();
  });

  it('returns null for out-of-bounds offsets', () => {
    expect(captureFromOffsets(TEXT, -1, 5)).toBeNull();
    expect(captureFromOffsets(TEXT, 0, TEXT.length + 1)).toBeNull();
  });
});
