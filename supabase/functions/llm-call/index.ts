// Supabase Edge Function: llm-call
// Proxies an OpenAI chat completion using OPENAI_API_KEY from secrets.
// Deployed manually in Phase B (see docs/slice-1-plan.md).
//
// Request body:
//   { messages: Array<{ role: 'system'|'user'|'assistant'; content: string }>,
//     model?: string }
// Response (200):
//   { content: string, model: string, usage: { prompt_tokens, completion_tokens, total_tokens } }
//
// Auth: relies on Supabase's default JWT verification (only authenticated users).

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — Deno globals; this file runs on Edge Functions, not in Vite.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
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
