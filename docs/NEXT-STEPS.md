# Next Steps

Document vivant — TODO + liens vers les docs thématiques. Mis à jour au fil des discussions.

## État actuel

Phase : **planification finalisée — prêt pour scaffold**.

Doc de référence : **[product-design.md](./product-design.md)** (canonique, supersede l'ancien design doc).

## Décisions prises

### Stack
- [x] Architecture : **PWA + Supabase** (multi-device natif, 100% TS) — cf. [architecture.md](./architecture.md)
- [x] Frontend : **React 18 + TS + Vite** — cf. [frontend-stack.md](./frontend-stack.md)
- [x] Routing : **TanStack Router**
- [x] State : **Zustand** (UI) + **TanStack Query** (data) + **React Hook Form + Zod** (forms)
- [x] UI : **Tailwind + shadcn/ui** (+ dnd-kit, react-resizable-panels, lucide-react)
- [x] Rich text editor : **Tiptap** (config minimale pour notes, riche pour chapitres, extension entity-highlight commune)
- [x] PWA : **vite-plugin-pwa** (installable desktop + mobile)
- [x] Backend : **Supabase** (Postgres + Auth + Edge Functions) — cf. [backend.md](./backend.md)
- [x] Auth : magic link email + Google OAuth
- [x] Hébergement frontend : **Vercel** (free tier)

### LLM
- [x] Appels via **Edge Functions Supabase** (clés API en secrets) — cf. [llm.md](./llm.md)
- [x] Provider v1 : **OpenAI**, abstraction TS pour ajouter Anthropic/OpenRouter ensuite
- [x] Streaming via SSE
- [x] **Auto-extraction d'entités** in-scope v1 (modèle léger, JSON structured output)

### Concepts produit
- [x] Centre de gravité = **Note + Chat IA** (et non plus la timeline structurée) — cf. [product-design.md](./product-design.md) §3
- [x] **Promotion incrémentale** : note → entité/version/chapitre/event, N fois par note
- [x] Hiérarchie : **Books → Parts → Chapters** + **Events** au niveau World
- [x] **Reader view** read-only
- [x] **Quick capture mobile** premier-class
- [x] Note : markdown stocké, édition Tiptap minimal (highlight d'entités live), **plusieurs threads** par note, scopée à un world
- [x] **2 ranks par chapitre** : `reading_rank` (dans la part) + `chronological_rank` (timeline). Identiques par défaut, override possible pour flashbacks
- [x] **Chapter `published` flag** (v1.x) : fige le contenu en read-only une fois publié — utile comme canon stable pour Upscales
- [x] **World Memory** : renommage de `customInstructions`, framing "mémoire persistante du world", injecté dans tous les prompts LLM

### Données
- [x] **UUIDs partout** + `created_at`/`updated_at` UTC + `entity_versions` append-only
- [x] **RLS** activé sur toutes les tables, scope `auth.uid()` via colonne `owner_id` dénormalisée
- [x] Ranks : **fractional indexing maison** (TS, ~50 lignes)

## Slices (vertical slicing)

Chaque slice livre une app utilisable de bout en bout. On peut s'arrêter à n'importe quelle slice et avoir un produit cohérent.

| Slice | Ce qui marche | Valeur validée |
|---|---|---|
| **0** | Login Supabase, créer/lister des "worlds" vides, déployé en PWA | La stack tient debout |
| **1** ⭐ | **Quick capture (mobile-first) + Chat IA sur note** (markdown). Pas d'entités, pas de chapitres. | **Le concept central est-il utile ?** |
| **2** | Entités simples (sans versioning) + tag d'entités sur une note (contexte du chat) | Apport du contexte structuré |
| **3** | **Auto-extraction d'entités** dans note/chat + promotion note → entité | Cristallisation depuis brainstorm |
| **4** | **Hiérarchie books/parts/chapters** + promotion note → chapitre (avec Tiptap riche) | Structure narrative |
| **5** | Timeline + ranks (events, drag to reorder, override chronological_rank) | Chronologie |
| **6** | **Versioning append-only** + résolution "state at rank R" | Évolution dans le temps |
| **7** | **Upscale** + **Proposals** (diffs structurés sur entités depuis chapitre) | Boucle écriture → mise à jour entités |
| **8** | **Reader view** + summaries S/M/L + runs history + search + Chapter `published` flag | Polish + ergonomie |

⭐ Slice 1 = pivot du produit ; à viser tôt.

## À décider / à faire avant le scaffold

### Modèle de données ✅
- [x] DDL Postgres complet — cf. [data-model.md](./data-model.md)
- [x] Triggers `updated_at` + append-only sur `entity_versions`
- [x] Index pour les requêtes "state at rank" sur `entity_versions`
- [x] RLS policies pattern uniforme `owner_id = auth.uid()`
- [x] Représentation des champs dynamiques d'`entity_types` (jsonb + Zod côté TS)
- [x] Slicing des migrations (table par slice)

### Setup projet (à faire dans une session de coding dédiée)
- [ ] Init Vite + React + TS + Tailwind + shadcn/ui
- [ ] Init Supabase (CLI + projet local Docker)
- [ ] Première migration Postgres (slice 0 : `worlds` + `user_settings` + RLS)
- [ ] Configurer Vercel + variables d'env

## Prochaine action concrète

**Phase planification close.** Toutes les décisions structurantes (stack, archi, design produit, data model) sont actées et documentées.

Prochaine session = **coding** : scaffold du Slice 0 (Vite + Supabase local + login + créer world vide + déploiement PWA Vercel).

## Docs détaillées

- **[product-design.md](./product-design.md)** ⭐ canonique — vision produit, features, contrats LLM, règles métier
- **[data-model.md](./data-model.md)** ⭐ canonique — DDL Postgres complet, RLS, triggers, indexes
- [architecture.md](./architecture.md) — stack globale, topologie, structure projet
- [frontend-stack.md](./frontend-stack.md) — choix React/TS détaillés
- [backend.md](./backend.md) — Supabase (Auth, Edge Functions, coûts, Realtime)
- [llm.md](./llm.md) — abstraction LLM dans les Edge Functions, providers, streaming
- [future-ideas.md](./future-ideas.md) — idées post-v1
