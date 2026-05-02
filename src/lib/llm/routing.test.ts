import { describe, expect, it } from 'vitest';
import { pickTransport, type RoutingSettings } from './routing';

const off: RoutingSettings = {
  localLlmEnabled: false,
  localLlmEndpoint: 'http://localhost:11434/v1',
  extractLocalModel: 'qwen2.5:14b',
  proposalsLocalModel: 'qwen2.5:14b',
  upscaleLocalModel: 'qwen2.5:32b',
  summariesLocalModel: 'qwen2.5:7b',
};

const on: RoutingSettings = { ...off, localLlmEnabled: true };

describe('pickTransport', () => {
  it('falls back to cloud when settings is undefined', () => {
    const t = pickTransport(undefined, 'extract', 'cheapest');
    expect(t.mode.kind).toBe('cloud');
    expect(t.provider).toBe('openai');
    expect(t.source).toBe('cloud');
  });

  it('falls back to cloud when local toggle is off', () => {
    const t = pickTransport(off, 'extract', 'cheapest');
    expect(t.mode.kind).toBe('cloud');
    expect(t.source).toBe('cloud');
  });

  it('routes to local when toggle is on AND endpoint AND per-task model are set', () => {
    const t = pickTransport(on, 'extract', 'cheapest');
    expect(t.mode).toEqual({ kind: 'local', endpoint: 'http://localhost:11434/v1' });
    expect(t.model).toBe('qwen2.5:14b');
    expect(t.provider).toBe('local');
    expect(t.source).toBe('local');
  });

  it('falls back to cloud when per-task model is missing even if toggle is on', () => {
    const partial: RoutingSettings = { ...on, upscaleLocalModel: null };
    const t = pickTransport(partial, 'upscale', 'best');
    expect(t.mode.kind).toBe('cloud');
    expect(t.source).toBe('cloud');
  });

  it('falls back to cloud when per-task model is whitespace-only', () => {
    const ws: RoutingSettings = { ...on, summariesLocalModel: '   ' };
    const t = pickTransport(ws, 'summaries', 'cheapest');
    expect(t.mode.kind).toBe('cloud');
  });

  it('falls back to cloud when endpoint is missing', () => {
    const noEndpoint: RoutingSettings = { ...on, localLlmEndpoint: null };
    const t = pickTransport(noEndpoint, 'proposals', 'medium');
    expect(t.mode.kind).toBe('cloud');
  });

  it('forceCloud overrides local routing', () => {
    const t = pickTransport(on, 'extract', 'cheapest', { forceCloud: true });
    expect(t.mode.kind).toBe('cloud');
    expect(t.source).toBe('cloud');
  });

  it('uses tier mapping when falling back to cloud', () => {
    const cheapest = pickTransport(off, 'extract', 'cheapest');
    expect(cheapest.model).toBe('gpt-5.4-nano');
    const best = pickTransport(off, 'upscale', 'best');
    expect(best.model).toBe('gpt-5.4');
  });

  it('routes each task to its own per-task model', () => {
    expect(pickTransport(on, 'extract', 'cheapest').model).toBe('qwen2.5:14b');
    expect(pickTransport(on, 'proposals', 'medium').model).toBe('qwen2.5:14b');
    expect(pickTransport(on, 'upscale', 'best').model).toBe('qwen2.5:32b');
    expect(pickTransport(on, 'summaries', 'cheapest').model).toBe('qwen2.5:7b');
  });

  it('trims surrounding whitespace from the per-task model name', () => {
    const padded: RoutingSettings = { ...on, extractLocalModel: '  qwen2.5:14b  ' };
    const t = pickTransport(padded, 'extract', 'cheapest');
    expect(t.model).toBe('qwen2.5:14b');
  });
});
