# Slice 2 — Plan d'exécution

> Slice 2 = entités simples (sans versioning) + tag d'entités sur une note → contexte du chat enrichi.

## Goal

Au bout de Slice 2, l'user peut :

1. Créer des **entity types** par world (just `name` pour cette slice — ex: "Character", "Location").
2. Créer des **entities** par type (just `name` + `type` — ex: "Iria" / Character).
3. Sur une note, **tag** une ou plusieurs entities (chip-based picker).
4. Le chat IA reçoit la **liste des entities tagged** en plus du title/body/world memory.

Pas d'auto-détection (Slice 3), pas de promotion (Slice 3), pas de versioning (Slice 6), pas d'aliases/tags éditables (différé).

## Phases

### Phase A — autonome (pas d'inputs user)

- A.1 — Migration `V003__slice_2_entities.sql` (`entity_types` + `entities` + `note_entities` + RLS + triggers + indexes)
- A.2 — Types TS (`EntityType`, `Entity`, `NoteEntity`)
- A.3 — Data layer queries (TanStack Query) :
  - `useEntityTypes(worldId)`, `useCreateEntityType`, `useDeleteEntityType`
  - `useEntities(worldId)`, `useCreateEntity`, `useUpdateEntity`, `useDeleteEntity`
  - `useNoteEntities(noteId)`, `useTagEntity`, `useUntagEntity`
- A.4 — Route `/worlds/$worldId/entities` :
  - Section "Entity types" : input + Add button + list
  - Section "Entities" : groupées par type, input + select type + Add, list par type avec edit/delete
- A.5 — Lien "Entities" dans WorldDetailScreen header
- A.6 — Composant `NoteEntitiesPanel` dans NoteScreen :
  - Liste des entities tagged (chips removables)
  - Add picker (search par name + type, multi-select)
- A.7 — `prompt.ts` : nouveau champ `taggedEntities`, injecté dans le system prompt après note context
- A.8 — `ChatPanel` passe les entities depuis `useNoteEntities(noteId)`
- A.9 — Tests (typecheck, lint, vitest, playwright)
- A.10 — Pilote Chrome live (créer types, entities, tag sur une note, voir le LLM les recevoir)
- A.11 — Update docs (NEXT-STEPS, memory)
- A.12 — Commit

### Phase B — user (1 min)

- B.1 — Appliquer V003 dans le SQL editor du dashboard Supabase

## Décisions unilatérales (peuvent être override par user)

- **Pas d'icon sur entity_types pour Slice 2** — `icon` reste null, on l'ajoutera quand l'UI design en aura besoin.
- **Pas de fields dynamiques** : `entity_types.fields` reste `[]` par défaut. Les entities n'ont qu'un `name`. Les fields dynamiques ouvriront en Slice 2.x ou Slice 4 (chapter participants).
- **Pas d'aliases ni tags éditables** dans l'UI. Colonnes existent (text[] vides), pour préparer Slice 3 (auto-extraction).
- **Picker entity** : recherche locale (substring) sur la liste déjà chargée. Pas de paginated server-side.
- **Suppression d'un entity_type** : `ON DELETE RESTRICT` (cf data-model). UI bloque si entities existent ; message "delete entities first".
- **Format entities dans le prompt** : bloc Markdown sous le header `# Linked entities`, une ligne par entity sous forme `- Name (Type)`. Si 0 entities, le bloc n'apparaît pas.

## Anti-patterns Slice 2 (à NE PAS faire)

- ❌ Auto-extraction (Slice 3)
- ❌ Promotion note → entity (Slice 3)
- ❌ Append-only versioning (Slice 6)
- ❌ Highlighting des entities dans l'éditeur Tiptap (Slice 3)
- ❌ Resolution des relationships (Slice 6)
- ❌ Mini-fiche d'entité au popover (Slice 6/8)

## Definition of Done

- [ ] V003 écrite et appliquée
- [ ] Routes + UI entities CRUD fonctionnent
- [ ] Tag/untag d'entities sur une note marche en DB + UI
- [ ] Chat live OpenAI prouve que les entities arrivent dans le prompt
- [ ] Tests verts (typecheck/lint/vitest/playwright)
- [ ] Console clean
- [ ] NEXT-STEPS.md à jour
