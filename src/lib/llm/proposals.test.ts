import { describe, expect, it } from 'vitest';
import { buildProposalsMessages, proposeUpdatesMock } from './proposals';

describe('buildProposalsMessages', () => {
  it('lists each entity with its FieldDef and current snapshot', () => {
    const messages = buildProposalsMessages({
      chapterTitle: 'C',
      chapterText: 'Iria became Captain.',
      entityCards: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Iria',
          type: 'Personnages',
          fields: [
            { name: 'age', kind: 'int' },
            { name: 'title', kind: 'string' },
          ],
          currentSnapshot: { age: '17' },
        },
      ],
    });
    expect(messages[0].content).toContain('age (int)');
    expect(messages[0].content).toContain('title (string)');
    expect(messages[0].content).toContain('age: 17');
    expect(messages[0].content).toContain('entityId=11111111-1111-1111-1111-111111111111');
    expect(messages[1].content).toContain('Iria became Captain.');
    expect(messages[1].content).toContain('# Chapter: C');
  });

  it('handles empty entity list', () => {
    const messages = buildProposalsMessages({
      chapterText: 'No one in particular.',
      entityCards: [],
    });
    expect(messages[0].content).toContain('(none — return empty proposals array)');
  });
});

describe('proposeUpdatesMock', () => {
  it('proposes int+1 for entities mentioned in the text with an int field', async () => {
    const r = await proposeUpdatesMock({
      chapterText: 'Iria has aged a year. Bob did nothing.',
      entityCards: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Iria',
          type: 'Personnages',
          fields: [
            { name: 'age', kind: 'int' },
            { name: 'bio', kind: 'text' },
          ],
          currentSnapshot: { age: '17' },
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Edran',
          type: 'Personnages',
          fields: [{ name: 'age', kind: 'int' }],
          currentSnapshot: {},
        },
      ],
    });
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].entityId).toBe('11111111-1111-1111-1111-111111111111');
    expect(r.proposals[0].fieldChanges.age).toBe(18);
  });

  it('returns empty proposals if no entity is mentioned', async () => {
    const r = await proposeUpdatesMock({
      chapterText: 'A quiet morning.',
      entityCards: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Zorglub',
          type: 'X',
          fields: [{ name: 'age', kind: 'int' }],
          currentSnapshot: {},
        },
      ],
    });
    expect(r.proposals).toEqual([]);
  });
});
