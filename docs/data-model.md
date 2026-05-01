# Data Model (Postgres / Supabase)

> Schéma complet pour le v1. Concrétise [product-design.md](./product-design.md) §2 (concepts) en Postgres. Voir [backend.md](./backend.md) pour le contexte Supabase global (RLS, Edge Functions, coûts).

## Conventions globales

- **IDs** : `uuid PRIMARY KEY DEFAULT gen_random_uuid()` partout. Compatible multi-device si on l'active un jour, et débugage facile (UUIDs sortables-by-time = UUIDv7 si l'extension est dispo, sinon v4).
- **owner_id** : `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` **dénormalisé sur toutes les tables**, même celles qui ont déjà un parent qui le porte. Permet des **policies RLS triviales** (`owner_id = auth.uid()`) sans jointures.
- **world_id** : dénormalisé sur les tables enfants au-delà du premier niveau (parts, chapters, entity_versions, etc.). Permet "tous les chapitres d'un world" sans jointure book + part.
- **Timestamps** : `created_at` et `updated_at` `timestamptz NOT NULL DEFAULT now()`. Trigger générique pour maintenir `updated_at`.
- **Statuts** : enum simulé via `text` + `CHECK (col IN ('a', 'b'))`. Plus simple à faire évoluer qu'un type ENUM Postgres.
- **Soft delete** : pas en v1. Hard delete via `ON DELETE CASCADE` quand le parent disparaît.
- **JSONB** pour les structures flexibles (fields d'entity_types, snapshots de versions, params de runs).

## Diagramme des relations

```
auth.users
   │
   │ owner_id (dénormalisé partout)
   │
   ▼
worlds ─────────────────────────────────────┐
   │                                        │
   ├──▶ books ──▶ parts ──▶ chapters        │
   │                          │             │
   ├──▶ events ───────────────┴── timeline  │
   │     (chronological_rank, world-scoped) │
   │                                        │
   ├──▶ entity_types                        │
   │       │                                │
   │       ▼                                │
   ├──▶ entities ──▶ entity_versions        │
   │       ▲              (valid_from_rank) │
   │       │                                │
   │   note_entities (pivot, contexte chat) │
   │       │                                │
   │   chapter_participants (pivot)         │
   │                                        │
   ├──▶ notes ──▶ chat_threads ──▶ chat_messages
   │     │                ▲
   │     │                │ parent_kind/_id (polymorphique)
   │     │                │ → note (v1) ; chapter/entity (v1.x)
   │     │
   │     └──▶ note_promotions ──▶ (entity | entity_version | chapter | event)
   │
   └──▶ runs (audit log polymorphique sur tous les appels LLM)

user_settings (1:1 avec auth.users)
```

## Tables

### `worlds`

Container racine. Chaque user a 1+ worlds.

```sql
CREATE TABLE worlds (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  genre         text,
  description   text,
  world_memory  text        NOT NULL DEFAULT '',  -- "mémoire persistante" injectée dans tous les prompts
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX worlds_owner_idx ON worlds (owner_id, updated_at DESC);
```

### `user_settings`

Préférences user (pour le mobile capture, etc.).

```sql
CREATE TABLE user_settings (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_used_world_id   uuid        REFERENCES worlds(id) ON DELETE SET NULL,
  preferences          jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
```

### Hiérarchie narrative : `books` → `parts` → `chapters`

```sql
CREATE TABLE books (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank        text        NOT NULL,  -- fractional indexing within world
  title       text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, rank)
);

CREATE INDEX books_world_idx ON books (world_id, rank);

CREATE TABLE parts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid        NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  world_id    uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,  -- dénormalisé
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank        text        NOT NULL,  -- fractional indexing within book
  title       text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, rank)
);

CREATE INDEX parts_book_idx  ON parts (book_id, rank);
CREATE INDEX parts_world_idx ON parts (world_id);

CREATE TABLE chapters (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id              uuid        NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  world_id             uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,  -- dénormalisé
  owner_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reading_rank         text        NOT NULL,                       -- position dans la part (drag to reorder)
  chronological_rank   text        NOT NULL,                       -- position sur la timeline narrative
  title                text,
  draft                text        NOT NULL DEFAULT '',            -- markdown / Tiptap
  content              text        NOT NULL DEFAULT '',
  summary_s            text,
  summary_m            text,
  summary_l            text,
  status               text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at         timestamptz,
  source_note_id       uuid        REFERENCES notes(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, reading_rank)
);

CREATE INDEX chapters_part_idx          ON chapters (part_id, reading_rank);
CREATE INDEX chapters_world_chrono_idx  ON chapters (world_id, chronological_rank);
CREATE INDEX chapters_status_idx        ON chapters (world_id, status);
```

> **Note `source_note_id`** : référence à la note d'origine en cas de promotion `note → chapter`. `ON DELETE SET NULL` pour ne pas perdre le chapitre si la note est supprimée.
>
> **Note ranks chapitres** : `chronological_rank` est calculé par défaut à la création comme une concaténation de `book.rank|part.rank|reading_rank` (ou équivalent fractional sortable). L'user peut l'overrider plus tard pour les flashbacks. Pas d'unicité forcée sur `(world_id, chronological_rank)` — deux events peuvent occuper le même point logique.

### `events`

Marqueurs de timeline non-chapter.

```sql
CREATE TABLE events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id           uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chronological_rank text        NOT NULL,
  title              text        NOT NULL,
  description        text,
  tags               text[]      NOT NULL DEFAULT '{}',
  source_note_id     uuid        REFERENCES notes(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX events_world_chrono_idx ON events (world_id, chronological_rank);
CREATE INDEX events_tags_gin         ON events USING gin (tags);
```

### `entity_types`

```sql
CREATE TABLE entity_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  icon        text,                              -- nom d'icône lucide (UI)
  fields      jsonb       NOT NULL DEFAULT '[]', -- voir shape ci-dessous
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, name)
);

CREATE INDEX entity_types_world_idx ON entity_types (world_id);
```

**Shape de `fields`** :
```jsonc
[
  { "name": "name",        "kind": "string",   "required": true },
  { "name": "age",         "kind": "int",      "required": false },
  { "name": "alive",       "kind": "bool" },
  { "name": "biography",   "kind": "text",     "help": "Backstory libre" },
  { "name": "best_friend", "kind": "rel",      "target_type": "Character" },
  { "name": "allies",      "kind": "relList",  "target_type": "Character" }
]
```

Validation côté Zod en TS, partagée entre frontend et Edge Functions.

### `entities`

```sql
CREATE TABLE entities (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type_id  uuid        NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
  name            text        NOT NULL,
  aliases         text[]      NOT NULL DEFAULT '{}',  -- pour matching auto-extraction
  tags            text[]      NOT NULL DEFAULT '{}',
  source_note_id  uuid        REFERENCES notes(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entities_world_name_idx ON entities (world_id, name);
CREATE INDEX entities_aliases_gin    ON entities USING gin (aliases);
CREATE INDEX entities_tags_gin       ON entities USING gin (tags);
```

> **`ON DELETE RESTRICT`** sur `entity_type_id` : on ne supprime pas un type qui a des entités. v1.x : action explicite "migrer vers un autre type" ou "supprimer toutes les entités d'abord".

### `entity_versions` (append-only)

Pierre angulaire du modèle canon.

```sql
CREATE TABLE entity_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  world_id           uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,  -- dénormalisé
  owner_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valid_from_rank    text        NOT NULL,                       -- compare à chronological_rank
  snapshot           jsonb       NOT NULL DEFAULT '{}',          -- { fieldName: value }
  source_note_id     uuid        REFERENCES notes(id) ON DELETE SET NULL,
  source_chapter_id  uuid        REFERENCES chapters(id) ON DELETE SET NULL,
  source_run_id      uuid        REFERENCES runs(id) ON DELETE SET NULL,
  justification      text,                                       -- pour les Proposals
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Index critique pour la requête "state at rank R"
CREATE INDEX entity_versions_resolution_idx
  ON entity_versions (entity_id, valid_from_rank DESC);

CREATE INDEX entity_versions_world_idx ON entity_versions (world_id);
```

**Append-only** : on n'autorise pas UPDATE ni DELETE (sauf cascade depuis l'entité parente). Enforced soit côté app, soit via une RLS policy qui interdit UPDATE/DELETE.

**Requête "state at rank R"** :
```sql
SELECT *
FROM entity_versions
WHERE entity_id = $1 AND valid_from_rank <= $2
ORDER BY valid_from_rank DESC
LIMIT 1;
```

L'index `(entity_id, valid_from_rank DESC)` rend cette requête O(log n).

### `chapter_participants` (pivot)

```sql
CREATE TABLE chapter_participants (
  chapter_id  uuid        NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  entity_id   uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chapter_id, entity_id)
);

CREATE INDEX chapter_participants_entity_idx ON chapter_participants (entity_id);
```

### `notes`

```sql
CREATE TABLE notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id    uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text,                                                  -- optionnel ; UI peut auto-générer depuis 1ère ligne
  content     text        NOT NULL DEFAULT '',                       -- markdown brut
  status      text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notes_world_status_idx ON notes (world_id, status, updated_at DESC);

-- Recherche full-text sur le contenu
CREATE INDEX notes_content_fts ON notes USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || content));
```

### `chat_threads` (polymorphique)

```sql
CREATE TABLE chat_threads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_kind  text        NOT NULL CHECK (parent_kind IN ('note', 'chapter', 'entity')),  -- v1 : 'note' uniquement
  parent_id    uuid        NOT NULL,
  title        text,                                                  -- optionnel, UI peut afficher "Thread 1, 2..."
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_threads_parent_idx ON chat_threads (parent_kind, parent_id, updated_at DESC);
CREATE INDEX chat_threads_world_idx  ON chat_threads (world_id);
```

> Pas de FK contraintes vers `notes`/`chapters`/`entities` parce que polymorphique. Intégrité maintenue côté app + cleanup via fonctions Edge ou cron.

### `chat_messages`

```sql
CREATE TABLE chat_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid        NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  owner_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content      text        NOT NULL,
  model        text,                                                  -- pour role='assistant'
  provider     text,                                                  -- pour role='assistant'
  tokens_used  jsonb,                                                 -- { prompt, completion }
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_thread_idx ON chat_messages (thread_id, created_at);
```

### `note_entities` (pivot)

Entités liées à une note (pour contexte des chats).

```sql
CREATE TABLE note_entities (
  note_id           uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_id         uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  owner_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_manually   boolean     NOT NULL DEFAULT false,            -- distingue auto-detected vs manuel
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, entity_id)
);

CREATE INDEX note_entities_entity_idx ON note_entities (entity_id);
```

### `note_promotions`

Trace des cristallisations. Plusieurs par note possibles.

```sql
CREATE TABLE note_promotions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id         uuid        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_kind     text        NOT NULL CHECK (target_kind IN ('entity', 'entity_version', 'chapter', 'event', 'note_split')),
  target_id       uuid        NOT NULL,
  source_excerpt  text,                                              -- bout de note promu (peut être null si la note entière)
  thread_id       uuid        REFERENCES chat_threads(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX note_promotions_note_idx   ON note_promotions (note_id, created_at DESC);
CREATE INDEX note_promotions_target_idx ON note_promotions (target_kind, target_id);
```

### `runs` (audit LLM)

Log polymorphique de tous les appels LLM.

```sql
CREATE TABLE runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id        uuid        NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  owner_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('chat', 'auto_extract', 'upscale', 'propose_updates', 'summarize')),
  parent_kind     text,                                              -- 'note' | 'chapter' | 'thread' | null
  parent_id       uuid,
  session_rank    text,                                              -- rank de résolution des entity cards (pour upscale/proposals)
  model           text        NOT NULL,
  provider        text        NOT NULL,
  prompt_hash     text,                                              -- pour reproductibilité
  usage           jsonb,                                              -- { prompt_tokens, completion_tokens, total_tokens }
  duration_ms     integer,
  status          text        NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'cancelled')),
  error_message   text,
  input_summary   jsonb,                                              -- IDs de pins, params, etc. pour "reopen session"
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX runs_world_idx  ON runs (world_id, created_at DESC);
CREATE INDEX runs_parent_idx ON runs (parent_kind, parent_id);
CREATE INDEX runs_kind_idx   ON runs (world_id, kind, created_at DESC);
```

## Triggers

### `set_updated_at` générique

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- À appliquer à toutes les tables avec updated_at :
CREATE TRIGGER worlds_set_updated_at         BEFORE UPDATE ON worlds         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER user_settings_set_updated_at  BEFORE UPDATE ON user_settings  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER books_set_updated_at          BEFORE UPDATE ON books          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER parts_set_updated_at          BEFORE UPDATE ON parts          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chapters_set_updated_at       BEFORE UPDATE ON chapters       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER events_set_updated_at         BEFORE UPDATE ON events         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER entity_types_set_updated_at   BEFORE UPDATE ON entity_types   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER entities_set_updated_at       BEFORE UPDATE ON entities       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notes_set_updated_at          BEFORE UPDATE ON notes          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chat_threads_set_updated_at   BEFORE UPDATE ON chat_threads   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Empêcher UPDATE/DELETE sur `entity_versions` (append-only)

```sql
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'entity_versions is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_versions_no_update
  BEFORE UPDATE ON entity_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- DELETE autorisé uniquement via cascade (depuis entities). Pas de policy ici, géré par les RLS.
```

## Row Level Security (RLS)

Pattern uniforme : `owner_id = auth.uid()` sur toutes les tables. Les pivots (`chapter_participants`, `note_entities`) ont leur `owner_id` denormalisé pour ce pattern.

```sql
-- Activer RLS sur toutes les tables :
ALTER TABLE worlds                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE books                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_entities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_promotions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs                  ENABLE ROW LEVEL SECURITY;

-- Policy uniforme (à répliquer pour chaque table) :
CREATE POLICY "owner full access on worlds" ON worlds
  FOR ALL
  USING      (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ... répéter pour chaque table.

-- user_settings est self-keyed sur user_id :
CREATE POLICY "self access on user_settings" ON user_settings
  FOR ALL
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- entity_versions : UPDATE/DELETE déjà bloqués par trigger ; RLS limite SELECT/INSERT.
CREATE POLICY "owner select on entity_versions" ON entity_versions
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "owner insert on entity_versions" ON entity_versions
  FOR INSERT WITH CHECK (owner_id = auth.uid());
```

> **Astuce** : générer ces policies via une boucle `DO $$ ... $$` plpgsql à la migration initiale pour éviter le copier-coller.

## Indexes — récap des plus critiques

| Index | But | Slice introduit |
|---|---|---|
| `worlds (owner_id, updated_at DESC)` | Library list | 0 |
| `notes (world_id, status, updated_at DESC)` | Inbox view | 1 |
| `notes_content_fts` | Full-text search | 1 (ou 8) |
| `chat_threads (parent_kind, parent_id, updated_at DESC)` | Threads d'une note | 1 |
| `chat_messages (thread_id, created_at)` | Messages d'un thread | 1 |
| `entities (world_id, name)` | Lookup par nom | 2 |
| `entities_aliases_gin` | Match auto-extraction | 3 |
| `chapters (part_id, reading_rank)` | Liste lecture | 4 |
| `chapters (world_id, chronological_rank)` | Timeline | 4-5 |
| `events (world_id, chronological_rank)` | Timeline | 5 |
| `entity_versions (entity_id, valid_from_rank DESC)` | "State at rank R" | 6 |
| `runs (world_id, created_at DESC)` | Runs history | 8 |

## Ranks — stratégie

**Format** : string fractional indexing avec un alphabet base-62 (`0-9A-Za-z`). Implémentation en TS dans `src/lib/ranks.ts` (~50 lignes). Tests unitaires sur les insertions médianes.

**Génération initiale** (premier item dans un parent) : `"a0"` (ou équivalent au milieu de l'alphabet).

**Insertion entre A et B** : retourner la médiane lexicographique. Exemple : entre `"a0"` et `"a2"` → `"a1"`. Entre `"a0"` et `"a1"` → `"a0V"` (insertion d'un caractère médian dans l'alphabet).

**Pour `chronological_rank` d'un nouveau chapitre** :
- Default = composite calculé : on prend le rank du chapitre précédent dans la timeline et on génère un rank entre celui-ci et le suivant.
- Override possible via UI dédiée (cas flashback).

## Slicing : tables introduites par slice

| Slice | Tables ajoutées |
|---|---|
| **0** | `worlds`, `user_settings` |
| **1** | `notes`, `chat_threads`, `chat_messages`, `runs` |
| **2** | `entity_types`, `entities`, `note_entities` |
| **3** | `note_promotions` (les promotions vers entité activées) |
| **4** | `books`, `parts`, `chapters`, `chapter_participants` |
| **5** | `events` (+ index timeline) |
| **6** | `entity_versions` (+ index "state at rank") |
| **7** | (utilise les tables existantes ; ajoute `runs.kind = 'propose_updates'`) |
| **8** | (FTS index, runs view ; pas de nouvelles tables) |

Chaque slice a sa migration `migrations/V00X__slice_<n>_<theme>.sql`.

## Points ouverts pour l'implémentation

1. **UUIDv7** : extension `uuid-ossp` ou `pgcrypto` standard donne v4. Pour v7 (sortable par temps) il faut `uuid-v7-pg` ou générer côté app. À voir si Supabase l'inclut. Sinon v4 fait le job pour v1.
2. **FTS multilangue** : `to_tsvector('simple', ...)` est minimaliste. Passer à `'french'` ou `'english'` selon le world plus tard (storage de la langue sur `worlds`).
3. **Cleanup des chat_threads orphelins** : si on supprime une note, les threads sont détachés (parent_id pointe sur rien). Job de nettoyage périodique ou trigger sur `notes` DELETE.
4. **Rétention des runs** : audit infini = grosse table à terme. Politique TTL configurable (v1.x).
5. **Realtime channels** : choix des tables à diffuser via Supabase Realtime. Probablement `notes`, `chat_messages`, `chapters`. À configurer slice par slice quand le sync devient utile.

## Liens

- [product-design.md](./product-design.md) — concepts et règles métier
- [backend.md](./backend.md) — Supabase context (RLS, Edge Functions, coûts)
- [NEXT-STEPS.md](./NEXT-STEPS.md) — slicing et migrations
