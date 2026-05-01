# LLM Architecture

## Principes

1. **Appels LLM passent par une Edge Function Supabase** — clés API restent en secrets côté serveur, jamais exposées au frontend.
2. **Abstraction provider fine côté Edge Function** : un module TS qui dispatch sur OpenAI / Anthropic / autres.
3. **Construction des prompts côté frontend React** — proche de l'UI, plus facile à itérer (entity cards, summaries, etc.).
4. **Streaming via SSE** (Server-Sent Events) → fluide côté UI.

## Flow

```
┌──────────────────────┐    POST /llm-call           ┌─────────────────────┐
│  React (TypeScript)  │    {provider, model,        │ Edge Function       │
│                      │     messages, params}       │ (Deno + TS)         │
│  - construit prompt  │ ──────────────────────────▶ │                     │
│  - reçoit chunks SSE │                             │ - load API key from │
│                      │ ◀───────────────────────────  │   Supabase secrets  │
│                      │    SSE: data: {chunk}       │ - HTTP call provider│
└──────────────────────┘                             │ - stream chunks SSE │
                                                     └─────────────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │  OpenAI / Anthropic /  │
                                                  │  OpenRouter / ...      │
                                                  └────────────────────────┘
```

## Abstraction Provider (côté Edge Function)

```ts
// supabase/functions/llm-call/providers/types.ts
export interface ChatRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  max_tokens?: number;
  response_format?: 'text' | { type: 'json_schema'; schema: object };
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  chat(req: ChatRequest, apiKey: string): Promise<Response>;
  stream(req: ChatRequest, apiKey: string): Promise<ReadableStream<Uint8Array>>;
}
```

Implémentations :
- `openai.ts` (v1)
- `anthropic.ts` (rapidement après)
- `openrouter.ts` (plus tard — accès multi-modèles via une seule clé)

## Edge Function `llm-call`

Pseudo-code :
```ts
serve(async (req) => {
  // 1. Auth check (Supabase JWT)
  const { user } = await validateAuth(req);
  if (!user) return new Response('Unauthorized', { status: 401 });

  // 2. Parse request
  const { provider, model, messages, params } = await req.json();

  // 3. Load API key from secrets
  const apiKey = Deno.env.get(`${provider.toUpperCase()}_API_KEY`);
  if (!apiKey) return new Response('Provider not configured', { status: 500 });

  // 4. Dispatch to provider
  const llm = getProvider(provider); // -> openai | anthropic | ...

  // 5. Stream response back
  const stream = await llm.stream({ model, messages, ...params }, apiKey);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
```

## Stockage des clés API

**Pour le user "owner" de l'app (toi)** : clés stockées en **secrets Supabase** au niveau projet (`supabase secrets set OPENAI_API_KEY=...`). Tous les users de l'app utilisent ces clés (toi seul en v1).

**Plus tard, si l'app sert plusieurs users** : on aura le choix entre :
- **Modèle "BYO key"** : chaque user fournit sa propre clé, stockée chiffrée dans Postgres (table `user_api_keys` avec chiffrement via `pgcrypto`).
- **Modèle SaaS** : tu factures le user et tu utilises tes clés (compteur d'usage).

À trancher v1.x.

## Providers ciblés

| Provider | Priorité | Notes |
|---|---|---|
| **OpenAI** | v1 | Premier user (toi) |
| **Anthropic** | v1.x | Pertinent vu que tu codes avec Claude |
| **OpenRouter** | v1.x | Une seule clé → accès à de nombreux modèles |
| **Google Gemini** | plus tard | |
| **Ollama** | difficile | Modèles locaux — incompatible avec une Edge Function. Possible si on ajoute un mode "direct depuis le frontend" pour Ollama uniquement. |

## Streaming côté frontend

```ts
const response = await fetch(`${SUPABASE_URL}/functions/v1/llm-call`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ provider, model, messages, params }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // parse SSE: lines de la forme "data: {...}"
  setStreamingText(prev => prev + parseSSEChunk(chunk));
}
```

Une lib type `eventsource-parser` simplifie le parse SSE.

## Prompts (rappel design original §9)

Deux contrats :
- **Upscale Chapter** : input `{ worldInstructions, chapter, mode, entityCards, eventSnippets, userRequest? }` → output texte.
- **Propose Entity Updates** : input `{ chapter, entities, rules }` → output JSON `Array<{ entityId, changes, justification }>`.

Construits côté React dans `src/lib/prompts/`. L'Edge Function ne voit que les `messages` finaux.

## Liens

- [architecture.md](./architecture.md)
- [backend.md](./backend.md)
- [product-design.md](./product-design.md) §7 (contrats LLM) §6 (règles métier)
