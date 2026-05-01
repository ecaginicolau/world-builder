# Next Steps

Document vivant — TODO + liens vers les docs thématiques. Mis à jour au fil des discussions.

## Status (2026-05-01 PM, Slice 2 Phase A code-complete)

**Slice 2 Phase A code-complete** — entity_types + entities CRUD + tag d'entités sur une note + injection dans le prompt LLM. Reste **Phase B (1 min user)** pour appliquer V003 et tester live.

### Phase B Slice 2

| # | Action | Où |
|---|---|---|
| B.1 | Appliquer `supabase/migrations/V003__slice_2_entities.sql` | Dashboard → SQL editor |
| B.2 | Pilote live : créer types/entities, tag sur une note, lancer chat avec entities en contexte | App + Chrome |

Pas de nouveau secret, pas d'Edge Function à déployer.

### Validation locale (avant V003)

- typecheck ✓ · lint ✓ · 18 Vitest ✓ · 4 Playwright ✓ · build prod ✓
- Pilote Chrome : route `/worlds/$id/entities` rend, formulaire create types + entities visible, états d'erreur propres tant que V003 pas appliquée ("Could not find the table 'public.entity_types' in the schema cache"). Pas de console error sur le rendu.

### Ce qui a été fait dans Slice 2

- **V003** : `entity_types` (jsonb fields default `[]`), `entities` (name + entity_type_id + aliases/tags text[]), `note_entities` (pivot manual tag) + RLS owner-scoped + indexes (gin sur aliases/tags) + trigger updated_at.
- **Routes** : nouvelle route `/worlds/$worldId/entities` ; lien "Entities" ajouté dans le header de WorldDetailScreen.
- **EntitiesScreen** : section types (input + chip list, suppression bloquée si entities existent du type), section entities (input + select type + Add, groupées par type, edit inline, delete).
- **NoteEntitiesPanel** : chip picker dans NoteScreen sous l'éditeur. Recherche locale par name ou type. Tag/untag instantané.
- **Prompt** : nouveau bloc `# Linked entities` avec lignes `- Name (Type)` quand des entities sont taggées. Section omise si liste vide.
- **Tests prompt** : 2 nouveaux Vitest pour le bloc Linked entities (avec et sans tags).

### Décisions unilatérales Slice 2 (cf. `docs/slice-2-plan.md`)

- Pas d'icon ni de fields dynamiques sur entity_types (juste `name`)
- Pas d'aliases/tags éditables (colonnes existent, vides par défaut, prêtes pour Slice 3 auto-extraction)
- Suppression entity_type → blocage si entities existent (alert + abort)
- Format prompt : Markdown bullet list `- Name (Type)`

---

## Status (2026-05-01, Slice 1 livré end-to-end + polish autonome)

**Slice 1 livré, Phase A + Phase B + polish autonome validés en pilote Chrome live avec OpenAI.** Le concept central (note + chat IA contextualisé sur world memory) marche — première étape du produit en place.

### Validation live (2026-05-01 PM)
- Création note "Antagoniste principal" + body + envoi message → réponse OpenAI gpt-5.4-mini.
- LLM a correctement repris : titre exact, body exact, world memory exacte, et a respecté le tone (suggestions de noms "Maître Sorn" / "Edran Voss" cohérents avec "low-magic dark fantasy / bleak, ironic / betrayal, slow corruption").
- Multi-tour conversation (history préservé) ✓
- Delete note ✓
- Audit log `runs` POST 201 sur chaque chat ✓
- World memory persistée et injectée à chaque chat ✓

### Polish post-Phase B (autonome, commits TBD)
- **Bug fix prompt** : le LLM confondait le header markdown `# Current note` avec le titre. Maintenant `noteTitle` passé explicitement, prompt clarifié (`Title: X / Body: Y / (untitled) / (empty)`).
- **Tiers + reasoning** : `cheapest=gpt-5.4-nano`, `medium=gpt-5.4-mini` (default), `best=gpt-5.4`. Reasoning effort `none → xhigh` mappé à `reasoning_effort` côté OpenAI. UI `⚙` dans ChatPanel pour basculer.
- **`runs` audit log** : helper `logRun()` (fire-and-forget), appelé à chaque chat (success + error). Stocke `kind=chat`, model, provider, duration_ms, usage, input_summary{tier,reasoning,noteId,historyLength}.
- **`world_memory` UI** : section repliable au top de WorldDetailScreen, edit/save/cancel. Avant ce polish, on hackait avec `worlds.description`.
- **`World` type** étendu avec `world_memory` + helper `useUpdateWorld()`.
- **Note list preview** : utilise `htmlToPlainText` pour afficher 80 chars du body sans HTML brut.

### Ce qui est fait (Phase A)
- Migration `supabase/migrations/V002__slice_1_notes.sql` — `notes`, `chat_threads`, `chat_messages`, `runs` + RLS owner-scoped + indexes.
- Deps : `@tanstack/react-router`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `zod`, `@tiptap/{react,pm,starter-kit,extension-placeholder}`.
- Routing TanStack Router code-based (`src/router.tsx`) : `/`, `/login`, `/worlds`, `/worlds/$worldId`, `/worlds/$worldId/notes/$noteId`, gating via `beforeLoad`.
- QueryClient (`src/lib/queryClient.ts`) : `retry: false` + `networkMode: 'always'` (sinon les fetches Chrome restent paused — pile dégueu sinon).
- Data layer TanStack Query : `src/lib/queries/{worlds,notes,threads}.ts`.
- UI store Zustand minimal pour panneau chat / quick-capture / lastWorldId.
- Composants Slice 1 : `WorldDetailScreen`, `NoteEditor` (Tiptap), `ChatPanel`, `QuickCapture`, `NoteScreen`.
- LLM abstraction : `src/lib/llm/{types,prompt,mock,openai,index}.ts`. Mock par défaut (`VITE_LLM_PROVIDER=mock`), provider OpenAI prêt à brancher l'Edge Function.
- Edge Function skeleton : `supabase/functions/llm-call/index.ts` (Deno + std http, proxy OpenAI). Non déployée.
- Tests : typecheck ✓, lint ✓, **10/10 Vitest** (ranks + prompt builder), **4/4 Playwright** (login render + 2 redirects unauth), build prod ✓.
- Pilote Chrome live : route guard, navigation `/worlds → /worlds/:id`, retour, et l'erreur "table notes inexistante" rendue proprement (red banner) tant que V002 pas appliqué. Console clean (pas d'exception, pas d'erreur React).

### Décisions unilatérales (à confirmer/override par le user)

- **Stockage `notes.content`** : HTML brut sortant de Tiptap (pas de markdown serialization). Choisi pour la simplicité Slice 1. À revoir quand on connectera vraiment l'LLM (probablement strip → text via `htmlToPlainText` côté front, suffit pour un contexte LLM lisible). Pas de dépendance markdown ajoutée.
- **Auto-création de thread** : on attend le premier message (cohérent avec le default suggéré dans `slice-1-plan.md`).
- **Quick-capture target world** : la capture est rattachée au world actuellement ouvert (pas de "dernier visité" cross-session pour l'instant — `useUiStore.lastWorldId` est setté, peut servir plus tard pour un raccourci PWA).
- **`world_memory` injecté** : Slice 0 ne crée pas de colonne `world_memory` sur `worlds` (V001 a une colonne `world_memory text` nullable mais pas exposée dans l'UI). Pour l'instant, le `ChatPanel` passe `worldQ.data?.description` comme world memory. À reclarifier en Slice 2.
- **Pas de mock auth dans Playwright** : E2E couvre "rendu login + redirects". Le full chat flow est pilotable une fois V002 appliquée et un user connecté ; pas mocké pour ne pas dupliquer une couche de mock fragile.
- **Mobile breakpoint pas piloté** : `mcp__Claude_in_Chrome__resize_window` n'a pas réduit le viewport interne sur cette instance (vérifié `window.innerWidth` resté à 1920). Les classes responsive sont posées côté code (`sm:hidden` / `hidden sm:inline-flex` / `md:grid-cols-[2fr_1fr]`). À piloter manuellement après B.1.

### Phase B — done (par le user le 2026-05-01)

| # | Action | Où | Notes |
|---|---|---|---|
| B.1 | ✅ V002 appliquée | Dashboard SQL editor | |
| B.2 | ✅ `OPENAI_API_KEY` secret | Dashboard | |
| B.3 | ✅ Edge Function `llm-call` déployée | Dashboard upload | **Important** : "Verify JWT" doit être OFF sinon le preflight CORS OPTIONS est rejeté en 401 et le browser bloque tout. |
| B.4 | ✅ `VITE_LLM_PROVIDER=openai` | `.env.local` | |
| B.5 | ✅ Smoke test live | Pilote Chrome | Mobile breakpoint pas piloté (resize_window inopérant sur cette instance Chrome). |

### Note sur `networkMode: 'always'`

J'ai dû ajouter `networkMode: 'always'` au `QueryClient` parce que le navigator.onLine de Chrome déclarait l'app offline en présence du DevTools/extensions, ce qui mettait toutes les requêtes TanStack Query en `fetchStatus: 'paused'` indéfiniment. Avec `'always'`, les requêtes partent indépendamment du flag offline. Si on veut un vrai mode offline plus tard (cache + replay), il faudra reprendre cette config.

### Quota OpenAI

Validé après ajout de crédit ($5 minimum). gpt-5.4-mini = ~$0.15/M tokens d'input → des milliers de messages.

### Décisions à reconfirmer post-Slice 1

- **Stockage `notes.content`** : encore HTML brut. `htmlToPlainText()` couvre les usages actuels (preview liste + contexte LLM). À convertir en markdown si besoin d'export ou si on veut un Tiptap riche en chapter editor (Slice 4).
- **`world_memory` est passé tel quel au prompt** (pas de troncage). Si la memory devient longue, prévoir un budget de tokens.
- **Audit log fire-and-forget** : on swallow les erreurs (console.warn). C'est OK tant que `runs` n'est pas critique pour l'UX. Si on bâtit un dashboard de coûts dessus en Slice 8, ré-évaluer.

---

## État précédent (Slice 0)

**Slice 0 livré et validé end-to-end le 2026-05-01.** Login + worlds CRUD + PWA scaffold + cycle dev/test (typecheck/lint/Vitest/Playwright/Chrome-pilot) opérationnel.

En cours côté user : Vercel deploy ([deploy.md](./deploy.md)).

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
| **0** ✅ | Login Supabase (magic link), créer/lister des "worlds" vides, déployé en PWA | La stack tient debout |
| **1** ✅⭐ | **Quick capture + Chat IA sur note** + world memory + tier/reasoning UI + audit log runs. Validé live OpenAI 2026-05-01. | **Concept central validé ✓** |
| **2** ⏳ | Entités simples (sans versioning) + tag d'entités sur une note (contexte du chat). Phase A code-complete 2026-05-01 ; Phase B (apply V003 + smoke test) en attente. | Apport du contexte structuré |
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

### Setup projet (Slice 0)
- [x] Init Vite + React + TS + Tailwind (shadcn/ui à intégrer quand on a besoin de composants riches)
- [x] Première migration Postgres (slice 0 : `worlds` + `user_settings` + RLS) — fichier `supabase/migrations/V001__slice_0_worlds.sql`
- [x] Migration appliquée sur Supabase cloud (project `erlkawphavrznusabzok`)
- [x] `.env.local` renseigné (URL + anon key)
- [x] Vitest + Playwright + ESLint configurés, Chromium installé
- [x] `typecheck`, `lint`, `test` (6/6 unit), `test:e2e` (2/2) tous verts
- [x] Pilotage Chrome via "Claude in Chrome" extension OK — login screen rendu live, console clean
- [x] Cycle dev/test documenté → [dev-cycle.md](./dev-cycle.md)
- [x] Guide deploy → [deploy.md](./deploy.md)
- [ ] Login end-to-end avec un vrai email (manuel, user-side)
- [ ] Test create-world piloté Chrome (post-login)
- [ ] Configurer Vercel + variables d'env (cf. [deploy.md](./deploy.md))
- [ ] Activer Google OAuth (session séparée)
- [ ] Installer Supabase CLI + Docker quand on aura besoin des Edge Functions (Slice 1+)

## Prochaine action concrète

**Slice 0 = livré, testé end-to-end (auth, INSERT, SELECT, RLS), pushed.**

### Ce que le user fait en parallèle
- Vercel deploy (suivre [deploy.md](./deploy.md))

### Slice 1 — démarrage autonome possible

Une session Claude future peut **commencer Slice 1 sans inputs supplémentaires** en suivant [slice-1-plan.md](./slice-1-plan.md). Phase A est entièrement autonome ; Phase B (apply migration, OpenAI key, deploy Edge Function) demande 5 min au user.

Recommandé pour la prochaine session :
1. Lire [CLAUDE.md](../CLAUDE.md) (chargé auto)
2. Lire ce fichier
3. Lire [slice-1-plan.md](./slice-1-plan.md)
4. Exécuter Phase A en ordre, valider chaque étape via le dev cycle
5. S'arrêter et documenter quand Phase B est nécessaire

## Docs détaillées

- **[product-design.md](./product-design.md)** ⭐ canonique — vision produit, features, contrats LLM, règles métier
- **[data-model.md](./data-model.md)** ⭐ canonique — DDL Postgres complet, RLS, triggers, indexes
- [architecture.md](./architecture.md) — stack globale, topologie, structure projet
- [frontend-stack.md](./frontend-stack.md) — choix React/TS détaillés
- [backend.md](./backend.md) — Supabase (Auth, Edge Functions, coûts, Realtime)
- [llm.md](./llm.md) — abstraction LLM dans les Edge Functions, providers, streaming
- [future-ideas.md](./future-ideas.md) — idées post-v1
