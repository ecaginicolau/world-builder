import { describe, expect, it } from 'vitest';
import { modelForTier, reasoningEffortToWire } from './openai';

describe('modelForTier', () => {
  it('maps each tier to a distinct model', () => {
    expect(modelForTier('cheapest')).toBe('gpt-5.4-nano');
    expect(modelForTier('medium')).toBe('gpt-5.4-mini');
    expect(modelForTier('best')).toBe('gpt-5.4');
  });

  it('defaults to medium when tier is undefined', () => {
    expect(modelForTier(undefined)).toBe('gpt-5.4-mini');
  });
});

describe('reasoningEffortToWire', () => {
  it('returns undefined for none/undefined', () => {
    expect(reasoningEffortToWire(undefined)).toBeUndefined();
    expect(reasoningEffortToWire('none')).toBeUndefined();
  });

  it('passes through low/medium/high/xhigh', () => {
    expect(reasoningEffortToWire('low')).toBe('low');
    expect(reasoningEffortToWire('medium')).toBe('medium');
    expect(reasoningEffortToWire('high')).toBe('high');
    expect(reasoningEffortToWire('xhigh')).toBe('xhigh');
  });
});
