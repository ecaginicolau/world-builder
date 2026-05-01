# Slice 1 — Plan d'exécution

> ⭐ Slice 1 = pivot du produit. Valide que **note + chat IA** est vraiment utile.

This plan is designed to be **executed autonomously** by Claude Code in a future session. It assumes:
- Slice 0 is complete (see [NEXT-STEPS.md](./NEXT-STEPS.md))
- The user is AFK during execution
- "Claude in Chrome" extension is paired and available

## Goal

End-to-end user flow at end of Slice 1:

1. User logs in (already works from Slice 0)
2. Picks a world from the worlds list
3. Sees the world's notes (empty at first)
4. Creates a note via either the desktop "+ note" button OR the mobile-first quick-capture FAB
5. Edits the note in a Tiptap minimal editor (markdown stored)
6. Opens a chat thread on the note
7. Sends a message → gets a response from the LLM (using world context + note content)

No entities, no chapters, no timeline yet. Just **note + chat**. That's the whole slice.

## Phases

### Phase A — Autonomous (no user inputs needed)

You can do all of this without the user. Don't push until everything in this phase passes the dev cycle.

#### A.1 — DB migration `V002__slice_1_notes.sql`

Create `supabase/migrations/V002__slice_1_notes.sql` with:

- `notes` table (`id`, `world_id`, `owner_id`, `title?`, `content_md`, `created_at`, `updated_at`)
- `chat_threads` table (`id`, `note_id`, `world_id`, `owner_id`, `title?`, `created_at`, `updated_at`)
- `chat_messages` table (`id`, `thread_id`, `role` (`user|assistant|system`), `content`, `model?`, `prompt_tokens?`, `completion_tokens?`, `created_at`)
- RLS policies (uniform `owner_id = auth.uid()` pattern, see V001)
- Indexes: `notes (world_id, updated_at desc)`, `chat_threads (note_id)`, `chat_messages (thread_id, created_at)`
- Trigger `set_updated_at` on `notes` and `chat_threads`

Reference: [data-model.md](./data-model.md) (canonical DDL — re-use exactly).

**Don't apply** the migration — that's Phase B.1.

#### A.2 — Add new deps

```bash
npm install @tanstack/react-query @tanstack/react-router zustand react-hook-form zod
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder
```

Update `package.json` and check the install runs cleanly.

#### A.3 — Routing structure

Set up TanStack Router in code-based config (simpler than file-based for now). Routes:

- `/` — redirects based on auth state (login screen if not authed, `/worlds` if authed)
- `/worlds` — worlds list (move existing `WorldsScreen` here)
- `/worlds/:worldId` — world detail = notes list
- `/worlds/:worldId/notes/:noteId` — note editor + chat panel

Move auth-gating logic out of `App.tsx` into a route layout.

#### A.4 — Data layer

- `src/lib/queries/worlds.ts` — TanStack Query hooks for worlds (refactor from current direct Supabase calls)
- `src/lib/queries/notes.ts` — `useNotes(worldId)`, `useNote(noteId)`, `useCreateNote`, `useUpdateNote`, `useDeleteNote`
- `src/lib/queries/threads.ts` — chat threads + messages
- Use Zustand only for ephemeral UI state (active note, chat-panel-open) — not for server data

#### A.5 — Components

- `WorldDetailScreen` — header (world name, back to worlds, signout), notes list (most recently updated first), `+ Note` button (desktop) + FAB (mobile)
- `NoteEditor` — Tiptap with starter kit + placeholder; saves on debounced change (300-500ms); store `content_md` (use `@tiptap/extension-markdown` or convert manually)
- `ChatPanel` — collapsible side panel (or bottom sheet on mobile); thread list, current thread messages, input at bottom; "new thread" button
- `QuickCapture` — full-screen modal with one big `<textarea>`; submit creates a note in the current world (or last-used world); persisted to localStorage as draft

All components: `data-testid` on interactive elements.

#### A.6 — LLM provider abstraction

`src/lib/llm/types.ts`:
```ts
export interface ChatMessage { role: 'user' | 'assistant' | 'system'; content: string; }
export interface ChatRequest {
  worldMemory?: string;
  noteContext?: string;
  history: ChatMessage[];
  userMessage: string;
}
export interface LlmProvider {
  chat(req: ChatRequest, opts?: { signal?: AbortSignal }): Promise<string>;
  // Streaming added in a follow-up session
}
```

`src/lib/llm/mock.ts` — returns canned but plausible responses (e.g. echoes the last user message + `"[mocked response]"`); used when `import.meta.env.VITE_LLM_PROVIDER === 'mock'` (default).

`src/lib/llm/openai.ts` — calls the Supabase Edge Function `llm-call`; used when `VITE_LLM_PROVIDER === 'openai'`. **Don't try to deploy the Edge Function yourself** — that's Phase B.

`src/lib/llm/index.ts` — picks the impl from env, exports `getLlm(): LlmProvider`.

#### A.7 — Edge Function skeleton

Write `supabase/functions/llm-call/index.ts` — Deno + TS proxy to OpenAI's chat completions, reading `OPENAI_API_KEY` from secrets. Don't deploy. Add a unit test (Vitest, since it's TS) for the prompt-building helper.

#### A.8 — Tests

- Unit: prompt builder, mock LLM, ranks (existing)
- Playwright E2E: navigate worlds → world detail → create note → open chat → send message → see mocked response. **Mock auth via Supabase storage in `localStorage` setup** so the E2E doesn't need a real magic link.
- Chrome pilot: same flow, plus verify mobile breakpoint (`resize_window` to 390x844)

#### A.9 — Update docs

- `docs/NEXT-STEPS.md` — mark Slice 1 items done, update "current state"
- Add a `## Status` block at top of NEXT-STEPS describing where you stopped and what Phase B requires from the user

#### A.10 — Commit + (optionally) push

If everything in A passes: commit. **Push only if you're confident** the local dev cycle proves the work — there's no CI yet to catch regressions.

### Phase B — User-bound (5 min when they're back)

Document these clearly in `NEXT-STEPS.md`:

| # | Action | Where |
|---|---|---|
| B.1 | Apply `V002__slice_1_notes.sql` | Supabase dashboard → SQL editor |
| B.2 | Add OpenAI API key as Supabase secret | Dashboard → Project Settings → Edge Functions → Secrets, key `OPENAI_API_KEY` |
| B.3 | Deploy Edge Function `llm-call` | Either: dashboard Edge Functions UI, OR install Supabase CLI + `supabase functions deploy llm-call`. Pick whichever Eric prefers. |
| B.4 | Switch front to live LLM | Set `VITE_LLM_PROVIDER=openai` in `.env.local` (and Vercel env) |
| B.5 | Smoke test live chat | Pilot Chrome through the same flow, but with real OpenAI |

## Definition of Done for Slice 1

- [ ] DB migration written + applied + tables exist with RLS
- [ ] Worlds → world detail → note routing works
- [ ] Notes CRUD works end-to-end (create / list / edit / delete)
- [ ] Quick capture creates a note in current world
- [ ] Chat thread + messages persisted in DB, scoped to a note
- [ ] LLM mock returns responses; OpenAI provider returns real responses when configured
- [ ] Playwright E2E green (mocked auth)
- [ ] Chrome pilot smoke green (real auth, real DB, mocked LLM is fine for first push)
- [ ] Mobile breakpoint usable (390px wide)
- [ ] No console errors on the happy path
- [ ] `docs/NEXT-STEPS.md` reflects new state

## Anti-patterns — DO NOT do these in Slice 1

- ❌ Implement entities, chapters, timeline, versioning, promotions (those are Slice 2+)
- ❌ Add auto-extraction of entities (Slice 3)
- ❌ Build a separate mobile UI — single responsive layout
- ❌ Pre-design for streaming if not needed yet (add when integrating real OpenAI)
- ❌ Add complex prompt engineering — Slice 1 prompt = `system: world memory + note context; history; user message`. Keep it simple.
- ❌ Refactor the worlds screen "while you're at it" — only touch what Slice 1 needs

## Open questions to flag (don't decide alone)

- Tiptap markdown serialization — `prosemirror-markdown` vs storing HTML vs writing a small adapter. Pick the simplest that works; flag the choice in your status note.
- Chat thread auto-creation — when user opens a note for the first time, do we auto-create thread #1, or wait for first message? Default: create on first message.
- Quick-capture target — if user has multiple worlds, which world does QC go into? Default: most recently visited; flag for user feedback.

These are fine to decide unilaterally with default + a note in NEXT-STEPS — the user can override.

## How to start the next session

A future Claude Code session in this repo will:

1. Auto-load `CLAUDE.md` and `MEMORY.md`
2. Read `docs/NEXT-STEPS.md` first
3. Notice this file (`docs/slice-1-plan.md`)
4. Execute Phase A in order
5. Stop and write status when Phase B is needed

Don't deviate from the plan unless something fundamental breaks. If you do deviate, document why in `NEXT-STEPS.md`.
