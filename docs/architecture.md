# Architecture

## Stack retenue

**PWA + Supabase** — application web installable, multi-device dès le départ.

- **Frontend** : React 18 + TypeScript + Vite, déployé en PWA (installable sur desktop et mobile).
- **Backend** : **Supabase** — Postgres + Auth + Edge Functions (Deno).
- **LLM** : appels passés via Supabase Edge Functions, clés API stockées en secrets Supabase.
- **Hébergement frontend** : Vercel (free tier — déploiement Git automatique).

Pas de Tauri, pas de Rust. 100% TypeScript, codegen-friendly de bout en bout.

## Pourquoi ce choix

1. **Multi-device natif** : un seul backend, deux interfaces (desktop browser + mobile PWA installée).
2. **Stack 100% TS** : Claude Code écrit tout, du frontend aux Edge Functions.
3. **Coût** : 0€ pour usage perso (Supabase free tier + Vercel free tier). Seuls les appels LLM sont payants (à ta charge via clé API).
4. **Pivot Tauri possible plus tard** : si on veut un wrapper natif desktop, on enrobe la même PWA dans Tauri en ~1 jour. Le frontend ne change pas.

## Comparaison rapide (rappel)

| Critère | PWA + Supabase ✅ | Tauri local-first | Tauri + Supabase |
|---|---|---|---|
| Multi-device | ✅ natif | ❌ (sync à dev) | ✅ |
| Offline complet | partiel (cache) | ✅ | partiel |
| Stack codegen | 100% TS | ~85% TS / 15% Rust | ~95% TS / 5% Rust |
| Bundle / install | URL ou PWA | installeur natif | installeur natif |
| Coût hébergement | free tier | 0 (local) | free tier |
| Distribution | URL | signing OS | signing OS |

## Topologie

```
┌──────────────────────────┐         ┌───────────────────────────────┐
│  Browser / PWA installée │         │           Supabase            │
│                          │         │                               │
│  React + TanStack Query  │ ──HTTPS─▶  Postgres (DB)                 │
│  @supabase/supabase-js   │         │  Auth (users, sessions, RLS)  │
│                          │         │  Edge Functions (LLM proxy)   │
│                          │         │  Realtime (multi-device sync) │
│                          │         │                               │
└──────────────────────────┘         └────────────┬──────────────────┘
                                                   │
                                                   ▼
                                          ┌────────────────────┐
                                          │  OpenAI / Anthropic│
                                          │  (clés en secrets) │
                                          └────────────────────┘
```

- Le frontend cause directement à Supabase pour la DB et l'auth (avec RLS pour la sécurité).
- Pour les LLMs, le frontend appelle une Edge Function qui détient les clés API et fait le proxy.
- Sync multi-device "gratuite" : Supabase Realtime peut pousser les changements aux autres devices ouverts.

## Structure projet (prévue)

```
world-builder/
├── docs/                      # Specs & docs vivantes
├── src/                       # Frontend React/TS
│   ├── components/            # Composants UI (incl. shadcn)
│   ├── features/              # Par domaine : worlds, entities, chapters, timeline, runs
│   ├── lib/
│   │   ├── supabase.ts        # Client Supabase
│   │   ├── ranks.ts           # Fractional indexing pour timeline
│   │   ├── prompts/           # Construction des prompts LLM
│   │   └── llm.ts             # Client wrapper appelant les Edge Functions
│   ├── routes/                # TanStack Router (file-based)
│   ├── stores/                # Zustand stores (UI state)
│   └── main.tsx
├── supabase/
│   ├── migrations/            # SQL de migration (générées via `supabase db diff`)
│   ├── functions/             # Edge Functions (Deno/TS)
│   │   └── llm-call/
│   │       └── index.ts
│   └── config.toml
├── public/                    # Assets statiques (icônes PWA, etc.)
├── package.json
├── vite.config.ts             # + vite-plugin-pwa
└── tsconfig.json
```

À ajuster au scaffold.

## Hébergement & CI/CD

- **Vercel** pour le frontend (push to GitHub → deploy auto).
- **Supabase** pour le backend, géré via le CLI `supabase` (migrations versionnées dans le repo).
- Environnements : `dev` (Supabase local via Docker) + `prod` (projet Supabase hébergé).

## Anticipations qui restent valides (héritées de l'ancien plan)

Notre design reste **multi-device-friendly** intrinsèquement (et là c'est natif, pas anticipé) :
- **UUIDs partout** (UUIDv7 si possible) — `id TEXT PRIMARY KEY DEFAULT gen_random_uuid()`
- **Timestamps `created_at` / `updated_at` en UTC** sur toutes les tables
- **Entity versions append-only** (cf. design original §5.3 et §8.2) — colle parfaitement avec une éventuelle Realtime sync
- **Pas de logique métier dans des triggers SQL exotiques** — validation côté TS

## Points ouverts

Voir [NEXT-STEPS.md](./NEXT-STEPS.md).

## Liens

- [product-design.md](./product-design.md) — vision produit canonique
- [data-model.md](./data-model.md) — DDL Postgres complet
- [frontend-stack.md](./frontend-stack.md) — détails React/TS
- [backend.md](./backend.md) — Supabase (Auth, Edge Functions, RLS, Realtime)
- [llm.md](./llm.md) — provider abstraction côté Edge Functions
