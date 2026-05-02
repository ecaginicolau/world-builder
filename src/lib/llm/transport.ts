import { supabase } from '@/lib/supabase';
import type { ChatMessage, ReasoningEffort } from './types';

/**
 * Body shape passed to the underlying LLM transport. Both the cloud edge
 * function (`llm-call`) and the local OpenAI-compatible endpoint understand
 * `messages` + `model` + optional `response_format`. `reasoning_effort` is
 * an OpenAI-only knob and is dropped when calling a local endpoint.
 */
export interface LlmCallBody {
  messages: ChatMessage[];
  model: string;
  response_format?: { type: 'json_object' };
  reasoning_effort?: Exclude<ReasoningEffort, 'none'>;
}

export interface LlmCallResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** How an LLM call is dispatched. */
export type TransportMode =
  | { kind: 'cloud' }
  | { kind: 'local'; endpoint: string };

export interface LlmCallError extends Error {
  /** True when the failure looks transient (network/HTTP 5xx) and a retry might help. */
  retryable: boolean;
  /** Set when the transport returned content but it wasn't usable (empty/invalid). */
  payload?: boolean;
}

function makeError(message: string, opts: { retryable: boolean; payload?: boolean }): LlmCallError {
  const e = new Error(message) as LlmCallError;
  e.retryable = opts.retryable;
  if (opts.payload) e.payload = true;
  return e;
}

/**
 * Single point of dispatch for LLM HTTP calls. Cloud route goes through the
 * `llm-call` Supabase edge function (which holds the OpenAI key). Local route
 * hits an OpenAI-compatible endpoint directly from the browser (Ollama,
 * LM Studio, llama.cpp --api, etc.) — no secret to protect since the endpoint
 * lives on the user's own machine.
 */
export async function llmCall(
  body: LlmCallBody,
  mode: TransportMode,
  opts: { signal?: AbortSignal } = {},
): Promise<LlmCallResponse> {
  if (mode.kind === 'cloud') {
    const invokeOpts: Record<string, unknown> = { body };
    if (opts.signal) invokeOpts.signal = opts.signal;
    const { data, error } = await supabase.functions.invoke('llm-call', invokeOpts);
    if (error) throw makeError(error.message ?? 'llm-call failed', { retryable: true });
    if (!data || typeof data.content !== 'string') {
      throw makeError('llm-call returned an invalid payload', { retryable: false, payload: true });
    }
    return {
      content: data.content,
      model: data.model ?? body.model,
      usage: data.usage
        ? { prompt_tokens: data.usage.prompt_tokens, completion_tokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  // local OpenAI-compatible endpoint
  const url = `${mode.endpoint.replace(/\/$/, '')}/chat/completions`;
  const requestBody: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    stream: false,
  };
  if (body.response_format) requestBody.response_format = body.response_format;
  // reasoning_effort is OpenAI-only; local runtimes ignore or reject it. Drop it.

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw makeError(`local endpoint unreachable: ${msg}`, { retryable: true });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    throw makeError(
      `local endpoint returned ${res.status}: ${text.slice(0, 200)}`,
      { retryable },
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw makeError('local endpoint returned non-JSON', { retryable: false, payload: true });
  }
  const obj = data as {
    choices?: Array<{ message?: { content?: unknown } }>;
    model?: unknown;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw makeError('local endpoint returned empty content', { retryable: false, payload: true });
  }
  return {
    content,
    model: typeof obj.model === 'string' ? obj.model : body.model,
    usage: obj.usage
      ? { prompt_tokens: obj.usage.prompt_tokens, completion_tokens: obj.usage.completion_tokens }
      : undefined,
  };
}

/**
 * Wraps `llmCall` with one retry on retryable errors. Higher-level retry
 * (e.g. JSON-schema validation retry) is handled at the task layer where the
 * shape of the expected response is known.
 */
export async function llmCallWithRetry(
  body: LlmCallBody,
  mode: TransportMode,
  opts: { signal?: AbortSignal } = {},
): Promise<LlmCallResponse> {
  try {
    return await llmCall(body, mode, opts);
  } catch (e) {
    const err = e as LlmCallError;
    if (err && err.retryable) {
      return await llmCall(body, mode, opts);
    }
    throw e;
  }
}

/** Tag for `runs.provider`. Cloud = 'openai' (or whatever the edge fn proxies); local = 'local'. */
export function providerTag(mode: TransportMode): string {
  return mode.kind === 'local' ? 'local' : 'openai';
}
