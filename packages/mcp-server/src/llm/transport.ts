// Node-side port of src/lib/llm/transport.ts. Cloud route invokes the
// `llm-call` Supabase edge function via the SupabaseClient (passed in, not
// module-imported, so tests can swap it). Local route fetches an
// OpenAI-compatible endpoint directly.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatRole = "user" | "assistant" | "system";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmCallBody {
  messages: ChatMessage[];
  model: string;
  response_format?: { type: "json_object" };
}

export interface LlmCallResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type TransportMode =
  | { kind: "cloud" }
  | { kind: "local"; endpoint: string };

export interface LlmCallError extends Error {
  retryable: boolean;
  payload?: boolean;
}

function makeError(
  message: string,
  opts: { retryable: boolean; payload?: boolean },
): LlmCallError {
  const e = new Error(message) as LlmCallError;
  e.retryable = opts.retryable;
  if (opts.payload) e.payload = true;
  return e;
}

export async function llmCall(
  body: LlmCallBody,
  mode: TransportMode,
  ctx: { supabase: SupabaseClient },
): Promise<LlmCallResponse> {
  if (mode.kind === "cloud") {
    const { data, error } = await ctx.supabase.functions.invoke("llm-call", {
      body,
    });
    if (error)
      throw makeError(error.message ?? "llm-call failed", { retryable: true });
    if (!data || typeof (data as { content?: unknown }).content !== "string") {
      throw makeError("llm-call returned an invalid payload", {
        retryable: false,
        payload: true,
      });
    }
    const d = data as {
      content: string;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      content: d.content,
      model: d.model ?? body.model,
      usage: d.usage
        ? {
            prompt_tokens: d.usage.prompt_tokens,
            completion_tokens: d.usage.completion_tokens,
          }
        : undefined,
    };
  }

  const url = `${mode.endpoint.replace(/\/$/, "")}/chat/completions`;
  const requestBody: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    stream: false,
  };
  if (body.response_format) requestBody.response_format = body.response_format;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw makeError(`local endpoint unreachable: ${msg}`, { retryable: true });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
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
    throw makeError("local endpoint returned non-JSON", {
      retryable: false,
      payload: true,
    });
  }
  const obj = data as {
    choices?: Array<{ message?: { content?: unknown } }>;
    model?: unknown;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw makeError("local endpoint returned empty content", {
      retryable: false,
      payload: true,
    });
  }
  return {
    content,
    model: typeof obj.model === "string" ? obj.model : body.model,
    usage: obj.usage
      ? {
          prompt_tokens: obj.usage.prompt_tokens,
          completion_tokens: obj.usage.completion_tokens,
        }
      : undefined,
  };
}

export async function llmCallWithRetry(
  body: LlmCallBody,
  mode: TransportMode,
  ctx: { supabase: SupabaseClient },
): Promise<LlmCallResponse> {
  try {
    return await llmCall(body, mode, ctx);
  } catch (e) {
    const err = e as LlmCallError;
    if (err && err.retryable) {
      return await llmCall(body, mode, ctx);
    }
    throw e;
  }
}

export function providerTag(mode: TransportMode): "openai" | "local" {
  return mode.kind === "local" ? "local" : "openai";
}
