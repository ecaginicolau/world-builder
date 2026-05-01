# World Builder — Instructions for Claude Code

A notes-first writing tool for authors and game devs. Frontend = React + TS + Vite (PWA). Backend = Supabase (Postgres + Auth + Edge Functions).

## Read first

1. **[docs/NEXT-STEPS.md](docs/NEXT-STEPS.md)** — what's done, what's next, which slice we're in
2. **[docs/product-design.md](docs/product-design.md)** — product vision & business rules (canonical)
3. **[docs/data-model.md](docs/data-model.md)** — Postgres schema (canonical)
4. **[docs/dev-cycle.md](docs/dev-cycle.md)** — how we validate changes
5. If `docs/slice-N-plan.md` exists for the current slice, **read it before coding** — it's the executable plan

## Slices

Vertical slicing — each slice ships a coherent app. Implement in order. Don't pull features forward.

| # | What works at end of slice |
|---|---|
| 0 | ✅ Login + worlds CRUD + PWA scaffold |
| 1 ⭐ | ✅ Note + chat IA — **the core validation** |
| 2 | ✅ Entities + tag entities on a note |
| 3 | ✅ Auto-extraction + promotion note → entity |
| 4 | ✅ Books / parts / chapters + promotion note → chapter |
| 5 | ✅ Timeline + events + ranks |
| 6 | ✅ Append-only entity versioning + state-at-rank |
| 7 | ✅ Upscale + structured proposals |
| 8 | ✅ Reader view + summaries + PCC + search + published flag + runs page — **v1 complete** |

## Tech stack (settled — don't relitigate)

- **Frontend**: React 18 + TS + Vite + Tailwind + vite-plugin-pwa
- **Routing/State** (added in Slice 1): TanStack Router + Zustand + TanStack Query + React Hook Form + Zod
- **Editor**: Tiptap (minimal config for notes, rich for chapters)
- **Backend**: Supabase cloud project `erlkawphavrznusabzok` (Postgres + Auth + Edge Functions). No local Docker yet — migrations are applied via the SQL editor in the dashboard.
- **LLM**: OpenAI via Supabase Edge Functions; provider abstraction in `src/lib/llm.ts`. Mock implementation for dev without API key.
- **Auth**: Magic link (Google OAuth deferred to a later session)
- **Hosting**: Vercel (autodeploy on push to main)

## Dev cycle (always run before claiming "done")

```bash
npm run typecheck    # tsc -b strict
npm run lint         # ESLint flat config
npm test             # Vitest unit tests
npm run test:e2e     # Playwright (Chromium installed)
npm run build        # production build smoke
```

For UI changes: also pilot Chrome via the **"Claude in Chrome" extension** (already paired). Use `mcp__Claude_in_Chrome__*` tools to drive `http://localhost:5173`, screenshot, and verify the golden path. Don't rely solely on automated tests for UI work.

## Committing

- Small focused commits with clear messages
- **No co-author trailer** — sandbox blocks it
- Don't push unless: (a) the user asked, or (b) the slice is fully validated end-to-end (auto tests + live Chrome pilot)

## Code style

- Default to no comments — only when WHY is non-obvious
- Don't add error handling for impossible scenarios
- Don't build past the current slice
- `data-testid` on all interactive elements (Playwright + Chrome pilot rely on them)
- Prefer editing existing files to creating new ones

## Working autonomously

When the user says "go autonomous" or sends you off AFK:
- Run all checks before pushing — silence is not success
- For things that need user inputs (Vercel deploy, OpenAI key, applying migrations, magic-link login), document them clearly and stop. Don't make up creds, don't push without validation, don't fake test results.
- Leave a clear `## Status` note in `docs/NEXT-STEPS.md` of where you stopped and what's needed next.
