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
// Deploy: dashboard upload OR `supabase functions deploy llm-call --no-verify-jwt`.
// "Verify JWT" must be OFF on this function so the OPTIONS preflight is reachable;
// requests are still gated by the anon key, and the function reads no user data.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals; runs on Edge Functions, not in Vite.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const ALLOWED_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ error: 'OPENAI_API_KEY is not configured' }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages must be a non-empty array' }, 400);
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
    return json({ error: `openai ${upstream.status}: ${text}` }, 502);
  }

  const data = await upstream.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return json({ error: 'openai returned an unexpected payload' }, 502);
  }

  return json({
    content,
    model: data.model ?? model,
    usage: data.usage ?? null,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
