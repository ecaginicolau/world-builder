# Slice 3 — Plan d'exécution

> Auto-extraction d'entités depuis les notes + promotion `note → entity`.

## Goal

Au bout de Slice 3, l'user peut :

1. Écrire dans une note → après quelques secondes, le système extrait des **candidats d'entités** via LLM.
2. Voir un panel "Detected entities" avec : nom, type probable, et soit "matches existing X" soit "new".
3. Pour un nouveau : cliquer "Create as <Type>" → crée l'entité + tag automatiquement la note + log dans `note_promotions`.
4. Pour un match existant : auto-tag silencieux (dès la détection), enrichit le contexte du chat.

Pas de highlighting dans l'éditeur Tiptap (différé — Tiptap Decoration est fiddly, suffisant comme panel pour cette slice).

## Phases

### Phase A — autonome

- A.1 — Migration `V004__slice_3_note_promotions.sql` (table `note_promotions` + RLS + indexes)
- A.2 — Extend Edge Function `llm-call` : accepte `response_format` (passthrough vers OpenAI). Pas de nouvelle Edge Function.
- A.3 — Module LLM `src/lib/llm/extract.ts` :
  - `EntityCandidate` shape (Zod) : `{ name, type, matchedEntityId? }`
  - `extractEntities(req): Promise<EntityCandidate[]>` — utilise tier `cheapest` + json mode
  - Mock : retourne 2 candidats canned si le texte contient `Iria` ou `forteresse`
- A.4 — Hook `useAutoExtract(noteId, plainText, worldId)` :
  - Debounce 5s après la dernière édition
  - Skip si texte < 80 chars
  - Skip si extraction déjà en cours pour ce noteId
  - Cache résultat keyed par hash(plainText) pour éviter les re-runs identiques
- A.5 — `DetectedEntitiesPanel` rendu dans NoteScreen :
  - Liste des candidats
  - Pour chaque candidat : status badge ("matched" / "new"), bouton d'action contextuel
- A.6 — Auto-tag des matches (silent, `pinned_manually: false`)
- A.7 — Action "Create as <Type>" :
  - Choix du type via select inline
  - Mutation `useCreateEntity` → puis `useTagEntity` → puis `logNotePromotion()` (target_kind=`entity`)
- A.8 — Helper `logNotePromotion()` (analogue à `logRun`) — fire-and-forget
- A.9 — UI subtile pour distinguer auto-tagged vs manual-tagged dans NoteEntitiesPanel (badge "auto")
- A.10 — Tests (vitest sur extraction prompt + parser ; playwright pas extensible sans auth réelle)
- A.11 — Pilote Chrome live (après V004 + redeploy llm-call)
- A.12 — Update docs + commit

### Phase B — user (~3 min)

| # | Action | Où |
|---|---|---|
| B.1 | Apply `V004__slice_3_note_promotions.sql` | Dashboard SQL editor |
| B.2 | Redeploy Edge Function `llm-call` (nouvelle version supporte `response_format`) | Dashboard Edge Functions |
| B.3 | Pilote live : note avec un personnage nommé → vérifier panel Detected | App Chrome |

## Décisions unilatérales

- **Tier de l'extraction** : `cheapest` (gpt-5.4-nano) par défaut. Override possible via `extract` dans le code si besoin.
- **Pas de highlighting dans l'éditeur** : panel Detected suffisant pour Slice 3. Tiptap Decoration en Slice 3.x si retour utilisateur.
- **Trigger** : debounce 5s, gates ≥80 chars + pas en flight + pas déjà extrait pour ce hash.
- **Cache** : in-memory, par noteId, hash(plainText). Pas persisté en DB pour cette slice.
- **Auto-tag matches** : silent, `pinned_manually: false`. UI distingue avec un petit badge "auto" sur le chip.
- **Format prompt extraction** : "Extract entity candidates from the note. Return JSON: candidates: [{name, type, matchedExisting?}]. Existing entities: [...]".
- **Type unknown / non listé** : si LLM propose un type qui n'existe pas dans `entity_types`, on marque le candidat avec `type: <suggested>` et l'user devra créer le type avant de créer l'entité (UI bloque sinon).

## Anti-patterns Slice 3 (à NE PAS faire)

- ❌ Highlighting Tiptap (Slice 3.x ou Slice 8 polish)
- ❌ Promotion vers chapter/event (Slice 4-5)
- ❌ Streaming des candidats (overkill pour 5-10 noms)
- ❌ Re-extraire à chaque keystroke (debounce strict)

## Definition of Done

- [ ] V004 écrite et appliquée
- [ ] Edge Function llm-call redéployée avec `response_format`
- [ ] Auto-extraction fire après 5s d'inactivité, pas plus
- [ ] Panel Detected affiche candidats avec status
- [ ] Match auto-tag silencieux marche, distingue dans NoteEntitiesPanel
- [ ] "Create as <Type>" crée entity + tag + ligne note_promotions
- [ ] Tests verts
- [ ] Pilote live OpenAI montre l'extraction sur une note réelle
