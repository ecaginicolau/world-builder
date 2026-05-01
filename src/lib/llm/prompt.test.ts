import { describe, expect, it } from 'vitest';
import { buildMessages } from './prompt';

describe('buildMessages', () => {
  it('returns just the user message when no context', () => {
    const msgs = buildMessages({ history: [], userMessage: 'hello' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('prepends a system message with world memory and note context', () => {
    const msgs = buildMessages({
      worldMemory: 'A grimdark world.',
      noteContext: 'Note about the protagonist.',
      history: [],
      userMessage: 'who is the antagonist?',
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('A grimdark world.');
    expect(msgs[0].content).toContain('Note about the protagonist.');
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'who is the antagonist?' });
  });

  it('preserves chat history order', () => {
    const msgs = buildMessages({
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
      ],
      userMessage: 'second',
    });
    expect(msgs.map((m) => m.content)).toEqual(['first', 'reply', 'second']);
  });

  it('omits the system message when both context fields are empty', () => {
    const msgs = buildMessages({
      worldMemory: '   ',
      noteContext: '',
      history: [],
      userMessage: 'hi',
    });
    expect(msgs.find((m) => m.role === 'system')).toBeUndefined();
  });
});
