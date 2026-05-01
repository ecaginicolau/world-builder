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
      noteTitle: 'Antagonists',
      noteContext: 'Note about the protagonist.',
      history: [],
      userMessage: 'who is the antagonist?',
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('A grimdark world.');
    expect(msgs[0].content).toContain('Antagonists');
    expect(msgs[0].content).toContain('Note about the protagonist.');
    expect(msgs.at(-1)).toEqual({ role: 'user', content: 'who is the antagonist?' });
  });

  it('marks the title as (untitled) when missing but body is present', () => {
    const msgs = buildMessages({
      noteContext: 'Some body text.',
      history: [],
      userMessage: 'hi',
    });
    expect(msgs[0].content).toContain('Title: (untitled)');
    expect(msgs[0].content).toContain('Some body text.');
  });

  it('marks the body as (empty) when title only', () => {
    const msgs = buildMessages({
      noteTitle: 'Just a title',
      history: [],
      userMessage: 'hi',
    });
    expect(msgs[0].content).toContain('Title: Just a title');
    expect(msgs[0].content).toContain('(empty)');
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

  it('lists tagged entities under a Linked entities section', () => {
    const msgs = buildMessages({
      noteTitle: 'Scene draft',
      taggedEntities: [
        { name: 'Iria', type: 'Character' },
        { name: 'Old fortress', type: 'Location' },
      ],
      history: [],
      userMessage: 'next?',
    });
    expect(msgs[0].content).toContain('# Linked entities');
    expect(msgs[0].content).toContain('- Iria (Character)');
    expect(msgs[0].content).toContain('- Old fortress (Location)');
  });

  it('omits Linked entities section when no tags', () => {
    const msgs = buildMessages({
      noteTitle: 'Scene draft',
      taggedEntities: [],
      history: [],
      userMessage: 'next?',
    });
    expect(msgs[0].content).not.toContain('Linked entities');
  });

  it('appends worldCustomPrompt under "Author preferences"', () => {
    const msgs = buildMessages({
      worldMemory: 'Grim world.',
      worldCustomPrompt: 'Always answer in French. Be terse.',
      history: [],
      userMessage: 'hi',
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('# Author preferences');
    expect(msgs[0].content).toContain('Always answer in French. Be terse.');
  });

  it('emits a system message even with only worldCustomPrompt and no other context', () => {
    const msgs = buildMessages({
      worldCustomPrompt: 'Be terse.',
      history: [],
      userMessage: 'hi',
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Be terse.');
  });
});
