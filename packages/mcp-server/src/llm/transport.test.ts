import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  llmCall,
  llmCallWithRetry,
  providerTag,
} from "./transport.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cloud branch is exercised via a stub SupabaseClient with a mocked
// `functions.invoke`. Local branch uses global.fetch as in the app port.

const fakeSupabase: { functions: { invoke: ReturnType<typeof vi.fn> } } = {
  functions: { invoke: vi.fn() },
};

const sb = (): SupabaseClient => fakeSupabase as unknown as SupabaseClient;

describe("providerTag", () => {
  it("tags cloud as openai", () => {
    expect(providerTag({ kind: "cloud" })).toBe("openai");
  });
  it("tags local as local", () => {
    expect(
      providerTag({ kind: "local", endpoint: "http://localhost:11434/v1" }),
    ).toBe("local");
  });
});

describe("llmCall — local branch", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("POSTs OpenAI-shaped payload to /chat/completions and returns content", async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "qwen2.5:14b",
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const r = await llmCall(
      { messages: [{ role: "user", content: "hi" }], model: "qwen2.5:14b" },
      { kind: "local", endpoint: "http://localhost:11434/v1" },
      { supabase: sb() },
    );
    expect(r.content).toBe("hello");
    expect(r.model).toBe("qwen2.5:14b");
    expect(r.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("qwen2.5:14b");
    expect(body.messages).toHaveLength(1);
    expect(body.stream).toBe(false);
  });

  it("strips trailing slash from endpoint before appending path", async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "x" } }] }),
    });
    await llmCall(
      { messages: [{ role: "user", content: "hi" }], model: "m" },
      { kind: "local", endpoint: "http://localhost:11434/v1/" },
      { supabase: sb() },
    );
    expect(fetchSpy.mock.calls[0][0] as string).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
  });

  it("forwards response_format when set", async () => {
    const fetchSpy = global.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    });
    await llmCall(
      {
        messages: [{ role: "user", content: "hi" }],
        model: "m",
        response_format: { type: "json_object" },
      },
      { kind: "local", endpoint: "http://localhost:11434/v1" },
      { supabase: sb() },
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws retryable error when fetch rejects (network down)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ECONNREFUSED"),
    );
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("throws retryable error on 5xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    });
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("throws non-retryable error on 4xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "model not found",
    });
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("throws non-retryable payload error when content is missing or empty", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: false, payload: true });
  });
});

describe("llmCall — cloud branch", () => {
  beforeEach(() => {
    fakeSupabase.functions.invoke.mockReset();
  });

  it("invokes the llm-call edge function with the body and returns its response", async () => {
    fakeSupabase.functions.invoke.mockResolvedValue({
      data: {
        content: "from-cloud",
        model: "gpt-5.4-mini",
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      },
      error: null,
    });
    const r = await llmCall(
      { messages: [{ role: "user", content: "hi" }], model: "gpt-5.4-mini" },
      { kind: "cloud" },
      { supabase: sb() },
    );
    expect(r.content).toBe("from-cloud");
    expect(r.model).toBe("gpt-5.4-mini");
    expect(r.usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 });
    const [name, opts] = fakeSupabase.functions.invoke.mock.calls[0];
    expect(name).toBe("llm-call");
    expect(opts.body.model).toBe("gpt-5.4-mini");
  });

  it("treats edge-function error as retryable", async () => {
    fakeSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: "edge boom" },
    });
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "cloud" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("throws non-retryable payload error when cloud returns invalid data", async () => {
    fakeSupabase.functions.invoke.mockResolvedValue({
      data: { foo: "bar" },
      error: null,
    });
    await expect(
      llmCall(
        { messages: [], model: "m" },
        { kind: "cloud" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: false, payload: true });
  });
});

describe("llmCallWithRetry", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("retries once on a retryable error and returns success on the second attempt", async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const r = await llmCallWithRetry(
      { messages: [], model: "m" },
      { kind: "local", endpoint: "http://localhost:11434/v1" },
      { supabase: sb() },
    );
    expect(r.content).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not retry on a non-retryable error", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      llmCallWithRetry(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws after the second retryable failure", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      llmCallWithRetry(
        { messages: [], model: "m" },
        { kind: "local", endpoint: "http://localhost:11434/v1" },
        { supabase: sb() },
      ),
    ).rejects.toMatchObject({ retryable: true });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
