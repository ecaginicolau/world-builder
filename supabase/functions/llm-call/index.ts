// Supabase Edge Function: llm-call
// Proxies an OpenAI chat completion using OPENAI_API_KEY from secrets.
//
// Request body:
//   { messages: Array<{ role: 'system'|'user'|'assistant'; content: string }>,
//     model?: string,
//     reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh',
//     response_format?: { type: 'json_object' } | { type: 'json_schema', json_schema: {...} } }
// Response (200):
//   { content: string, model: string, usage: { prompt_tokens, completion_tokens, total_tokens } }
//
// SECURITY:
//   - Deploy WITH verify_jwt ON (default). The previous `--no-verify-jwt` was a hole:
//     the anon key is shipped in the front bundle, so it gates nothing. Without JWT
//     verification any visitor could spam this function and burn the OpenAI quota.
//   - Allowed origins are whitelisted via the LLM_ALLOWED_ORIGINS secret
//     (comma-separated). Any other origin gets no CORS headers and is rejected.
//   - Per-user, in-memory rate limit (best-effort, per Edge instance) caps how
//     fast a single authenticated user can call OpenAI.
//
// Deploy: `supabase functions deploy llm-call` (do NOT pass --no-verify-jwt).

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals; runs on Edge Functions, not in Vite.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const ALLOWED_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Per-user rate limit: max RATE_LIMIT_MAX calls per RATE_LIMIT_WINDOW_MS.
// In-memory; resets on cold start and is local to each Edge instance — fine
// as a defense-in-depth alongside the OpenAI hard usage cap.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const rateLimitHits: Map<string, number[]> =
  (globalThis as any).__llm_rate_limit ?? new Map();
(globalThis as any).__llm_rate_limit = rateLimitHits;

function allowedOrigins(): Set<string> {
  const raw = Deno.env.get('LLM_ALLOWED_ORIGINS') ?? '';
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Always allow localhost dev, even if the secret isn't set.
  list.push('http://localhost:5173', 'http://127.0.0.1:5173');
  return new Set(list);
}

function corsHeadersFor(origin: string | null): Record<string, string> | null {
  if (!origin) return null;
  if (!allowedOrigins().has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateLimitHits.get(userId) ?? []).filter((t) => t >= cutoff);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(userId, hits);
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const cors = corsHeadersFor(origin);

  if (req.method === 'OPTIONS') {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (!cors) {
    return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (req.method !== 'POST') {
    return json(cors, { error: 'method not allowed' }, 405);
  }

  // Verify the caller is an authenticated user. With verify_jwt ON, Supabase
  // already rejects requests without a valid JWT before we run, but we still
  // need the user id for rate limiting.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(cors, { error: 'unauthorized' }, 401);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData?.user) {
    return json(cors, { error: 'unauthorized' }, 401);
  }
  const userId = userData.user.id;

  if (!checkRateLimit(userId)) {
    return json(cors, { error: 'rate_limited' }, 429);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json(cors, { error: 'OPENAI_API_KEY is not configured' }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(cors, { error: 'invalid json' }, 400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(cors, { error: 'messages must be a non-empty array' }, 400);
  }

  const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;

  const upstreamBody: Record<string, unknown> = { model, messages };
  if (typeof body.reasoning_effort === 'string' && ALLOWED_EFFORT.has(body.reasoning_effort)) {
    upstreamBody.reasoning_effort = body.reasoning_effort;
  }
  if (body.response_format && typeof body.response_format === 'object') {
    upstreamBody.response_format = body.response_format;
  }

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return json(cors, { error: `openai ${upstream.status}: ${text}` }, 502);
  }

  const data = await upstream.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return json(cors, { error: 'openai returned an unexpected payload' }, 502);
  }

  return json(cors, {
    content,
    model: data.model ?? model,
    usage: data.usage ?? null,
  });
});

function json(cors: Record<string, string>, payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
