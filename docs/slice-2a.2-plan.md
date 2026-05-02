# Slice 2a.2 plan — MCP intent tools

**Status** : à coder. Spec figée dans [docs/post-v1-mcp-server.md § Intents](./post-v1-mcp-server.md). Ce doc = plan exécutable, à lire avant de coder.

## Objectif

Ajouter les 4 outils LLM-driven manquants au MCP server pour que l'agent puisse pas juste lire/écrire la DB, mais aussi déclencher les opérations LLM existantes (extract, propose canon, upscale, summarize).

Au bout de cette slice, le MCP server expose 51 tools (47 + 4) et l'agent peut driver le flow complet d'écriture autonome.

## Contraintes

- **Respect des settings local-vs-cloud** (slice 1, V014). Si l'user a configuré local LLM pour une tâche donnée, l'intent route vers son endpoint. Sinon cloud OpenAI via edge fn.
- **Logging double** : chaque intent log dans `runs` (table existante depuis V002, kind `auto_extract`/`upscale`/`propose_updates`/`summarize`) ET dans `agent_actions` (envelope existante).
- **Pas de mock par défaut** côté Node — la mock impl actuelle (`src/lib/llm/mock.ts`) gate par `import.meta.env.VITE_LLM_MOCK`, qui n'existe pas Node-side. On droppe le mock côté MCP : si l'user veut tester sans LLM, il appelle directement les writes.
- **Aucune nouvelle migration**. `runs.provider` accepte déjà `'local'` et `'openai'` depuis slice 1.

## Architecture cible

```
packages/mcp-server/src/
  llm/
    transport.ts     # cloud (edge fn invoke) + local (fetch) — port from src/lib/llm/transport.ts
    routing.ts       # pickTransport(settings, task) — port from src/lib/llm/routing.ts
    prompt.ts        # PCC + entity context builders — port from src/lib/llm/prompt.ts
    extract.ts       # auto_extract task — port + node-ify
    proposeCanon.ts  # propose_canon task — port + node-ify
    upscale.ts       # upscale task — port + node-ify
    summaries.ts     # summarize task — port + node-ify
    runsLog.ts       # logRun helper — port from src/lib/queries/runs.ts logRun()
    settings.ts      # readUserSettings(supabase, ownerId) → typed UserSettings
  tools/
    intents.ts       # registerIntentsTools(server, ctx) — wires the 4 tools
```

## Tasks (ordre suggéré)

1. **Port `llm/transport.ts`** (~150 lignes)
   - `llmCall(body, mode)` → cloud via `supabase.functions.invoke('llm-call', {body})` (le service role a l'auth pour invoke), local via `fetch(${endpoint}/chat/completions)`.
   - `LlmCallError` typé avec `retryable` flag.
   - `llmCallWithRetry` retry-once sur transient (network/5xx/timeout/429).
   - **Différence clé Node vs browser** : pas d'`AbortController` côté browser session ici → garder simple, juste un `setTimeout` sur fetch local pour timeout 60s.
   - Tests : porter `transport.test.ts` (les mocks fetch marchent identique sous vitest node env).

2. **Port `llm/routing.ts`** (~80 lignes)
   - `pickTransport(settings, task, fallbackTier, opts)` : local ssi (a) toggle on, (b) endpoint set, (c) per-task model non-empty, (d) `forceCloud` non passé. Sinon cloud avec tier mapping.
   - **Différence Node vs browser** : aucune, c'est de la logique pure.
   - Tests : porter `routing.test.ts`.

3. **Port `llm/settings.ts`** (~30 lignes nouveau)
   - `readUserSettings(supabase, ownerId): Promise<UserSettings>` — single-row select sur `user_settings` filtré `owner_id`. Retourne `null` si pas de row, ou un objet typé avec tous les champs slice-1 (toggle, endpoint, 4 per-task models, 4 per-task tiers).
   - Pas de tests (juste un select).

4. **Port `llm/prompt.ts`** (~50 lignes)
   - PCC builder (`buildPccBlock(pccArray)` — concat les `{level, text}` en un bloc texte préfixé).
   - Entity context builder (`buildEntitiesContext(entities, fieldsByType)` — formatte name/type/snapshot).
   - **Différence Node vs browser** : aucune.
   - Tests : porter `prompt.test.ts`.

5. **Port les 4 task files** (~100 lignes chacun)
   - **`extract.ts`** : prompt → return `{candidates: [{name, type_id?, ...}]}`. Schéma Zod conservé. La signature côté MCP : `autoExtract(supabase, settings, {note_id})` qui lit la note + ses note_entities existantes pour exclure les déjà-extraits, log `runs` kind=`auto_extract`, return les candidates à l'agent.
   - **`proposeCanon.ts`** : prompt → return `{events: [{title, description, entityDiffs: [...]}]}`. Lit le chapter + final_version_text + chapter_events existants pour skip ce qui est déjà canon. Log `runs` kind=`propose_updates`. Return les events à l'agent.
   - **`upscale.ts`** : prompt → texte amélioré. Inputs : chapter + draft text + user_prompt + optional PCC. **Écrit direct** : insère un nouveau `chapter_versions` (origin=`upscale`, devient final via update `chapters.final_version_id`). Log `runs` kind=`upscale`. Return le `{version_id, text}`.
   - **`summaries.ts`** : prompt → résumé pour level s/m/l. **Écrit direct** : update `chapters.summary_{level}`. Log `runs` kind=`summarize`. Return le `{level, text}`.
   - Tests : porter les `.test.ts` correspondants pour chaque (mocks LLM fetch, vérif des prompts + parsing).

6. **`tools/intents.ts`** : 4 tools wirés sur les helpers ci-dessus
   - `auto_extract_from_note(note_id)` → split, retourne candidates
   - `propose_canon_from_chapter(chapter_id)` → split, retourne events
   - `upscale_chapter(chapter_id, user_prompt, include_pcc?)` → one-shot, retourne `{version_id, text}` après insert
   - `summarize_chapter(chapter_id, level)` → one-shot, retourne `{level, text}` après update
   - Chaque tool : log dans `agent_actions` après succès (action_kind = nom du tool, target_kind=`note` ou `chapter`).

7. **Wirer dans `register.ts`** : décommenter `registerIntentsTools(server, ctx)`.

8. **Tester end-to-end** :
   - mcp inspector : `auto_extract_from_note` sur une note réelle → vérif candidates returnées + row dans `runs` + row dans `agent_actions`
   - Claude Code lui-même via le MCP `mcp__world-builder__*` : ask l'assistant *"extract entities from note X"* → il doit appeler `auto_extract_from_note` puis `create_entity` pour chacune des candidates qu'il valide.
   - Vérif live UI : `/agent-activity` montre la séquence intent + writes ; `/runs` montre l'appel LLM avec le bon `provider` (local ou openai) selon les settings de l'user.

## Critères de validation

- typecheck + lint + vitest (~30 nouveaux tests, vis. portage des 4 task tests + transport + routing + prompt) ✓
- 51 tools listés dans mcp inspector (47 actuels + 4 nouveaux)
- Smoke scripté end-to-end : note → `auto_extract` → l'agent crée les entities → `propose_canon` sur un chapter → l'agent applique → `upscale` + `summarize` → `final_version_id` change + summaries set
- En mode local LLM (slice 1 toggle on + per-task models set), les 4 intents passent par `${endpoint}/chat/completions` et `runs.provider = 'local'`. En mode cloud, idem mais `provider = 'openai'`.

## Open questions à trancher au moment de coder

- **`auto_extract` skip-already-extracted** : reproduire la logique browser-side qui exclut les entities déjà liées via `note_entities` ? Probablement oui — pas de raison de re-proposer ce que l'user a déjà accepté.
- **`upscale` PCC inclusion** : par défaut `include_pcc=true` ? Ou laisser l'agent choisir explicitement ? La browser-side UI l'inclut par défaut. Penche pour same default.
- **Intent fail mid-flight** : si l'écriture en DB échoue après un appel LLM réussi (ex: insert chapter_versions fail), le run est déjà loggé. Pas grave — la row LLM-only dans `runs` est utile pour debug. L'agent retry = nouvelle row.
- **Cancel / timeout côté Node** : pas de UI pour cancel. On set un timeout généreux (60s) sur le transport et on laisse l'agent décider.

## Estimation

Une session focus de ~1h-2h de coding effectif (~600 lignes nouvelles + tests). Pas de migration, pas de UI. Fin = MCP server complet à 51 tools, slice 2a fully closed.

Slice 2b ensuite (agents qui consomment) — majoritairement docs.
