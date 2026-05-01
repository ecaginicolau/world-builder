# Slice 6 — Entity versioning + state-at-rank + entity/type detail pages

**Goal** : finir la promesse du modèle canon. Une entity a maintenant une fiche avec des champs typés qui **évoluent dans le temps** via des `entity_versions` append-only. L'UI permet de voir/éditer la fiche au state d'un rank choisi (chapter ou event de la timeline). Les `aliases` (déjà présents en DB et utilisés par le highlight) sont enfin éditables.

## Phase A — autonome

### A.1 Migration V008

`supabase/migrations/V008__slice_6_entity_versions.sql` :

```sql
create table if not exists public.entity_versions (
  id                 uuid        primary key default gen_random_uuid(),
  entity_id          uuid        not null references public.entities(id) on delete cascade,
  world_id           uuid        not null references public.worlds(id) on delete cascade,
  owner_id           uuid        not null references auth.users(id) on delete cascade,
  valid_from_rank    text        not null,                  -- compares lex against chapters/events.chronological_rank ; sentinel '!init' for v0
  snapshot           jsonb       not null default '{}'::jsonb,
  source_note_id     uuid        references public.notes(id) on delete set null,
  source_chapter_id  uuid        references public.chapters(id) on delete set null,
  note_excerpt       text,
  created_at         timestamptz not null default now()
);

create index if not exists entity_versions_resolution_idx
  on public.entity_versions (entity_id, valid_from_rank desc);
create index if not exists entity_versions_world_idx
  on public.entity_versions (world_id);

-- Append-only : aucune update/delete (sauf cascade depuis entities)
create or replace function public.prevent_modification()
returns trigger as $$
begin
  raise exception 'entity_versions is append-only';
end;
$$ language plpgsql;

drop trigger if exists entity_versions_no_update on public.entity_versions;
create trigger entity_versions_no_update
  before update on public.entity_versions
  for each row execute function public.prevent_modification();

alter table public.entity_versions enable row level security;

drop policy if exists "entity_versions: owner can select" on public.entity_versions;
create policy "entity_versions: owner can select"
  on public.entity_versions for select using (owner_id = auth.uid());

drop policy if exists "entity_versions: owner can insert" on public.entity_versions;
create policy "entity_versions: owner can insert"
  on public.entity_versions for insert with check (owner_id = auth.uid());

-- update/delete intentionally not exposed.
```

`note_promotions.target_kind = 'entity_version'` est déjà dans la liste autorisée par le CHECK depuis V004.

### A.2 Sentinel `__init__` et helpers

- Ajout dans `src/lib/ranks.ts` : `export const INIT_RANK = '!init';` (le caractère `!` 0x21 < `0` 0x30, donc `'!init' < START_RANK = '01'` lexicographiquement, donc plus petit que tout rank fractionnel valide).
- Nouveau `src/features/entities/versioning.ts` :
  - `resolveStateAtRank(versions, rank)` → version la plus récente avec `valid_from_rank <= rank` (ou `null` si rien).
  - `versionLabelForRank(rank, sortedTimelineItems)` → string lisible style `"after Chapter 3 — La Forteresse"` ou `"initial"` pour `INIT_RANK`.

Tests Vitest sur les deux helpers.

### A.3 Types & queries

`src/features/entities/types.ts` :
```ts
export type FieldKind = 'string' | 'text' | 'int' | 'bool';
export interface FieldDef { name: string; kind: FieldKind; required?: boolean; help?: string; }
export interface EntityVersion {
  id: string;
  entity_id: string;
  world_id: string;
  owner_id: string;
  valid_from_rank: string;
  snapshot: Record<string, string | number | boolean | null>;
  source_note_id: string | null;
  source_chapter_id: string | null;
  note_excerpt: string | null;
  created_at: string;
}
```

`src/lib/queries/entityVersions.ts` :
- `useEntityVersions(entityId)` → tri ASC sur `valid_from_rank`.
- `useCreateEntityVersion()` → insert (jamais d'update, append-only).

Étendre `useUpdateEntity` pour `aliases?: string[]` et `useUpdateEntityType` pour `fields?: FieldDef[]`.

### A.4 UI

**Routes nouvelles** :
- `/worlds/$worldId/entities/$entityId` → `EntityDetailScreen`
- `/worlds/$worldId/entity-types/$typeId` → `EntityTypeDetailScreen`

**`EntitiesScreen`** : suppression de l'édition inline (name + type). Chaque ligne devient un lien vers la detail page. Les chips de types deviennent aussi des liens vers la detail page du type. Quick-create reste.

**`EntityTypeDetailScreen`** :
- Header : back + name (editable inline) + color picker (déjà existant).
- Section "Fields" : éditeur dynamique (ajout/suppression/reorder simple). Chaque field = `name + kind (string|text|int|bool) + required`. Save = `useUpdateEntityType({ fields })`.

**`EntityDetailScreen`** :
- Header : back + nom (editable inline) + chip type (cliquable → type detail).
- Bloc "Aliases" : chips. Add input + remove `×`. Save = `useUpdateEntity({ aliases })`.
- Picker "Show state as of:" : `<select>` dropdown → `[— current —]` + tous les chapters et events triés chronologiquement, chaque option labellée `"📖 Chapter 3 — La Forteresse"` ou `"📅 Event — La Bataille"` (rank caché, value = rank).
- Fiche typée : pour chaque field du type, afficher la valeur du snapshot résolu au rank sélectionné. Read-only. Si pas de version → "(no value yet)".
- Bouton "**New version at rank …**" : modal. Form pré-rempli avec valeurs courantes, dropdown rank target (default = current cursor, ou rank suivant si on est sur "current"). Save = `useCreateEntityVersion`.
- Liste "Versions" en bas : pour chaque version (chronologique ASC), label rank + date created + petits chips diff (par field) versus la version précédente. Lien vers note source si présent.

**v0 implicite** : si user clique "New version" et qu'il n'y a aucune version, on insère **deux** rows en chaîne :
1. Une v0 vide au sentinel `INIT_RANK` (`snapshot = {}`).
2. La nouvelle version au rank choisi.

C'est le mode "discoverer pattern" : la v0 marque "rien de connu avant". Simple, pas de migration de données existantes nécessaire.

### A.5 Promote note → entity_version

- Bouton "Promote → version" dans le header NoteScreen (4ᵉ).
- Modal `PromoteToEntityVersionModal` :
  - Dropdown "Pick entity" (toutes les entities du world).
  - Dropdown "At rank …" (chapters + events chronologiquement, comme detail page).
  - Form auto-généré depuis le type de l'entity (préchargé avec valeurs au rank choisi si version existe).
  - Save = create version + log promotion `target_kind='entity_version'` + redirect vers entity detail.

## Phase B — user

| # | Action | Où |
|---|---|---|
| B.1 | Apply `V008__slice_6_entity_versions.sql` | Dashboard SQL editor |
| B.2 | Pilote live : éditer un type (ajouter fields), éditer entity (aliases), créer version au rank d'un chapter, scrub timeline picker, promote note → version | App + Chrome |

Pas de nouveau secret, pas d'Edge Function.

## Décisions tranchées

- **Field kinds v1** : `string | text | int | bool` seulement. `rel`/`relList` reportés (impliquent du graph + UI picker, pas le bon moment).
- **Aliases** : édition exposée enfin (Slice 3.y détectait déjà les aliases mais ils étaient toujours `[]` en pratique).
- **Edit name d'une entity** : reste un `UPDATE entities` direct (méta hors-canon, comme aliases/tags).
- **v0 implicite** au sentinel `'!init'` lors de la 1ʳᵉ "New version".
- **Picker rank** : dropdown chronologique, pas de slider.
- **Pas d'auto-diff LLM** au promote — Slice 7.
- **Pas de UI de re-write d'une version** : append-only strict. Pour corriger, on crée une nouvelle version au même rank (ou on accepte le dernier wins). v1.x : "supersede" explicite.

## Tests Vitest visés

- `versioning.test.ts` : `resolveStateAtRank` sur (vide, init seule, init + 1 version, multiple versions, rank avant init, rank entre, rank après, rank exact match).
- `versionLabelForRank.test.ts` : label "initial" pour init, "after X — Y" pour rank parmi items.
- `ranks.test.ts` (existant) : ajout d'un test pour vérifier que `INIT_RANK < START_RANK` et `INIT_RANK < rankBetween(...)` quels que soient les ranks générés.
