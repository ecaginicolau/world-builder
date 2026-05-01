# World Builder

A notes-first writing tool for authors and game devs. Capture ideas anywhere (especially mobile), brainstorm with an AI that knows your world, and gradually crystallise everything into structured entities, chapters, and timeline events — without forcing you to pre-design the whole thing.

> **Status: planning phase.** The product, architecture and data model are designed and documented. Implementation hasn't started yet.

## Vision

Most writing tools (Scrivener, World Anvil, etc.) impose a structure from day one. World Builder embraces creative chaos as the natural starting state and provides tools to **progressively shape** it into a coherent world:

```
Idea → Note → AI brainstorm → Promotion → Structure (entities, chapters, events)
```

Notes are the clay. Entities, chapters and events are the fired pottery. You spend 80% of your time shaping clay; you fire it when you're ready.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, deployed as an installable PWA (works on desktop and mobile)
- **Backend:** [Supabase](https://supabase.com) (Postgres + Auth + Edge Functions + Realtime)
- **LLM:** OpenAI (v1) via Edge Functions, with provider abstraction for Anthropic / OpenRouter / etc.
- **Hosting:** Vercel
- **No native shell, no Rust** — 100% TypeScript end-to-end.

See [docs/architecture.md](docs/architecture.md) for the rationale.

## Documentation

The `docs/` folder is the source of truth. Start here:

- **[docs/product-design.md](docs/product-design.md)** — product vision, features, business rules, LLM contracts (canonical)
- **[docs/data-model.md](docs/data-model.md)** — Postgres schema, RLS, indexes, triggers (canonical)
- **[docs/NEXT-STEPS.md](docs/NEXT-STEPS.md)** — TODO and slice-by-slice roadmap
- [docs/architecture.md](docs/architecture.md) — stack overview and topology
- [docs/frontend-stack.md](docs/frontend-stack.md) — React/TS dependencies and rationale
- [docs/backend.md](docs/backend.md) — Supabase setup, Auth, Edge Functions
- [docs/llm.md](docs/llm.md) — LLM provider abstraction, streaming
- [docs/future-ideas.md](docs/future-ideas.md) — post-v1 ideas

## Roadmap

Vertical slicing — each slice is a shippable, end-to-end-usable app:

| Slice | What works |
|---|---|
| 0 | Login, create/list empty worlds, deployed PWA |
| 1 ⭐ | Quick capture (mobile-first) + AI chat on notes — **the core value proposition** |
| 2 | Entities (without versioning) + tag entities on a note for chat context |
| 3 | Auto-extraction of entities + promotion note → entity |
| 4 | Books / Parts / Chapters hierarchy + promotion note → chapter |
| 5 | Timeline + events + drag-to-reorder ranks |
| 6 | Append-only entity versioning + "state at rank R" resolution |
| 7 | Upscale + Proposals (structured entity diffs from chapter text) |
| 8 | Reader view + summaries S/M/L + runs history + search + published flag |

Details in [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md).

## Getting started

(Setup instructions will be added once Slice 0 lands.)

## License

TBD.
