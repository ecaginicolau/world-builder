# World Builder — Product Design (v2, canonique)

> Document de référence pour le **vision produit** et les **règles métier**. Pour la stack technique, voir [architecture.md](./architecture.md), [frontend-stack.md](./frontend-stack.md), [backend.md](./backend.md), [llm.md](./llm.md). Pour le découpage de livraison, voir [NEXT-STEPS.md](./NEXT-STEPS.md).

---

## 0. Vision

Un outil pour **auteurs et game devs** qui veut accompagner la **boucle créative réelle** : on a une idée → on la note → on l'explore avec une IA → progressivement on cristallise en entités, chapitres, events.

Le centre de gravité de l'app n'est **pas** la structure (entités, timeline, chapitres) mais la **note** — bout de pensée libre, conversationnel, mobile-friendly. La structure se construit par-dessus, par cristallisation incrémentale.

**Différenciateur** : la plupart des outils d'écriture (Scrivener, World Anvil, etc.) imposent une structure dès le départ. World Builder accepte le **flou créatif** comme état naturel et propose des outils pour le **transformer progressivement** en monde cohérent.

## 1. Personas & JTBD

**Auteur / Solo dev** (persona principal)
- *JTBD* : "Capturer mes idées partout (surtout sur le tel), brainstormer avec une IA qui connaît déjà mon monde, et cristalliser progressivement en éléments durables sans devoir tout pré-structurer."
- Use case dual : **mobile = capture + brainstorm rapide**, **desktop = écriture longue + structuration**.

**Beta reader** (persona future v1.x)
- *JTBD* : "Lire le brouillon de l'auteur en mode confort, sans tomber dans le mode édition."

## 2. Core concepts (glossaire)

Trois familles d'objets :

### Brainstorm side ("l'argile")
- **Note** — bout de texte markdown, scopé à un World. Format mobile-friendly. Édité dans un Tiptap minimal qui affiche en live les entités auto-détectées.
- **ChatThread** — conversation IA attachée à une note (plusieurs par note). Contexte = entités auto-détectées + entités manuellement pinnées.
- **ChatMessage** — message individuel d'un thread (user/assistant).

### Canon side ("les faits")
- **EntityType** — schéma de champs pour un type (Character, Location, Item, Faction, MagicSystem, ...).
- **Entity** — instance d'un type ("Iria", Character).
- **EntityVersion** — snapshot d'une entité à partir d'un rank narratif. **Append-only**.

### Narrative side ("le livre lu")
- **Book** — top-level dans un World (saga = plusieurs books, novel = un seul).
- **Part** — partie d'un book (optionnelle, default = 1 part par book).
- **Chapter** — chapitre dans une part. Contient Draft, Content, Summaries S/M/L.
- **Event** — marqueur de timeline non-chapter au niveau World (ex : "La Grande Bataille" hors-écran).

### Transversal
- **Rank** — string fractional indexing pour ordering insertable. Voir §6.1.
- **Promotion** — opération qui crystallise un bout de note en élément structuré. **Incrémentale**, plusieurs par note possible. Voir §6.4.
- **World Memory** — instructions globales du World (style, ton, règles, contraintes). Injectées dans **tous** les prompts LLM. Métaphore : la "mémoire persistante" du World. Voir §5.7.
- **Run** — log d'un appel LLM (kind, prompt hash, modèle, usage, timestamps). Pour debug et reproductibilité.

## 3. The notes-first loop

```
   ┌──────────┐     ┌────────────┐     ┌──────────────────┐     ┌──────────────┐
   │ Capture  │ ──▶ │ Brainstorm │ ──▶ │  Promotion       │ ──▶ │  Structure   │
   │ (note)   │     │ (chat IA)  │     │  (cristallisation│     │  (entité,    │
   │          │     │            │     │   incrémentale)  │     │   chapitre,  │
   │          │     │            │     │                  │     │   event…)    │
   └──────────┘     └────────────┘     └──────────────────┘     └──────────────┘
        ▲                                                                 │
        │                                                                 │
        └─────────────────── Reader View / re-relecture ─────────────────┘
```

À tout moment :
- Une note peut donner naissance à plusieurs threads d'exploration
- Une note peut être promue plusieurs fois (différents bouts → différentes cibles)
- La note source est conservée comme trace de l'origine

## 4. Architecture d'information (écrans)

### 4.1 Library (multi-worlds)
- Liste des Worlds, "New World", carte par world avec statistiques (notes, chapitres, dernière activité).

### 4.2 World Dashboard
Tabs principaux :
- **Inbox** — liste des notes (default landing, surtout sur mobile)
- **Library** — Books → Parts → Chapters (vue narrative)
- **Entities** — liste filtrable par type
- **Timeline** — events + chapitres rangés par rank chronologique
- **Reader** — vue lecture confortable
- **Settings** — World Memory + custom instructions par type d'entité + clés API

Quick actions (toujours dispo) : "+ Note" (pourquoi pas un bouton flottant mobile), "Search".

### 4.3 Note view
- Éditeur Tiptap minimal (markdown), entités highlightées en live
- Side panel "Threads" → liste des threads + "+ Nouveau thread"
- Side panel "Pins" → entités pinnées manuellement
- Action "Promote..." (sur sélection ou note entière)

### 4.4 Chat thread (sur une note)
- Historique des messages
- Input bas avec saisie + bouton envoyer
- Modèle / provider sélectionnable
- Extension d'auto-extraction qui suggère des pins / créations

### 4.5 Chapter view
- Tabs Draft / Content
- Toolbar Tiptap riche (gras, italique, titres, listes)
- Entités highlightées dans le texte
- Side panel Context (Pinboard, search, recents)
- Side panel Summaries (S/M/L) avec "Refresh from Content"
- Bouton "Upscale" (envoie au LLM avec le contexte pinné + World Memory)
- Bouton "Propose entity updates" (génère diffs structurés)
- Statut `draft` / `published` (figé en read-only une fois publié — v1.x)

### 4.6 Entity view
- Header : name + type
- Selector "State at rank R" (slider sur la timeline)
- Vue de l'état affiché (snapshot interpolé)
- Liste des versions chronologiques avec liens vers les notes/chapitres qui les ont créées
- Onglet relations (visualisation lâche)

### 4.7 Timeline view
- Liste verticale des chapitres et events triés par rank chronologique
- Drag pour réordonner (regénère les ranks fractional)
- Edit chapter chronological_rank manuel (cas flashbacks)

### 4.8 Reader view
- Navigation Books → Parts → Chapters dans l'ordre de lecture
- Affichage texte confortable (typo, marges, mode sépia/sombre)
- Click sur entité highlightée → mini-fiche au state du chapitre
- Pas d'affordance d'édition

## 5. Fonctionnalités

### 5.1 Notes
- CRUD note (markdown brut, mobile-first)
- Statut `open` / `archived` (manuel)
- Recherche full-text (Postgres `tsvector`)
- Filtres : par world, par tag, par entité référencée

### 5.2 Chat threads
- Plusieurs threads par note
- Streaming SSE
- Historique conservé
- Contexte automatique : World Memory + entités auto-détectées + entités pinnées + (option) summary du chapitre courant

### 5.3 Auto-extraction d'entités
- Tourne en background pendant que l'user écrit (debounced)
- Modèle léger (gpt-4o-mini ou équivalent), structured output JSON
- Détecte les noms candidats + match sur entités existantes (par name + aliases)
- Highlight visuel dans le texte rendu :
  - Entité connue → couleur stable + popover avec mini-fiche
  - Nom inconnu → soulignement en pointillés + suggestion "Créer Iria comme Character ?"
- Enrichit silencieusement le contexte des chats : les matches sont ajoutés au prompt sans intervention de l'user

### 5.4 Promotion (incrémentale)
Cibles possibles depuis une note (ou un bout de note sélectionné) :
- Nouvelle Entity (avec choix du type)
- Nouvelle EntityVersion sur entité existante
- Nouveau Chapter (dans une Part choisie)
- Nouveau Event (timeline)
- Split de la note en plusieurs notes

UI :
- Sélection (ou note entière) → bouton "Promote → ..."
- L'IA pré-remplit la cible à partir du contexte (note + thread courant + World Memory)
- L'user valide / ajuste avant création
- Trace ajoutée dans `note_promotions`

### 5.5 Entities & Versioning
- EntityTypes : create/edit, fields dynamiques (string, int, bool, text, relationship, relList)
- Entities : create, edit (= nouvelle version)
- "State at rank R" : la version la plus récente avec `valid_from_rank <= R`
- Resolution des relationships : 1 niveau de profondeur, au state du rank de la session
- Append-only : une version n'est jamais modifiée, seulement ajoutée

### 5.6 Books / Parts / Chapters
- Hiérarchie Books → Parts → Chapters
- Chaque niveau a un `reading_rank` dans son parent (drag to reorder)
- Chapters ont aussi un `chronological_rank` (= reading_rank par défaut, override possible pour flashbacks)
- Chapter content : Draft (rich) + Content (rich) + Summaries S/M/L (plain)
- Statut Chapter : `draft` / `published` (v1.x : published fige le contenu)

### 5.7 World Memory
- Champ texte markdown au niveau World (style/ton/règles globales)
- **Injecté dans tous les prompts LLM** :
  - Chat thread (système prompt)
  - Upscale chapter (système prompt)
  - Propose entity updates (système prompt)
  - Auto-extraction (light, peut-être skippé pour ce cas)
- Concept similaire à une "mémoire persistante" du World — pas gros, toujours utile
- Versionnable plus tard si besoin (out of scope v1)

### 5.8 Upscale (improve a chapter)
Cf. design original §5.7 — mécanique conservée :
- Inputs : Draft ou Content + World Memory + entity cards (state at session rank) + summaries S des chapitres voisins + user request
- Output : texte amélioré, streamé
- L'user choisit d'insérer / remplacer

### 5.9 Propose entity updates
Cf. design original §5.8 — mécanique conservée :
- Input : texte du chapitre + entités pinnées (ou participants)
- Output : `Array<{ entityId, changes, justification }>`
- UI de diff Old → New, Accept/Skip per entity
- Accepter crée une nouvelle EntityVersion avec `valid_from_rank = chapter.chronological_rank`

### 5.10 Reader View
- Navigation Books → Parts → Chapters
- Mini-fiches d'entités au tap/click sur les highlights
- Theme lecture (typo, marges)
- Out of scope v1 : partage avec beta readers via lien

### 5.11 Recherche
- Full-text sur notes, chapitres, entités
- Filtres : type, tag, par world

### 5.12 Audit & Runs
- Chaque appel LLM logué : kind, parent, prompt hash, model, tokens used, timestamps
- Liste consultable, "reopen session" pour les threads

## 6. Règles métier

### 6.1 Ranks
- String sortable lexicographiquement (fractional indexing)
- Insertion entre A et B → générer C tel que A < C < B (alphabet base-62)
- Unique dans le parent (chapter dans part, part dans book, etc.)
- Implémentation : module TS dédié (~50 lignes), tests unitaires

### 6.2 Deux ranks par chapitre
- `reading_rank` : position dans la `part` (drag to reorder)
- `chronological_rank` : position sur la timeline narrative (= valid_from_rank pour entity versions impactées)
- **Default** : `chronological_rank = reading_rank` à la création
- **Override** : l'user peut éditer `chronological_rank` (cas flashback : chapitre lu en position 7 mais qui se passe avant le chapitre 2 chronologiquement)
- Résolution "state at rank R" : utilise toujours `chronological_rank`

### 6.3 EntityVersion (append-only)
- Une version créée n'est jamais modifiée ni supprimée
- Une nouvelle version doit avoir `valid_from_rank >= max(valid_from_rank)` des versions existantes... **sauf** insertion historique explicite (cas du back-fill quand on découvre un fait passé)
- "State at rank R" = version avec le plus grand `valid_from_rank <= R`

### 6.4 Promotion
- Incrémentale : N par note, à des moments différents
- Note source non détruite — statut reste `open` jusqu'à archive manuelle
- Trace dans `note_promotions` (note_id, target_kind, target_id, source_excerpt?, thread_id?, created_at)
- Pré-remplissage par IA avec contexte (note + thread + World Memory)
- L'user valide avant création

### 6.5 Chapter `draft` vs `published`
- `draft` (default) : éditable
- `published` (v1.x) : fige le contenu en read-only (Draft + Content). Pour modifier, créer une nouvelle version (versioning de chapitre, à concevoir)
- Permet d'utiliser un chapitre publié comme **canon stable** pour les Upscales suivants (le LLM peut "faire confiance" à ce qui est déjà publié)

### 6.6 Auto-extraction
- Tourne en debounce (~500ms après arrêt de frappe)
- Modèle léger, prompt minimal, JSON structured output
- Cache les résultats (clé = hash du texte) pour éviter les ré-appels
- Toujours présentée comme **suggestions**, jamais d'application automatique

### 6.7 World Memory
- Injecté dans tous les prompts comme partie du système prompt
- Pas de cap dur sur la taille en v1 (l'user gère sa concision)
- Versionnable v1.x (utile si la "voix" évolue)

## 7. Contrats LLM

### 7.1 Chat (brainstorm sur une note)
**Input** :
- `worldMemory: string`
- `note: { id, content }`
- `pinnedEntities: Array<{ id, name, type, snapshotAtRank }>`
- `autoExtractedEntities: Array<{ id, name, type, snapshotAtRank }>` (silencieux)
- `messages: Array<{ role, content }>` (historique du thread)
- `userMessage: string` (nouveau)

**System prompt skeleton** :
> "Tu assistes l'auteur dans le brainstorm autour d'une note dans le World {WorldName}. Suis les instructions du World ci-dessous. Utilise le contexte d'entités fourni si pertinent ; si une info manque, demande. Reste concis, propose des angles."

**Output** : texte (streamé).

### 7.2 Auto-extraction d'entités
**Input** :
- `text: string`
- `existingEntityIndex: Array<{ id, name, aliases }>`

**System prompt** :
> "Extrais les entités candidates du texte (personnages, lieux, objets, factions). Pour chaque candidat : nom, type probable, span (start/end), match avec une entité existante si évident. JSON strict."

**Output** :
```json
[
  { "name": "Iria", "type": "Character", "span": [12, 16], "match_id": "uuid-or-null" }
]
```

### 7.3 Upscale chapter
(Conservé du design original §9.1, ajout de `worldMemory`)

**Input** :
- `worldMemory: string | null`
- `chapter: { id, chronological_rank, title?, draft?, content? }`
- `mode: "improveDraft" | "improveContent"`
- `entityCards: Array<{ id, name, type, snapshotAtRank }>`
- `eventSnippets: Array<{ id, kind, title, summaryS? }>`
- `userRequest?: string`

**System prompt skeleton** :
> "Tu assistes pour Chapter {N} de {WorldName}. Suis le World Memory ci-dessous. Utilise UNIQUEMENT les entity cards et summaries fournis ; si info manque, pose une question. Ne contredis pas les snapshots au rank {R}."

**Output** : texte amélioré (streamé).

### 7.4 Propose entity updates
(Conservé du design original §9.2, ajout de `worldMemory`)

**Input** :
- `worldMemory: string | null`
- `chapter: { id, chronological_rank, text }`
- `entities: Array<{ id, name, type, currentSnapshotAtRank }>`
- `rules: string`

**System prompt skeleton** :
> "Retourne un JSON array de propositions. Ne propose que des changements strictement justifiés par le texte du chapitre. Omets les fields inchangés. Inclus une justification courte par field."

**Output** :
```json
[
  { "entityId": "...", "changes": { "level": 3 }, "justification": "..." }
]
```

### 7.5 Generate / refresh summaries
**Input** :
- `worldMemory: string | null`
- `chapter: { content }`
- `length: "S" | "M" | "L"` (cibles approximatives : S = 2 phrases, M = 1 paragraphe, L = 3-5 paragraphes)

**Output** : texte plain (streamé).

## 8. User journeys

### 8.1 Quick capture mobile → cristallisation desktop

1. Dans le métro, l'auteur tape une note : *"Et si Iria avait peur de l'eau depuis qu'enfant elle est tombée dans le port d'Albania ?"*
2. Sauvée automatiquement, scopée au last-used world.
3. Le soir au bureau, ouvre l'app, voit la note dans l'Inbox.
4. Clique "Nouveau thread" → demande à l'IA : *"creuse cette idée, comment ça impacte sa relation avec Moonblade qui est une lame d'eau ?"*
5. L'IA voit en contexte : World Memory + Iria (auto-extraite) + Moonblade (auto-extraite).
6. Discussion, étoffement.
7. Promote :
   - Sélection "Phobie : eau (origine port d'Albania, enfance)" → "Promote → Iria (nouvelle version)" → diff prévalidé, accept.
   - Sélection idée Moonblade → "Promote → Event timeline" ou "Chapter futur".
8. La note reste, marquée avec 2 promotions visibles.

### 8.2 Écriture d'un chapitre

1. Library tab → Book 1 → Part 2 → "+ Nouveau chapitre" (rank inséré).
2. Tape le draft directement, ou crée d'abord une note, brainstorm, puis Promote → Chapitre.
3. Dans le chapitre, draft écrit avec auto-extraction qui highlight les entités.
4. Pin manuellement quelques entités supplémentaires si besoin.
5. Bouton Upscale → l'IA voit Draft + entity cards (state au chronological_rank du chapitre) + World Memory + summary du chapitre précédent.
6. Streaming output, l'user choisit d'insérer dans Content.
7. Refresh S/M/L summaries depuis Content.
8. (Plus tard) Bouton Propose updates → diffs sur les entités, accept/skip, nouvelles versions à `chronological_rank` du chapitre.

### 8.3 Mode lecture / re-lecture

1. Reader tab → start de Book 1 → Part 1 → Chapter 1.
2. Texte rendu propre, entités highlightées discrètement.
3. Tap sur "Iria" → mini-fiche state au rank du chapitre courant.
4. Pas d'affordance d'édition — on lit, on respire.

## 9. Acceptance criteria (par slice)

Voir [NEXT-STEPS.md](./NEXT-STEPS.md) pour le découpage. Critères clés par slice :

- **Slice 0** : un user peut signup, créer un World, le voir dans la library, déployé en PWA installable.
- **Slice 1** : un user peut créer une note, écrire du markdown, ouvrir un thread, dialoguer avec l'IA (OpenAI), tout sync sur ses devices.
- **Slice 2** : un user peut créer EntityType + Entity, pinner une entité sur une note → le chat l'inclut dans son contexte.
- **Slice 3** : auto-extraction tourne sur note/chat, suggère des créations, promote note → entité fonctionne avec pré-remplissage IA.
- **Slice 4** : Books/Parts/Chapters fonctionnent, promote note → chapitre fonctionne, Tiptap riche dans le chapitre.
- **Slice 5** : timeline view, drag to reorder, events créables, ranks fractional.
- **Slice 6** : entity versions append-only, "state at rank R" résolue correctement, override de chronological_rank pour flashbacks.
- **Slice 7** : Upscale + Propose updates fonctionnent, diff UI pour proposals, nouvelles versions créées.
- **Slice 8** : Reader view, summaries S/M/L, runs history, search global.

## 10. Non-functional

- **Mobile-first capture** : la création de note doit être < 2 taps sur l'écran d'accueil PWA.
- **Performance** : navigation instantanée sur 2k entités / 500 chapitres / 5k notes.
- **Sync** : changes propagés en < 5s via Supabase Realtime (v1.x).
- **Sécurité** : clés LLM jamais exposées au client.
- **Coûts** : free tier Supabase + Vercel suffit pour usage perso (cf. [backend.md](./backend.md)).
- **Accessibilité** : keyboard navigation, ARIA labels, contraste correct.

## 11. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Scope creep via features IA | Slicing strict, slice 1 livre le coeur en premier |
| Hallucinations IA (faits inventés) | World Memory + entity snapshots dans le prompt, Proposals avec validation humaine |
| Rate limits OpenAI | Edge Function gère le retry/backoff, expose erreurs à l'user |
| Confusion ranks (lecture vs chronologique) | UI claire, chronological_rank caché sauf en cas de flashback explicite |
| Promotion qui crée des doublons d'entités | Auto-extraction matche d'abord sur existing names + aliases |
| Coûts LLM qui dérivent | Compteurs visibles dans Runs view (slice 8) |

## 12. Out of scope v1 (références)

Cf. [future-ideas.md](./future-ideas.md) pour le détail. Highlights :
- Token budgeting / context packing
- Embeddings + recherche sémantique
- Détection de contradictions
- Voice-to-text mobile
- Partage Reader avec beta readers
- Versioning de chapitres après publication
- Templates d'EntityTypes pré-faits
- Export EPUB / PDF du book

## 13. Liens vers docs techniques

- [architecture.md](./architecture.md) — stack PWA + Supabase, topologie
- [frontend-stack.md](./frontend-stack.md) — React/TS/Vite/Tailwind/shadcn/Tiptap/etc.
- [backend.md](./backend.md) — Postgres schema, RLS, Edge Functions
- [llm.md](./llm.md) — abstraction provider, streaming, secrets
- [NEXT-STEPS.md](./NEXT-STEPS.md) — TODO + slicing
- [future-ideas.md](./future-ideas.md) — idées post-v1
