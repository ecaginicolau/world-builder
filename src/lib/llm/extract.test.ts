import { describe, expect, it } from 'vitest';
import {
  buildExtractMessages,
  entityCandidateSchema,
  extractEntitiesMock,
} from './extract';

describe('buildExtractMessages', () => {
  it('lists known types and existing entities in the system prompt', () => {
    const msgs = buildExtractMessages({
      noteText: 'Iria walked into the Old Fortress.',
      existing: [{ id: 'abc', name: 'Iria', type: 'Character', aliases: ['I.'] }],
      knownTypes: ['Character', 'Location'],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Character, Location');
    expect(msgs[0].content).toContain('Iria');
    expect(msgs[0].content).toContain('aliases: I.');
    expect(msgs[1]).toEqual({
      role: 'user',
      content: 'Iria walked into the Old Fortress.',
    });
  });

  it('handles empty existing + knownTypes lists gracefully', () => {
    const msgs = buildExtractMessages({
      noteText: 'foo',
      existing: [],
      knownTypes: [],
    });
    expect(msgs[0].content).toContain('(none yet)');
    expect(msgs[0].content).toContain('(none)');
  });
});

describe('entityCandidateSchema', () => {
  it('accepts a minimal candidate', () => {
    expect(entityCandidateSchema.safeParse({ name: 'X', type: 'Character' }).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(entityCandidateSchema.safeParse({ name: '', type: 'Character' }).success).toBe(false);
  });

  it('accepts a matched candidate with uuid', () => {
    const r = entityCandidateSchema.safeParse({
      name: 'Iria',
      type: 'Character',
      matchedEntityId: '00000000-0000-4000-8000-000000000000',
    });
    expect(r.success).toBe(true);
  });

  it('accepts matchedEntityId: null (LLM emits explicit null in json_object mode)', () => {
    const r = entityCandidateSchema.safeParse({
      name: 'Iria',
      type: 'Character',
      matchedEntityId: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('extractEntitiesMock', () => {
  it('detects capitalized names from the note', async () => {
    const out = await extractEntitiesMock({
      noteText: 'Iria walked into the Old Fortress and met Sorn.',
      existing: [],
      knownTypes: ['Character', 'Location'],
    });
    const names = out.candidates.map((c) => c.name);
    expect(names).toContain('Iria');
    expect(names).toContain('Sorn');
  });

  it('matches existing entities by name', async () => {
    const out = await extractEntitiesMock({
      noteText: 'Iria walked.',
      existing: [{ id: 'id-iria', name: 'Iria', type: 'Character' }],
      knownTypes: ['Character'],
    });
    const iria = out.candidates.find((c) => c.name === 'Iria');
    expect(iria?.matchedEntityId).toBe('id-iria');
  });

  it('matches by alias too', async () => {
    const out = await extractEntitiesMock({
      noteText: 'Voss whispered.',
      existing: [{ id: 'id-edran', name: 'Edran', type: 'Character', aliases: ['Voss'] }],
      knownTypes: ['Character'],
    });
    const v = out.candidates.find((c) => c.name === 'Voss');
    expect(v?.matchedEntityId).toBe('id-edran');
  });
});
