import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { llmCall, llmCallWithRetry, providerTag } from './transport';

// We don't test the cloud branch here — `supabase.functions.invoke` is heavily
// mocked in other tests via the supabase client. Cloud parity with local is
// covered indirectly through the existing extract.test / upscale.test specs
// that run the mock providers. Here we focus on the local branch.

describe('providerTag', () => {
  it('tags cloud transport as openai', () => {
    expect(providerTag({ kind: 'cloud' })).toBe('openai');
  });

  it('tags local transport as local', () => {
    expect(providerTag({ kind: 'local', endpoint: 'http://localhost:11434/v1' })).toBe(
      'local',
    );
  });
});

describe('llmCall — local branch', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('POSTs OpenAI-shaped payload to /chat/completions and returns content', async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'qwen2.5:14b',
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const r = await llmCall(
      { messages: [{ role: 'user', content: 'hi' }], model: 'qwen2.5:14b' },
      { kind: 'local', endpoint: 'http://localhost:11434/v1' },
    );
    expect(r.content).toBe('hello');
    expect(r.model).toBe('qwen2.5:14b');
    expect(r.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('qwen2.5:14b');
    expect(body.messages).toHaveLength(1);
    expect(body.stream).toBe(false);
  });

  it('strips trailing slash from endpoint before appending path', async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await llmCall(
      { messages: [{ role: 'user', content: 'hi' }], model: 'm' },
      { kind: 'local', endpoint: 'http://localhost:11434/v1/' },
    );
    expect((fetchSpy.mock.calls[0][0] as string)).toBe(
      'http://localhost:11434/v1/chat/completions',
    );
  });

  it('forwards response_format when set', async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    await llmCall(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        response_format: { type: 'json_object' },
      },
      { kind: 'local', endpoint: 'http://localhost:11434/v1' },
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('drops reasoning_effort (OpenAI-only knob) when calling local', async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await llmCall(
      {
        messages: [{ role: 'user', content: 'hi' }],
        model: 'm',
        reasoning_effort: 'high',
      },
      { kind: 'local', endpoint: 'http://localhost:11434/v1' },
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('throws retryable error when fetch rejects (network down)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      llmCall(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('throws retryable error on 5xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    await expect(
      llmCall(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('throws non-retryable error on 4xx (client error like wrong model)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    });
    await expect(
      llmCall(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('throws non-retryable payload error when content is missing or empty', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] }),
    });
    await expect(
      llmCall(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: false, payload: true });
  });
});

describe('llmCallWithRetry', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('retries once on a retryable error and returns success on the second attempt', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const r = await llmCallWithRetry(
      { messages: [], model: 'm' },
      { kind: 'local', endpoint: 'http://localhost:11434/v1' },
    );
    expect(r.content).toBe('ok');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-retryable error', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      llmCallWithRetry(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws after the second retryable failure', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      llmCallWithRetry(
        { messages: [], model: 'm' },
        { kind: 'local', endpoint: 'http://localhost:11434/v1' },
      ),
    ).rejects.toMatchObject({ retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
