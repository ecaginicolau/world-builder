import { describe, expect, it } from 'vitest';
import { buildUpscaleMessages, upscaleChapterMock } from './upscale';

describe('buildUpscaleMessages', () => {
  it('includes world memory + custom prompt + entity cards + current text + user request', () => {
    const messages = buildUpscaleMessages({
      worldMemory: 'Low magic dark fantasy.',
      worldCustomPrompt: 'Toujours en français.',
      chapterTitle: 'Confrontation',
      currentText: 'Iria entra dans la salle.',
      userPrompt: 'Ajoute des descriptions du décor.',
      entityCards: [
        {
          id: 'a',
          name: 'Iria',
          type: 'Personnages',
          snapshot: { age: '17', bio: 'Fille de pêcheur' },
        },
      ],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Low magic dark fantasy.');
    expect(messages[0].content).toContain('Toujours en français.');
    expect(messages[0].content).toContain('Iria (Personnages)');
    expect(messages[0].content).toContain('age: 17');
    expect(messages[0].content).toContain('Confrontation');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain('Iria entra dans la salle.');
    expect(messages[1].content).toContain('Ajoute des descriptions du décor.');
  });

  it('omits empty entity snapshot fields', () => {
    const messages = buildUpscaleMessages({
      currentText: 'x',
      userPrompt: 'y',
      entityCards: [
        { id: 'a', name: 'X', type: 'T', snapshot: { age: '', bio: 'hi' } },
      ],
    });
    expect(messages[0].content).not.toMatch(/age:/);
    expect(messages[0].content).toContain('bio: hi');
  });

  it('handles empty current text gracefully', () => {
    const messages = buildUpscaleMessages({
      currentText: '',
      userPrompt: 'Write something.',
      entityCards: [],
    });
    expect(messages[1].content).toContain('(empty)');
  });
});

describe('upscaleChapterMock', () => {
  it('returns a string text and reflects the user prompt', async () => {
    const r = await upscaleChapterMock({
      currentText: 'Some draft.',
      userPrompt: 'add decor descriptions',
      entityCards: [],
    });
    expect(typeof r.text).toBe('string');
    expect(r.text).toContain('add decor descriptions');
    expect(r.text).toContain('Some draft.');
    expect(r.provider).toBe('mock');
  });
});
