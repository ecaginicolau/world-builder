import { describe, it, expect } from 'vitest';
import { countWords, formatWordCount } from './wordCount';

describe('countWords', () => {
  it('returns 0 for empty/null/undefined', () => {
    expect(countWords('')).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('counts plain text words', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('  one   two  three  ')).toBe(3);
  });

  it('strips simple HTML before counting', () => {
    expect(countWords('<p>hello <strong>world</strong></p>')).toBe(2);
    expect(countWords('<p>one</p><p>two three</p>')).toBe(3);
  });

  it('counts hyphenated tokens as single words', () => {
    expect(countWords('state-of-the-art design')).toBe(2);
  });
});

describe('formatWordCount', () => {
  it('singular for 1', () => {
    expect(formatWordCount(1)).toBe('1 word');
  });
  it('plural with thousands separator', () => {
    expect(formatWordCount(0)).toBe('0 words');
    expect(formatWordCount(1234)).toBe('1,234 words');
  });
});
