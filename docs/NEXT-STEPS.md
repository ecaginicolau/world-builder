# Next Steps

Document vivant — TODO + liens vers les docs thématiques. Mis à jour au fil des discussions.

## Status (2026-05-01 PM, Slice 5 livré et validé live + ConfirmDialog réutilisable)

**Slice 5 livré, V007 appliquée, full flow validé live.** Timeline avec events + chapters mergés, reorder cross-table, edit/delete events, promote note → event. En cours de session, on a aussi remplacé tous les `window.confirm()` / `window.alert()` par un composant `ConfirmDialog` réutilisable themed dark.

**Demo guide** : [docs/demo/slice-5-timeline.md](./demo/slice-5-timeline.md) — walkthrough ~3 min pour re-valider à la main.

### Validation live Slice 5 (V007 appliquée)
- Create event "La Grande Bataille" → counter `1 chapter · 1 event` ✓
- Reorder ↑ : event passe au-dessus du chapter (cross-table chronological_rank update) ✓
- Reorder ▼ : event redescend ✓
- Edit event inline : title + description multi-ligne + tags `war, off-screen, pivot` saved et rendus ("📅 Event · war, off-screen, pivot" + description avec line-break préservé) ✓
- Promote note "Maitre Sorn..." → event "Rencontre à la Vieille Forteresse" : description = `htmlToPlainText(note.content)`, tags `rencontre, trahison`, redirect vers `/timeline`, counter passe à `1 chapter · 2 events`, event s'insère bien à la fin ✓
- Delete event via ConfirmDialog themed (bouton Delete rouge en mode `danger`) → event disparu, counter à `1 chapter · 1 event` ✓
- Console clean : aucun `[note_promotions] log failed`, aucun erreur applicative.

### Polish session : ConfirmDialog réutilisable

- Nouveau `src/lib/useConfirm.ts` : zustand store `useDialogStore` + hooks `useConfirm({title, message?, confirmLabel?, cancelLabel?, danger?}) → Promise<boolean>` et `useAlert({title, message?, okLabel?}) → Promise<void>`.
- Nouveau `src/components/ConfirmDialog.tsx` : modal themed mounted globalement dans `RootLayout`. ESC dismisses (false), Enter confirms (true), click backdrop dismisses, autoFocus sur OK. Bouton OK rouge (`bg-red-600`) en mode `danger`.
- **10 occurrences remplacées** dans : NoteScreen, ChapterScreen, BooksScreen, BookDetailScreen (×2), EntitiesScreen (×2 confirms + 1 alert), DetectedEntitiesPanel (1 alert), TimelineScreen.
- Raison : `window.confirm()` natif (1) gèle le tab Chrome côté extension "Claude in Chrome" donc je ne peux pas piloter les flows qui passent par un confirm, (2) UX cassée sur le thème dark de l'app. Voir mémoire `feedback_no_native_dialogs.md`.

### Ce qui a été fait dans Slice 5

- **V007** : table `events` (chronological_rank + title + description + tags text[] + source_note_id) + RLS owner-scoped + indexes (gin sur tags, btree sur world_id+rank) + trigger updated_at.
- **Type TS** `TimelineEvent` dans `src/features/timeline/types.ts` (renommé pour éviter le conflit avec le DOM `Event` global).
- **Data layer** `src/lib/queries/events.ts` : `useEvents`, `useCreateEvent`, `useUpdateEvent` (title, description, tags, chronologicalRank), `useDeleteEvent`.
- **`useUpdateChapter` étendu** : accepte maintenant `chronologicalRank?: string` (pour le reorder cross-table dans la timeline).
- **Helper** `src/features/timeline/timelineItems.ts` : `mergeTimelineItems(chapters, events)` retourne une liste `TimelineItem[]` triée par `chronological_rank` ASC ; `rankForMoveUp(items, idx)` / `rankForMoveDown(items, idx)` calculent le nouveau rank via `rankBetween`.
- **Route** `/worlds/$worldId/timeline` ajoutée dans `src/router.tsx`.
- **AppHeader** : nouveau tab "Timeline" (icon 📅, testid `tab-timeline`) à droite de "Books".
- **`TimelineScreen`** : header back + count, form create event minimaliste, liste merged + reorder ↑↓ qui dispatch sur `useUpdateEvent` ou `useUpdateChapter` selon le kind, edit panel inline pour events (title/description/tags), delete via ConfirmDialog.
- **`PromoteToEventModal`** : modal séparée (réutilise pattern `PromoteToChapterModal`), insert event avec `description = htmlToPlainText(note.content)` + `source_note_id` + `note_promotions` row (`target_kind='event'`).
- **Bouton "Promote → event"** dans le header de NoteScreen, à côté de "Promote → chapter".
- **9 tests Vitest** sur `timelineItems.ts` (merge sort, kind preserved, rank for move up/down sur empty/middle/edges).
- **Workflow validé** : pour les slices avec migration, le user applique la migration AVANT le code complet pour permettre un test live au fur et à mesure (cf. mémoire `feedback_apply_migration_early.md`).

### Décisions unilatérales Slice 5 (cf. `docs/slice-5-plan.md`)

- Pas de drag-and-drop dès la Phase A — boutons `↑ ↓` (cohérent avec Slice 4). Migration vers dnd-kit en 5.x si demandé.
- Form create event minimaliste (juste un input titre) — édition complète (description, tags) en mode "edit" inline après création.
- Reorder cross-table : déplacer un chapter dans la timeline modifie SEULEMENT son `chronological_rank`, jamais son `reading_rank` (= cas flashback du design).
- Tags d'event = `text[]`, input "tag1, tag2, tag3" en UI, pas de picker, pas de couleur.
- Description d'event = `text` simple (textarea), pas Tiptap.
- Promotion note → event : la note source n'est PAS archivée par défaut (events moins définitifs qu'un chapter).
- Nouvel event créé avec `chronological_rank = nextRankAfter(allItems)` — ajouté à la fin, l'user remonte avec ↑.

### Ce qui a été fait dans Slice 5

- **V007** : table `events` (chronological_rank + title + description + tags text[] + source_note_id) + RLS owner-scoped + indexes (gin sur tags, btree sur world_id+rank) + trigger updated_at.
- **Type TS** `TimelineEvent` dans `src/features/timeline/types.ts` (renommé pour éviter le conflit avec le DOM `Event` global).
- **Data layer** `src/lib/queries/events.ts` : `useEvents`, `useCreateEvent`, `useUpdateEvent` (title, description, tags, chronologicalRank), `useDeleteEvent`.
- **`useUpdateChapter` étendu** : accepte maintenant `chronologicalRank?: string` (pour le reorder cross-table dans la timeline).
- **Helper** `src/features/timeline/timelineItems.ts` : `mergeTimelineItems(chapters, events)` retourne une liste `TimelineItem[]` triée par `chronological_rank` ASC ; `rankForMoveUp(items, idx)` / `rankForMoveDown(items, idx)` calculent le nouveau rank via `rankBetween`.
- **Route** `/worlds/$worldId/timeline` ajoutée dans `src/router.tsx`.
- **AppHeader** : nouveau tab "Timeline" (icon 📅, testid `tab-timeline`) à droite de "Books".
- **`TimelineScreen`** : header back + count, form create event minimaliste, liste merged + reorder ↑↓ qui dispatch sur `useUpdateEvent` ou `useUpdateChapter` selon le kind, edit panel inline pour events (title/description/tags), delete confirm.
- **`PromoteToEventModal`** : modal séparée (réutilise pattern `PromoteToChapterModal`), insert event avec `description = htmlToPlainText(note.content)` + `source_note_id` + `note_promotions` row (`target_kind='event'`).
- **Bouton "Promote → event"** dans le header de NoteScreen, à côté de "Promote → chapter".
- **9 tests Vitest** sur `timelineItems.ts` (merge sort, kind preserved, rank for move up/down sur empty/middle/edges).

### Décisions unilatérales Slice 5 (cf. `docs/slice-5-plan.md`)

- Pas de drag-and-drop dès la Phase A — boutons `↑ ↓` (cohérent avec Slice 4). Migration vers dnd-kit en 5.x si demandé.
- Form create event minimaliste (juste un input titre) — édition complète (description, tags) en mode "edit" inline après création.
- Reorder cross-table : déplacer un chapter dans la timeline modifie SEULEMENT son `chronological_rank`, jamais son `reading_rank` (= cas flashback du design).
- Tags d'event = `text[]`, input "tag1, tag2, tag3" en UI, pas de picker, pas de couleur.
- Description d'event = `text` simple (textarea), pas Tiptap.
- Promotion note → event : la note source n'est PAS archivée par défaut (events moins définitifs qu'un chapter).
- Nouvel event créé avec `chronological_rank = nextRankAfter(allItems)` — ajouté à la fin, l'user remonte avec ↑.

---

## Status (2026-05-01 PM, Polish post-3/4 complet — Slice 4.y livré)

**Tout le polish post-Slice 3/4 est livré et validé live.** Récapitulatif des paquets :

| Paquet | Contenu | Statut |
|---|---|---|
| 3.x | AppHeader nav + Settings + Monitoring + cache extract fix | ✅ |
| 3.x bugs | Toggle monitoring 1-click + × persistant et clickable | ✅ |
| 3.y | Couleurs entity types + highlight in-editor (Tiptap Decoration) + bug fix re-build sur docChange | ✅ |
| 4.x | Feature parity chapters (chat + entities + auto-extract + highlights) + LinkSource pattern | ✅ |
| Layout | 3-col desktop entities | editor | chat (avec scroll indépendant) + page widened à max-w-screen-2xl | ✅ |
| 4.y | Notes archive UX (toggle list, bouton archive, opacity+badge, auto-archive option en promotion) | ✅ |

### Validation live Slice 4.y
- WorldDetailScreen : nouveau header section "NOTES" avec toggle "Show archived" à droite.
- NoteScreen : bouton "Archive" dans le header (devient "Unarchive" quand archived). Toggle direct, pas de confirm.
- Note archived → disparaît de la liste par défaut. Cocher "Show archived" → réapparaît avec badge `ARCHIVED` + opacity 60%, toujours cliquable.
- Modal "Promote → chapter" : nouvelle checkbox "Archive this note after promoting" (cochée par défaut) — la note source est archivée automatiquement après promotion.
- Pas de migration nécessaire (`notes.status` déjà 'open'/'archived' depuis V002).

---

## Status (2026-05-01 PM, Slice 4.x livré et validé live)

**Slice 4.x livré** — feature parity complète sur chapters : chat IA + linked entities (chip picker) + auto-extract + highlight in-editor. Validé live OpenAI sur "Confrontation à la forteresse".

### Validation live
- Naviguer vers un chapter → header avec back/Hide chat/Delete, title éditable, éditeur Tiptap avec highlights, panel **Linked entities (4)** auto-tagged depuis l'extraction (Iria/Vieille Forteresse/Edran Voss/Maitre Sorn colorés), panel **Detected entities · 4 matched, 0 new**, ChatPanel à droite.
- Chat sent : "Donne moi un mot d'introduction pour le suivant" → réponse `« Fissure ». 🔥` (custom prompt per-world respecté : français, court, emoji feu).
- Auto-extract debounce 2s (réglé en Settings) tournant sur le draft.
- Pas de crash, pas de console error.

### Bug surprise fixé en cours
- Première version : infinite loop crash "Maximum update depth exceeded" sur ChapterScreen. Cause : `useChapterLinkSource` retournait un nouvel objet à chaque render (object literal), qui re-déclenchait le `useEffect` d'auto-tag dans DetectedEntitiesPanel. Fix : memoize les hooks `useNoteLinkSource` et `useChapterLinkSource` avec `useMemo` + `useCallback` pour stabiliser les références.

### Refactor architectural
- **`ChatPanel`** : props `noteId` → `parentKind: 'note' | 'chapter' | 'entity'` + `parentId`. Threads queries (`useThreads`, `useCreateThread`) prennent maintenant `parentKind` aussi.
- **`NoteEntitiesPanel`** → **`LinkedEntitiesPanel`** (export renommé) qui prend une `LinkSource` injectée. Plus de couplage direct à `note_entities`.
- **`DetectedEntitiesPanel`** : prend une `LinkSource` aussi + `noteIdForPromotionLog?` (optionnel — chapters n'ont pas de promotion log via cette panel).
- **`useAutoExtract`** : `noteId` → `parentKind` + `parentId`, cache scopé par `${parentKind}:${parentId}` (évite les collisions si jamais une note et un chapter partageaient un id).
- **`linkSources.ts`** (nouveau) : `useNoteLinkSource(noteId)` et `useChapterLinkSource(chapterId)` exposent une `LinkSource` uniforme. C'est le seul endroit qui sait quelle table utiliser. `trackAutoBadge` permet aux notes d'afficher AUTO sur les chips auto-tagged.
- **`chapterParticipants.ts`** (nouveau) : queries `useChapterParticipants`, `useLinkChapterEntity`, `useUnlinkChapterEntity`.

### Différences chapter vs note (volontaires)

| Feature | Note | Chapter |
|---|---|---|
| Linked entities | `note_entities` (avec `pinned_manually`) | `chapter_participants` (sans) |
| Badge AUTO | ✅ | ❌ (pas de pinned_manually en DB) |
| Promotion log | écrit dans `note_promotions` | non |
| Promote → chapter | bouton dans header | n/a |
| Quick capture FAB | n/a (mobile-first sur notes) | n/a |
| Auto-extract | sur `content` (notes.content) | sur `draft` (chapters.draft) |

Si on veut le badge AUTO sur chapters plus tard : ajouter `pinned_manually boolean default true` à `chapter_participants` (mini-migration).

---

## Status (2026-05-01 PM, Slice 3.y livré et validé live)

**Slice 3.y livré** — couleurs par entity type + highlight des entities dans l'éditeur Tiptap. Validé live Chrome.

### Validation live (2026-05-01 PM)
- EntitiesScreen : color picker (input type="color") à côté de chaque type → mutation immédiate via `useUpdateEntityType`. Lieux passés en orange, Personnages en cyan automatiquement (couleurs auto-générées par hash du nom tant que l'user n'override pas).
- Sub-headers de la liste entities (PERSONNAGES / LIEUX) coloré assortis.
- Linked entities chips dans NoteScreen : `bg = color@13%`, `border = color@40%`, lisible sur fond noir.
- **Highlight in-editor** : Tiptap extension `EntityHighlight` (ProseMirror Decoration) parse le doc et match `entity.name` + `entity.aliases` (case-insensitive, word-boundary regex). "Maitre Sorn", "Iria", "Vieille Forteresse", "Edran Voss" tous soulignés dans la note avec leur couleur, refresh quand la liste d'entities change.

### Décisions implémentation
- Couleurs stockées en hex (`entity_types.color`) ou null. Si null → fallback déterministe par hash(name) sur palette de 10 couleurs (`src/lib/entityColors.ts`).
- Helpers `chipBgFromHex` / `chipBorderFromHex` pour la transparence (suffixe alpha hex).
- Tiptap extension utilise `Decoration.inline` avec style inline (background + border-bottom), pas de mark stocké → le HTML stored en DB n'est PAS pollué par les highlights.
- Refresh : `setEntityHighlights(editor, entities)` via `tr.setMeta(pluginKey, { entities })` → `useEffect` sur la liste d'entities dans NoteEditor.
- Match : regex word-boundary + Unicode flag (`\b...\b/giu`). Aliases inclus dès la v1 (déjà supporté par le schema entity).
- Anti-pattern respecté : pas de NLP, pas de partial match, pas de pronoms (notés dans `docs/future-ideas.md` pour Slice 3.y.next).

---

## Status (2026-05-01 PM, Slice 3.x livré et validé live)

**Slice 3.x livré** — nav (Option A : header sticky), Settings écran, custom prompt per-world, monitoring footer, cache fix auto-extract, debounce configurable. Validé en pilote Chrome avec OpenAI live.

### Validation live (2026-05-01 PM)
- Nav : `[World ▾] · [Notes][Entities][Books] · [📊][⚙]` sticky en haut, tabs highlight l'écran actif, switch instantané entre sections. Plus besoin de revenir au world dashboard.
- Settings → debounce 5000→2000 saved (persisté DB). Custom prompt "Toujours répondre en français en moins de 3 phrases. Termine chaque réponse par 🔥" → LLM live OpenAI a respecté les 3 contraintes (langue, longueur, emoji).
- Monitoring panel : toggle ⚙→📊 → footer 240px s'affiche. 4 runs précédents listés. Nouveau chat → run apparaît dans <1s grâce à l'invalidate après `logRun`. Click row → expand inline avec `input_summary` JSON formatté.
- Cache auto-extract : revisit d'une note non modifiée → pas de re-fire (vérifié réseau, aucune nouvelle requête llm-call).

### Fix non-évident
- TanStack Query `refetchInterval` ne polling pas en background sur cette config Chrome. Solution adoptée = polling 5s + `refetchIntervalInBackground: true` + invalidation immédiate côté ChatPanel après `logRun().then()`. Le polling est gardé pour les runs qui n'ont pas de site d'invalidation explicite (auto-extract futur).

### Déjà inclus pour Slice 3.y
- Colonne `entity_types.color text` créée par V006 mais pas encore utilisée — sera consommée en 3.y (chips colorées + highlights in-editor).

---

## Status (2026-05-01 PM, Slice 4 Phase A code-complete)

**Slice 4 Phase A code-complete** — Books / Parts / Chapters CRUD + promotion note → chapter. Reste **Phase B (~1 min user)** pour appliquer V005.

### Validation locale (avant V005)
- typecheck ✓ · lint ✓ · 29 Vitest ✓ (3 nouveaux sur `nextRankAfter`) · 4 Playwright ✓ · build prod ✓
- Pilote Chrome `/worlds/$id/books` : route rend, formulaire create + erreur PostgREST claire ("Could not find the table 'public.books' in the schema cache") tant que V005 pas appliquée.

### Phase B Slice 4

| # | Action | Où |
|---|---|---|
| B.1 | Apply `supabase/migrations/V005__slice_4_chapters.sql` | Dashboard SQL editor |
| B.2 | Pilote live : créer book → part → chapter, écrire dedans, promouvoir une note vers un chapter | App |

Pas de nouveau secret, pas d'Edge Function.

### Ce qui a été fait dans Slice 4

- **V005** : `books`, `parts`, `chapters` (avec reading_rank + chronological_rank + status draft/published + source_note_id), `chapter_participants` pivot. RLS + triggers + indexes.
- **Routes** :
  - `/worlds/$worldId/books` — liste, create, delete
  - `/worlds/$worldId/books/$bookId` — détail book : create part, list parts avec leurs chapters, create chapter
  - `/worlds/$worldId/chapters/$chapterId` — éditeur chapter (Tiptap StarterKit, auto-save sur title et draft)
- **Lien "Books"** dans header WorldDetailScreen, à côté de "Entities".
- **Promotion note → chapter** : bouton "Promote → chapter" dans le header NoteScreen → modal `PromoteToChapterModal` qui liste tous les parts par book (`<optgroup>`), input title, crée chapter avec `draft = note.content` + `source_note_id` + log `note_promotions` (target_kind='chapter').
- **Helper ranks** `nextRankAfter(items)` dans `src/lib/ranks.ts` + 3 nouveaux tests.

### Décisions unilatérales Slice 4 (cf. `docs/slice-4-plan.md`)

- Pas de drag-to-reorder (Slice 4.x si besoin)
- `chronological_rank` = `reading_rank` à la création (override SQL pour flashbacks ; UI dédiée Slice 5)
- Pas de `published` flag UI (Slice 8)
- Pas de summaries S/M/L (Slice 8)
- Pas de chat panel sur chapter (Slice 4.x — refacto ChatPanel pour parentKind générique)
- Pas de `chapter_participants` UI (table créée mais pas exposée — Slice 4.x ou 5)
- Chapter editor = même `NoteEditor` que pour les notes (StarterKit) — différenciation toolbar reportée
- Promotion : note reste `open`, n'est pas archivée

---

## Status (2026-05-01 PM, Slice 3 Phase A code-complete + validé live)

**Slice 3 Phase A code-complete et validé en pilote Chrome live OpenAI.** Auto-extraction d'entités + promotion note → entity marche end-to-end. Reste **Phase B (~2 min user)** pour appliquer V004 et idéalement redéployer la fonction `llm-call`.

### Validation live (2026-05-01 PM)
- Note avec body "Maitre Sorn rencontre Iria au pied de la Vieille Forteresse. Edran Voss surveille de loin..." → après 5s d'inactivité, l'extraction LLM tourne.
- 3 candidats détectés (Maitre Sorn / Edran Voss / Vieille Forteresse), types suggérés cohérents (Personnages / Lieux).
- 2 matched silently auto-tagués (Iria + Vieux Chateau présents avant) → badge "AUTO" visible sur Iria.
- "Create + tag" sur Maitre Sorn → entité créée, taggée, disparaît correctement de la liste "new" (filtre par nom).
- `note_promotions` log cracha proprement "table not found" (V004 pas appliquée) sans casser l'UX.
- Edge Function `llm-call` retourne JSON valide même sans redéploiement (OpenAI a respecté l'instruction de format dans le system prompt).

### Phase B Slice 3

| # | Action | Où | Notes |
|---|---|---|---|
| B.1 | Apply `V004__slice_3_note_promotions.sql` | Dashboard SQL editor | nécessaire pour audit log |
| B.2 | Redeploy Edge Function `llm-call` (nouvelle version supporte `response_format`) | Dashboard Edge Functions | optionnel — OpenAI respecte le prompt même sans, mais le redeploy garantit le mode JSON strict |

### Ce qui a été fait dans Slice 3

- **V004** : table `note_promotions` (audit log polymorphique vers entity/version/chapter/event/note_split) + RLS + 2 indexes.
- **Edge Function `llm-call`** : passthrough `response_format` vers OpenAI (pour json mode + json schema).
- **`src/lib/llm/extract.ts`** : module dédié à l'extraction. Schéma Zod `entityCandidateSchema`, prompt builder `buildExtractMessages`, mock provider (regex + match aliases), openai provider (utilise tier `cheapest`=gpt-5.4-nano + json mode).
- **`useAutoExtract` hook** : debounce 5s, gates ≥80 chars + pas en flight + cache par hash(text). Reset on noteId change.
- **`DetectedEntitiesPanel`** : affiche candidats avec status (matched/new). Auto-tag silencieux des matches via `pinnedManually: false`. Bouton "Create + tag" pour les new (création entité + tag + log promotion). Filtre new par nom pour éviter les doublons.
- **`useTagEntity`** : nouveau param `pinnedManually` (default true).
- **NoteEntitiesPanel** : badge "AUTO" sur les chips où `pinned_manually=false`.
- **`logNotePromotion()` helper** : fire-and-forget, errors → console.warn.
- **8 tests Vitest** sur `extract.ts` (schema, mock, prompt builder).

### Décisions unilatérales Slice 3 (cf. `docs/slice-3-plan.md`)

- Pas de highlighting Tiptap (différé Slice 3.x) — panel suffisant
- Tier extraction = `cheapest` (gpt-5.4-nano) — extraction = task fast/cheap
- Cache extraction = hash(plainText) en mémoire, par noteId — pas persisté
- Trigger debounce 5s + gate 80 chars min
- Type unknown : `<select>` apparaît à côté du candidat ; user pick un type existant ou message "create type first"

---

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
| **2** ✅ | Entités simples (sans versioning) + tag d'entités sur une note (contexte du chat). Validé live 2026-05-01. | Apport du contexte structuré ✓ |
| **3** ⏳ | **Auto-extraction d'entités** + promotion note → entité. Phase A validée live OpenAI 2026-05-01 ; Phase B (V004 + redeploy llm-call) en attente. | Cristallisation depuis brainstorm |
| **4** ✅ | **Hiérarchie books/parts/chapters** + promotion note → chapitre + feature parity (chat + entities + extract sur chapters). Validé live 2026-05-01. | Structure narrative ✓ |
| **5** ✅ | **Timeline + events + reorder ↑↓** (merge chapters + events par chronological_rank, edit/delete events inline, promote note → event). Validé live 2026-05-01. | Chronologie ✓ |
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
