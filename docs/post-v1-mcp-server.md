# Post-v1 — MCP server (slice 2a)

**Document vivant.** Brainstorm session 2026-05-02 PM. Spec figée, pas encore commencée. La slice 2b (les agents qui s'en servent) est traitée séparément.

## Contexte

L'app actuelle = "humain-first, LLM-assist" (90/10). La vision v2 inverse le ratio dans un mode optionnel : un agent externe pilote l'écriture via MCP, et le user passe en mode arbitre/directeur. Les deux modes coexistent.

Slice 2a = exposer World Builder en serveur MCP. Aucune connaissance de "qui consomme" — un client MCP basique (mcp inspector) suffit pour valider les tools. Slice 2b ensuite = comment construire des agents qui s'en servent.

## Macro-décisions tranchées

1. **Standard cible = MCP** (Model Context Protocol). Tout client compliant fonctionnera : Claude Desktop d'abord, claude-code et agents custom ensuite, gratuit côté serveur.
2. **Architecture A : un seul MCP server, tous les tools exposés.** Specialization des agents par system prompt côté client (pas de MCP server par rôle). Le filtrage par rôle au démarrage (`--role=research`) viendra plus tard si besoin de contraintes dures.
3. **Auth = service role key Supabase dans `.env`** local. Outil personnel single-user, jamais exposé sur le réseau. Bypass RLS, simplicité l'emporte.
4. **Logging des actions agent dans une nouvelle table `agent_actions`** (option β). Sémantique propre vs `runs` qui reste "appels LLM". **Writes only** en v1 — reads non loggés (signal/bruit).
5. **Pas de chat tool** exposé, pas même en read-only. Le chat de l'app sert le sens humain → LLM, l'agent étant lui-même un LLM ça n'a pas de sens.
6. **Distribution = `packages/mcp-server`** dans le monorepo (mini-refacto en npm workspaces), lancé par `npx world-builder-mcp`. Les types `Database` et helpers de queries restent partagés.
7. **L'agent apprend le flow via le tool `get_writing_guide`** qui retourne `world.memory` + `worlds.custom_prompt` + recette structurée + règles métier (forced first event, propose canon split, etc.). Pas de "magie" cachée, le flow est documenté à l'agent.

## Modèle de données

Migration V015 (V014 réservée pour slice 1 local LLM) :

```sql
create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references worlds(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_session_id text not null,    -- opaque, généré par le MCP server au démarrage de session
  action_kind text not null,          -- 'create_note', 'link_event_to_chapter', etc.
  target_kind text,                   -- 'note' | 'entity' | 'event' | 'chapter' | 'book' | 'part' | 'link'
  target_id uuid,                     -- nullable (les links n'ont pas d'id propre)
  payload jsonb,                      -- contexte pour rendre une ligne lisible ("title", from→to, etc.)
  created_at timestamptz not null default now()
);

create index agent_actions_world_created on agent_actions (world_id, created_at desc);
create index agent_actions_session on agent_actions (agent_session_id);

alter table agent_actions enable row level security;
create policy agent_actions_owner on agent_actions
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

`agent_session_id` = string opaque générée par le MCP server au démarrage (ULID, p. ex.). Permet de grouper "ce que l'agent a fait dans cette session" pour la vue.

UI v1 : route `/agent-activity` minimale (liste paginée, filtre par session, par target_kind, par range de date). Affichage d'une ligne = humain-readable depuis `payload`. Détaillée dans 2b si besoin de plus.

## Tools list

Convention : snake_case pour les noms de tools (idiomatique MCP). Validation zod à la frontière. Retour standardisé `{ok: true, data: ...}` ou `{ok: false, error: "..."}`.

### Reads (~17, non loggés)

| Tool | Retour |
|---|---|
| `list_worlds` | `[{id, name, ...}]` |
| `get_world(world_id)` | `{...world, memory, custom_prompt}` |
| `get_writing_guide(world_id)` | `{world_memory, custom_prompt, flow_recipe, business_rules}` (cf. § Writing guide) |
| `list_notes(world_id, query?)` | paginated FTS sur `search_text` |
| `get_note(note_id)` | `{...note, content}` |
| `list_entities(world_id, type_id?, query?)` | snapshot courant resolved |
| `get_entity(entity_id)` | snapshot courant + type fields |
| `get_entity_state_at_rank(entity_id, rank)` | snapshot historique via `resolveSnapshotMapAtRank` |
| `list_entity_versions(entity_id)` | versions raw avec leurs deltas |
| `list_events(world_id)` | triés par `chronological_rank` |
| `get_event(event_id)` | `{...event, linked_chapters[], participants[]}` |
| `list_chapters(world_id, book_id?)` | triés par `reading_rank` au sein de book/part |
| `get_chapter(chapter_id)` | `{...chapter, final_version_text, linked_events[], participants[]}` |
| `get_chapter_summary(chapter_id, level)` | string ou null |
| `get_pcc(chapter_id)` | array d'objets `{chapter_id, level, text}` selon config PCC du world |
| `list_books(world_id)` | `[{...book, parts[]}]` |
| `search(world_id, query)` | résultats groupés notes / chapters / entities |

### Writes (~28, tous loggés dans `agent_actions`)

**Notes** : `create_note`, `update_note`, `delete_note`

**Entities** :
- `create_entity(world_id, type_id, name, initial_fields)` — insère auto la v0 init
- `set_entity_field(entity_id, event_id|null, field, value, valid_from_rank)` — race-safe upsert (cf. d.x)
- `reset_entity_field(entity_id, event_id, field)` — delete la row si snapshot devient empty et event-anchored
- `delete_entity` — cascade versions

**Events** :
- `create_event(world_id, title, description?, chronological_rank?)`
- `update_event(event_id, {title?, description_html?, chronological_rank?})` — reorder chrono via cette colonne
- `delete_event` — cascade liens

**Chapters** :
- `create_chapter(book_id, title, first_event_title)` — first_event obligatoire (rule métier slice d)
- `update_chapter(chapter_id, {title?, published?, summary_s?, summary_m?, summary_l?})`
- `delete_chapter`
- `append_chapter_version(chapter_id, text, origin: 'manual_edit'|'upscale')`
- `set_chapter_final_version(chapter_id, version_id)`

**Books / Parts** :
- `create_book`, `update_book`, `delete_book`
- `create_part`, `update_part`, `delete_part`

**Liens** :
- `link_event_to_chapter(chapter_id, event_id, narrative_rank?)` + `unlink_event_from_chapter`
- `update_chapter_event(chapter_id, event_id, narrative_rank)` — reorder narrative
- `link_entity_to_event(event_id, entity_id, pinned?)` + `unlink_entity_from_event`
- `link_entity_to_chapter(chapter_id, entity_id, pinned?)` + `unlink_entity_from_chapter`

### Intents (4, déclenchent des appels LLM)

Chaque intent **respecte les settings local LLM** du user (slice 1). Loggé dans `runs` ET dans `agent_actions`.

- `auto_extract_from_note(note_id)` → **split** : retourne `{candidates: [{name, type_id?, ...}]}`. L'agent décide quoi créer/linker via les writes primitives.
- `propose_canon_from_chapter(chapter_id)` → **split** : retourne `{events: [{title, description, entityDiffs: [...]}]}`. L'agent revue + applique via les writes primitives.
- `upscale_chapter(chapter_id, user_prompt, include_pcc?)` → **one-shot** : crée directement la nouvelle row `chapter_versions` (origin=upscale, devient final), retourne le texte + version_id.
- `summarize_chapter(chapter_id, level)` → **one-shot** : écrit `chapters.summary_{level}` directement, retourne le texte.

## Writing guide — squelette

Le tool `get_writing_guide(world_id)` retourne un objet structuré que l'agent peut consommer. Squelette proposé (à itérer dans 2b) :

```ts
{
  world_memory: string,         // worlds.memory (background lore)
  custom_prompt: string,        // worlds.custom_prompt (style/voice instructions)
  flow_recipe: {
    description: "Recommended flow for drafting a chapter",
    steps: [
      "1. Create a brainstorm note with rough ideas, character motivations, scene setting",
      "2. auto_extract_from_note → review candidates → create new entities/events as needed via primitives",
      "3. Once the note is materially complete, create_chapter with a first event title (REQUIRED)",
      "4. append_chapter_version with origin='manual_edit' for the initial draft prose",
      "5. upscale_chapter when ready to refine prose with the LLM",
      "6. propose_canon_from_chapter to extract events + entity diffs from the prose; review and apply via primitives",
      "7. summarize_chapter at level 's', 'm', 'l' once final"
    ]
  },
  business_rules: [
    "A chapter cannot exist without at least one linked event (UI rule, enforced at create_chapter)",
    "Entity versions are field-deltas: only set fields that explicitly change at that event's anchor",
    "Events drive the canonical timeline. Chapter chronology is derived from min(linked event chrono)",
    "Same event can be retold across multiple chapters — chapter_events.narrative_rank orders within a chapter",
    "Published chapters block all mutations (edit, upscale, propose, summary). Unpublish first if needed",
    "Reset an entity field at an event = delete the row if the snapshot becomes empty (init versions are never deleted)"
  ],
  conventions: {
    rank_format: "Fractional indexing strings (e.g. 'a0', 'a0V', '!init'). Use update_event/update_chapter_event with computed ranks, never raw numbers.",
    field_kinds: "string | text | int | bool only (v1)",
    pinning: "Mark entity-event/entity-chapter links as pinned=true if you want to override LLM auto-detection from prose"
  }
}
```

Le contenu exact (longueur, ton, niveau de détail) sera tuné dans 2b en function de comment Claude Desktop / claude-code consomment cet input.

## Distribution

Mini-refacto en npm workspaces :

```
world-builder/
  package.json          # workspaces: ["packages/*", "."]
  src/                  # app frontend (existant)
  packages/
    mcp-server/
      package.json
      src/
        index.ts        # serveur MCP, transport stdio
        tools/          # un fichier par groupe (notes, entities, events, ...)
        guide.ts        # contenu du writing_guide
      tsconfig.json
```

Le `packages/mcp-server` peut importer les types `Database` et certains helpers de `src/lib/queries/` via path resolution. Build standalone via `tsc`, distribué via `npx`.

Config Claude Desktop côté user :

```json
// ~/.../Claude/claude_desktop_config.json
{
  "mcpServers": {
    "world-builder": {
      "command": "npx",
      "args": ["-y", "world-builder-mcp"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "..."
      }
    }
  }
}
```

## Validation / concurrency

- **Validation** : zod schemas à la frontière de chaque tool. Erreur de validation → `{ok: false, error: "..."}` clair, pas de stack trace.
- **Concurrency** : la race-safe upsert de `set_entity_field` (cf. d.x) couvre les calls parallèles. RLS bypass via service role mais on filtre toujours par `world_id` au moins.
- **Idempotency** : pas de keys explicites en v1. L'agent réessaie = nouvelle row. Si frottement, on ajoute des `client_request_id` plus tard.

## Tasks

1. **Migration V015** : table `agent_actions` + RLS + indexes.
2. **Mini-refacto monorepo** : npm workspaces, `packages/mcp-server` scaffolding, sharing tsconfig + types.
3. **Serveur MCP base** : transport stdio (Anthropic SDK MCP), enregistrement de tools, validation zod.
4. **Tools — reads** (17). Mapping direct vers les helpers de queries existants.
5. **Tools — writes** (28) avec logging dans `agent_actions`.
6. **Tools — intents** (4) : appellent les helpers `src/lib/llm/*` existants, respectent settings local LLM (slice 1 prereq).
7. **`get_writing_guide`** : contenu rédigé, testé en lecture par mcp inspector.
8. **UI `/agent-activity`** : route + table paginée + filtres minimaux.
9. **Doc setup** : `docs/demo/mcp-server-setup.md` — comment installer, configurer Claude Desktop, tester avec mcp inspector.

## Critères de validation

- typecheck ✓ · lint ✓ · Vitest ✓ · build ✓ pour le monorepo entier (app + mcp-server)
- mcp inspector connecté en local : tous les tools listés, schémas valides, appels reads/writes/intents fonctionnels
- Smoke test scripté : créer note → auto_extract → create_entity → create_chapter (avec first_event) → append_chapter_version → upscale → propose_canon → set_entity_field, vérifier `agent_actions` (writes loggés) et `runs` (intents loggés).
- Claude Desktop pairé : agent peut lire le world et faire au moins une action write end-to-end.
- `/agent-activity` montre les rows créées, regroupées par `agent_session_id`.

## Pre-requisites

- Slice 1 (Local LLM) **non bloquante** mais préférable : si non livrée, les 4 intents passent par cloud OpenAI uniquement (existant). Si livrée, les intents respectent les per-task settings → l'agent peut driver des features token-heavy à coût zéro.

## À noter post-slice (futur 2b et au-delà)

- **Filtrage par rôle** au démarrage (`--role=research`) si besoin de contraintes dures multi-agents.
- **Streaming** : transport SSE plutôt que stdio si on veut piper l'output progressivement vers un client web custom.
- **Idempotency keys** si on observe des dups réelles.
- **Présence/awareness** : afficher "agent is currently active" dans l'app si une session MCP est ouverte (pour éviter les conflits humain/agent éditant simultanément).
