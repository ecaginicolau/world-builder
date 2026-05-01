import { describe, it, expect } from 'vitest';
import { buildSummarizeMessages, summarizeMock } from './summaries';

describe('buildSummarizeMessages', () => {
  it('targets short summary in system prompt for S', () => {
    const m = buildSummarizeMessages({ length: 'S', chapterText: 'hello' });
    expect(m[0].role).toBe('system');
    expect(m[0].content).toMatch(/short summary/);
    expect(m[0].content).toMatch(/2 sentences/);
  });

  it('targets long summary for L', () => {
    const m = buildSummarizeMessages({ length: 'L', chapterText: 'hello' });
    expect(m[0].content).toMatch(/long summary/);
    expect(m[0].content).toMatch(/3 to 5 paragraphs/);
  });

  it('passes through world memory and custom prompt', () => {
    const m = buildSummarizeMessages({
      length: 'M',
      chapterText: 'body',
      worldMemory: 'Dark fantasy.',
      worldCustomPrompt: 'In French, please.',
      chapterTitle: 'Ch1',
    });
    expect(m[0].content).toContain('Dark fantasy.');
    expect(m[0].content).toContain('In French, please.');
    expect(m[0].content).toContain('Ch1');
  });

  it('puts the chapter text in the user message', () => {
    const m = buildSummarizeMessages({ length: 'S', chapterText: 'the body of the chapter' });
    expect(m[1].role).toBe('user');
    expect(m[1].content).toContain('the body of the chapter');
  });

  it('handles empty chapter text', () => {
    const m = buildSummarizeMessages({ length: 'S', chapterText: '' });
    expect(m[1].content).toContain('(empty)');
  });
});

describe('summarizeMock', () => {
  it('returns different shapes per length', async () => {
    const s = await summarizeMock({ length: 'S', chapterText: 'hello world' });
    const l = await summarizeMock({ length: 'L', chapterText: 'hello world' });
    expect(s.text).toMatch(/^\[mock S\]/);
    expect(l.text).toMatch(/^\[mock L summary\]/);
    expect(s.provider).toBe('mock');
  });
});
