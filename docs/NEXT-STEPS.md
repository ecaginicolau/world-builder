# Next Steps

Document vivant — TODO + liens vers les docs thématiques. Mis à jour au fil des discussions.

## Status (2026-05-07, slice public-reader — partage de book + annotations livré, en attente de validation live)

**Slice "public reader" (post-v1, ergonomie auteur ↔ lecteurs externes) livrée côté code. V016 appliquée. Build + typecheck + lint 0 erreur + 137 Vitest ✓ + 6 Playwright ✓ + prod build ✓.**

Voir **[docs/demo/public-reader.md](./demo/public-reader.md)** pour le walkthrough complet (auteur create link → reader incognito → annoter → auteur voir feedback).

### Migration V016 (appliquée)

3 nouvelles tables :
- `share_links` (id, owner_id, world_id, book_id, token unique 32-char, label, active, allow_comments, include_drafts, expires_at, created_at). RLS owner full-access.
- `reader_sessions` (id, share_link_id, reader_local_id, name, first/last_seen_at, unique(share_link_id, reader_local_id)). RLS owner-read via join.
- `reader_annotations` (id, share_link_id, reader_session_id, chapter_id, kind in ('up','down','comment'), selected_text, before_ctx, after_ctx, comment_body, created_at). RLS owner-read + owner-delete via join.

### Edge function `public-reader` (à déployer par user)

`supabase/functions/public-reader/index.ts` — service-role, no JWT verify. 5 actions : `resolve_link`, `register_session`, `get_chapter`, `post_annotation`, `delete_my_annotation`. Validation token+active+expiry à chaque appel. Rate limit 60 annotations/h/session. Cross-book guard sur les annotations. Visibilité chapter respecte le flag `include_drafts` du link.

À déployer via `supabase functions deploy public-reader --no-verify-jwt`.

### Livré

- **Reader app autonome** (`/r/$token`, `/r/$token/c/$chapterId`) — pas d'auth requise, RootLayout fait l'exemption pour les paths `/r/*`. Shell isolé (`reader.css` scoped sur `.reader-shell`), theme dark/light persistant, modal d'identité (name max 60 chars, localStorage `reader:identity:<token>`).
- **Selection toolbar** (`SelectionToolbar.tsx`) — apparaît sur `selectionchange` debounced 60ms, positionnée sous la sélection (au-dessus si pas la place), 3 boutons 👍/👎/💬. Comment popover sur desktop, modal full-screen sur mobile <640px.
- **Anchoring** (`anchorAnnotations.ts` + `renderAnnotatedHtml.ts`, pure & testés) — match `before_ctx + selected_text + after_ctx` puis fallback first-occurrence du `selected_text`. Annotations orphelines (texte introuvable) listées en sidebar côté auteur, pas highlightées inline.
- **Author UI** :
  - `SharePanel` ajouté en bas de `BookDetailScreen` (create/list/copy/toggle-active/delete).
  - `ShareLinkDetailScreen` (`/worlds/$worldId/books/$bookId/shares/$linkId`) avec 2 tabs Readers / All feedback. Toggles inline pour active/comments/drafts.
  - 4ème tab **Feedback (N)** dans `ChapterScreen` à côté de Versions/Summary/Chat, avec liste groupée par reader, focus sur clic, delete avec confirm.
  - **Margin dots** colorés (vert/rouge/jaune) sur la gouttière gauche de l'éditeur, click → switch tab Feedback + focus item. Recalcul sur scroll/resize.
  - Deeplink `#ann=<id>` dans l'URL d'un chapter → auto-switch tab Feedback + focus item au mount.
- **Tests** : 3 nouveaux fichiers Vitest (17 tests : anchor, selection capture, render HTML). 1 spec Playwright (2 tests : `/r/<bad>` ne redirige pas vers login).
- **Demo guide** : [docs/demo/public-reader.md](./demo/public-reader.md).

### Décisions tranchées

- **Token = 32-char hex** (`crypto.randomUUID().replace(/-/g,'')`). Unguessable.
- **Edge function service-role plutôt que RLS public-anon** — boundary serveur unique, validation token centralisée, plus simple à raisonner.
- **Reader voit seulement SES propres annotations** (v1). Pas de social entre bêta-lecteurs.
- **Visibilité chapter par link** : `include_drafts=false` (default) → seuls `status='published'` visibles. `include_drafts=true` → tous les chapters avec `final_version_id`. Les chapters vides (sans final_version) ne sont jamais exposés.
- **`expires_at` default = +30 jours**. Override via picker custom date OU "No expiration".
- **`allow_comments=false`** désactive seulement `kind='comment'` ; up/down restent possibles.
- **Suppression côté reader** : oui, leurs propres annotations seulement (vérif `reader_session_id`). Pas d'édition.
- **Anchoring fail-soft** : annotations orphelines listées côté auteur, pas drift silencieux.
- **Rate limit 60/h/session** : suffisant pour bêta-lecteurs réels, pas un anti-spam blindé.
- **Highlights auteur en marge gauche** plutôt que sur le texte directement — n'interfère pas avec la frappe Tiptap.

### À pilote live (étape user)

- Apply V016 ✓
- Deploy edge function `public-reader`
- Pilote manuel selon `docs/demo/public-reader.md` (auteur + reader incognito + mobile emulation pour la selection toolbar)

### À reprendre dans une prochaine session — point d'entrée

À déterminer après pilote. Si la sélection mobile pose problème → refactor SelectionToolbar avec un bouton flottant persistant. Sinon, prochain chunk libre (notif auteur sur nouveau commentaire ? scroll auteur vers anchor inline ?).

---

## Status (2026-05-02 nuit++, slice 2a.1 — MCP server reads + writes livrés et validés live)

**Slice 2a.1 (post-v1, vision v2 IA externe — partie reads/writes) livrée et validée end-to-end. V015 appliquée. Build + typecheck + lint + 120 Vitest ✓ + prod build ✓. MCP wired dans Claude Code via `.mcp.json` project-scoped — les 47 tools sont accessibles côté assistant pendant les sessions de dev.**

Voir **[docs/demo/mcp-server-setup.md](./demo/mcp-server-setup.md)** pour le walkthrough setup + verify (mcp inspector + Claude Desktop).

### Migration V015 (appliquée)

- `agent_actions` (id, world_id, owner_id, agent_session_id, action_kind, target_kind, target_id, payload jsonb, created_at) + 2 indexes `(world_id, created_at desc)` et `(agent_session_id)` + RLS owner-scoped. Idempotent.

### Livré

- **Monorepo npm workspaces** : `packages/mcp-server` ajouté en workspace, app racine inchangée. Scripts root : `npm run mcp:build`, `mcp:dev`, `mcp:typecheck`. Bin linké en `node_modules/.bin/world-builder-mcp` via npm workspaces.
- **MCP server scaffolding** ([packages/mcp-server/src/index.ts](../packages/mcp-server/src/index.ts)) : transport stdio, env validation zod (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`), service-role Supabase client, `agent_session_id` (uuidv4) généré au démarrage, `logAction` helper qui insère dans `agent_actions` (writes only, fire-and-forget). Standard return envelope `{ok, data} | {ok, error}` JSON-stringifié dans un text content block.
- **`get_writing_guide`** ([packages/mcp-server/src/guide.ts](../packages/mcp-server/src/guide.ts)) : retourne `{world_memory, custom_prompt, flow_recipe (7 steps), business_rules (8), conventions (rank format, field kinds, pinning)}`. À tuner dans 2b selon comment Claude Desktop / claude-code consomment ce briefing.
- **18 read tools** (non loggés) : `list_worlds`, `get_world`, `get_writing_guide`, `list_notes` (FTS optionnel), `get_note`, `list_entities` (snapshot resolved), `get_entity` (+ type + snapshot), `get_entity_state_at_rank` (per-field walk), `list_entity_versions`, `list_entity_types`, `list_events`, `get_event` (+ linked_chapters + participants), `list_chapters`, `get_chapter` (+ final_version_text + linked_events + participants), `get_chapter_summary`, `get_pcc` (renvoie l'array configuré dans `worlds.previous_chapter_context`), `list_books` (avec parts[] embedded), `search` (FTS notes/chapters/entities). Toutes les queries sont scopées `owner_id = OWNER_USER_ID`.
- **29 write tools** (tous loggés via `logAction`) :
  - **Notes (3)** : `create_note`, `update_note`, `delete_note`.
  - **Entities (5)** : `create_entity` (insère auto la v0 init avec `initial_fields`, rollback en cas d'échec), `update_entity` (metadata: name/aliases/tags/type), `set_entity_field` (race-safe insert-then-update-on-conflict reproduisant exactement le pattern d.x de l'app), `reset_entity_field` (delete row si snapshot vide ET event-anchored), `delete_entity`.
  - **Events (3)** : `create_event` (chronological_rank optionnel — append à la fin sinon), `update_event`, `delete_event`.
  - **Chapters (5)** : `create_chapter` (first_event_title REQUIS — règle métier slice d, insère event + chapter_events link en chaîne avec rollback), `update_chapter` (status='published' set published_at), `delete_chapter`, `append_chapter_version` (origin manual_edit/upscale, make_final default true), `set_chapter_final_version` (rollback à un draft antérieur).
  - **Books/Parts (6)** : `create_book`, `update_book`, `delete_book`, `create_part`, `update_part`, `delete_part`.
  - **Liens (7)** : `link_event_to_chapter` (narrative_rank optionnel), `unlink_event_from_chapter`, `update_chapter_event` (reorder narratif), `link_entity_to_event` (pinned default true), `unlink_entity_from_event`, `link_entity_to_chapter`, `unlink_entity_from_chapter`.
- **`/agent-activity` UI** ([src/features/agentActivity/AgentActivityScreen.tsx](../src/features/agentActivity/AgentActivityScreen.tsx)) : table paginée (50/page), filtres session (dropdown auto-rempli depuis 1000 rows récentes), target_kind, range (today/7d/30d/all), expand row → JSON payload. Lien "Agent activity →" ajouté dans `MonitoringPanel` header à côté de "View all →" (runs).
- **Doc setup** : [docs/demo/mcp-server-setup.md](./demo/mcp-server-setup.md) — env vars, mcp inspector smoke, config Claude Desktop, troubleshooting.

### Décisions tranchées

- **Auth = service role key + filtrage applicatif `owner_id`**. RLS bypass mais sécurité app-side. La policy RLS reste définie pour la cohérence (l'UI app utilise le anon key et a besoin de la policy).
- **`agent_session_id` = uuidv4** généré au démarrage du process. Pas de ULID-ordering, le `created_at` suffit pour ordonner.
- **Reads non loggés** dans `agent_actions` (signal/bruit). Seuls les writes peuplent la table.
- **Standard envelope** `{ok, data} | {ok: false, error}` JSON-stringifié dans un text content block. `isError: true` setté côté MCP sur les fail. Uniformité agent-side.
- **Race-safe upsert** sur `set_entity_field` : INSERT avec `select.single()` puis UPDATE-on-conflict via fetch+merge (code 23505). Identique au pattern de l'app `useUpsertEntityField`.
- **`create_chapter` first_event_title obligatoire** : enforce la règle métier slice d ("a chapter cannot exist without at least one linked event") au niveau du tool, pas juste documenté dans la guide.
- **Pas de chat tool exposé** (cf. spec). Le chat de l'app sert l'humain↔LLM ; un agent qui chatte avec lui-même n'a pas de sens.
- **Pas d'idempotency keys en v1**. Si l'agent réessaie, c'est une nouvelle row. À ajouter si frottement réel.
- **`list_entity_types` ajouté** au-delà des 17 reads de la spec : indispensable pour que l'agent sache quel `type_id` passer à `create_entity`. Total = 18 reads.

### Validation

- typecheck root (app + mcp-server via tsc -b project references) ✓ · lint 0 erreur (1 warning pré-existant `router.tsx`) ✓ · 120 Vitest ✓ (rien cassé côté app) · build prod ✓
- **Live validation OK** :
  - mcp inspector v0.21.x : configuré (Command=`node`, Arguments=`<abspath>/packages/mcp-server/dist/index.js`, env vars dans la section dédiée), 47 tools listés, handshake OK
  - **Claude Code project-scoped via `.mcp.json`** ([template `.mcp.json.example`](../.mcp.json.example) commité, vrai `.mcp.json` gitignored) — au prochain restart de session les `mcp__world-builder__*` apparaissent dans les tools de l'assistant
  - Claude Desktop : path JSON est `%APPDATA%\Claude\claude_desktop_config.json` (le folder n'est créé qu'à la première utilisation des dev settings)
- **Note inspector v0.21.x** : la doc demo a été mise à jour, l'ancien invocation `npx @modelcontextprotocol/inspector --env KEY=VAL ... npx world-builder-mcp` ne marche plus (le flag parser dump `--env` dans le champ Command). Utiliser `npx @modelcontextprotocol/inspector` sans args puis configurer via la sidebar UI.

### À reprendre dans une prochaine session — point d'entrée

**Slice 2a.2 = les 4 intent tools** (`auto_extract_from_note`, `propose_canon_from_chapter`, `upscale_chapter`, `summarize_chapter`).

**Plan exécutable** : **[docs/slice-2a.2-plan.md](./slice-2a.2-plan.md)** ← à lire avant de coder. Tasks ordonnées, contraintes, open questions, estimation ~1h-2h focus.

Une session suffit. Ensuite slice 2b (agents qui consomment), majoritairement documentaire.

---

## Status (2026-05-02 nuit, slice 1 — Local LLM provider livrée)

**Slice 1 (post-v1, vision v2 IA externe) livrée. V014 appliquée. Smoke Chrome live OK sur la persistance des settings.**

Voir **[docs/demo/local-llm-setup.md](./demo/local-llm-setup.md)** pour le walkthrough setup + verify.

### Migration V014 (appliquée)

- `user_settings`: ADD `local_llm_enabled boolean default false`, `local_llm_endpoint text`, `extract_local_model text`, `proposals_local_model text`, `upscale_local_model text`, `summaries_local_model text`. Idempotent.
- `runs`: rien à faire — `provider` et `model` existent depuis V002, peuplés `'local'` + nom du modèle quand on route local.

### Livré

- **Transport layer** ([src/lib/llm/transport.ts](../src/lib/llm/transport.ts)) : `llmCall(body, mode)` qui dispatche entre cloud (via edge fn `llm-call`) et local (browser-direct fetch sur `${endpoint}/chat/completions` OpenAI-compat). `LlmCallError` typé avec `retryable` flag. `llmCallWithRetry` retry-once sur erreurs transient (network/5xx/timeout/429).
- **Routing layer** ([src/lib/llm/routing.ts](../src/lib/llm/routing.ts)) : `pickTransport(settings, task, fallbackTier, opts)` décide cloud-vs-local. Local ssi (a) toggle on, (b) endpoint set, (c) per-task model non-empty, (d) `forceCloud` non passé. Sinon cloud avec tier mapping.
- **4 task files refactorisés** (`extract.ts`, `proposeCanon.ts`, `upscale.ts`, `summaries.ts`) : chacun expose `<task>(req, opts: {transport, model})` (real) + `<task>Mock(req)` (env mock) + `get<Taskner>(settings, {forceCloud?})` qui choisit. Mock unchanged. Validation Zod conservée.
- **`user_settings` étendu** ([src/lib/queries/userSettings.ts](../src/lib/queries/userSettings.ts)) : nouveaux champs typés camelCase, hook `useUpdateUserSettings` accepte tous en patch. Cast explicite pour bypasser supabase-js generic-string-error inference sur le SELECT dynamique.
- **SettingsScreen — section Local LLM** : checkbox "Enable local LLM" save-on-change, endpoint URL save-on-blur (default placeholder `http://localhost:11434/v1`), 4 per-task model fields save-on-blur (default placeholder `qwen2.5:14b`). Setup hint + lien doc en bas. Saved indicator partagé avec les autres sections via état `local-llm`. Test-id complet (`local-llm-enabled`, `local-llm-endpoint`, `local-model-extract|proposals|upscale|summaries`).
- **"Try with cloud" UI** : ajouté dans **ProposeUpdatesModal** (phase error), **VersionsPanel** (upscale error, panel garde le prompt si onUpscale rethrow), **SummaryPanel** (error d'une longueur donnée). N'apparaît que quand `localLlmEnabled && per-task model set`. Auto-extract pas de bouton — la debounce-loop relance naturellement à la frappe suivante.
- **Call sites mis à jour** : `useAutoExtract.ts`, `ProposeUpdatesModal.tsx`, `ChapterScreen.tsx` (upscale + summarize) passent `settingsQ.data` à `get<Taskner>()`. ChapterScreen.onUpscale rethrow sur erreur (sinon le panel clear le prompt et la retry "Try with cloud" perdrait l'arg).

### Validation

- typecheck ✓ · lint ✓ (1 warning pré-existant `router.tsx`) · 120 Vitest ✓ (23 nouveaux : 10 routing + 13 transport) · 4 Playwright e2e ✓ · build prod ✓
- Smoke Chrome live sur Smoke Test World :
  - Section Local LLM rendue dans Settings, layout cohérent avec les autres sections. ✓
  - Toggle Enable → "Saved" badge, persistance après reload. ✓
  - Endpoint URL save-on-blur → persisté (`http://localhost:11434/v1`). ✓
  - Auto-extract model save-on-blur → persisté (`qwen2.5:14b`). ✓
  - Toggle off → enabled=false MAIS endpoint + per-task model conservés (kill-switch sans reset). ✓
  - Monitoring panel toujours fonctionnel (rows historiques cloud affichées). ✓
  - Live local LLM (Ollama, modèle `qwen3.6:latest`) validé par le user end-to-end : extract, propose canon, upscale tous fonctionnels. Latence sensiblement plus haute qu'en cloud comme attendu.

### Décisions tranchées

- **Provider tag = `'local'`** dans `runs.provider` (pas `'ollama'` ou `'openai-compat'`) — agnostique au runtime, suffit pour distinguer cloud vs local en monitoring.
- **`reasoning_effort` droppé** quand on appelle local (OpenAI-only knob, les runtimes locaux ignorent ou rejettent).
- **`stream: false`** explicite dans le payload local (Ollama default = stream=true qui casserait notre code de parsing).
- **Endpoint normalisé** : trailing slash retiré avant d'append `/chat/completions`.
- **Retry once seulement** (pas 2) sur erreurs transient. Les vrais échecs surfacent vite, le user clique "Try with cloud" si besoin. Pas de retry sur erreur payload (JSON invalide / content vide).
- **forceCloud explicit > silent fallback** : pas de fallback automatique cloud sur erreur local (sinon coûts cachés). Le bouton "Try with cloud" est la seule porte de sortie.
- **Pas de `chat` dans le scope** : extract, proposals, upscale, summaries seulement. Le chat (NoteScreen / ChapterScreen / EventScreen) continue de passer par `getLlm()` cloud — coût négligeable, et l'UX chat est plus sensible aux latences locales.

### À reprendre dans une prochaine session — point d'entrée

**Vision v2 IA externe — slice 1 livrée et committée.** Prochaine session = **slice 2a (MCP server)**, cf. spec figée **[docs/post-v1-mcp-server.md](./post-v1-mcp-server.md)**.

Démarrage slice 2a, en gros :

1. **Préparer la migration V015** (table `agent_actions` + RLS + indexes) — Claude rédige, le user applique avant code.
2. **Mini-refacto monorepo en npm workspaces** : restructurer en `packages/mcp-server` + `packages/app` (ou garder app à la racine, packages/ pour le seul MCP). Sharing de types `Database` et helpers de queries.
3. **Serveur MCP base** via `@modelcontextprotocol/sdk` côté Anthropic, transport stdio, validation Zod à la frontière.
4. **Tools** : ~17 reads + ~28 writes + 4 intents. Mapping direct vers helpers existants côté app. `get_writing_guide` rédigé.
5. **UI `/agent-activity`** dans l'app pour scroller les writes par session.
6. **Doc setup** `docs/demo/mcp-server-setup.md`.

Compter plusieurs sessions. Slice 2b (agents qui consomment) suit après, surtout documentaire — cf. **[docs/post-v1-mcp-agents.md](./post-v1-mcp-agents.md)**.

### Notes / améliorations possibles post-slice 1 à intégrer si frottement

- **Latence local** ressentie comme attendu sur Qwen3.6:latest (~30B). Si pénible : (a) descendre le modèle d'extract en 7B, (b) streaming SSE pour upscale/summaries (déjà dans `docs/post-v1-local-llm.md` § "À noter post-slice"), (c) split per-task cloud/local plus granulaire.
- **JSON-strict failures** sur petits modèles locaux : à voir si ça arrive en pratique, peut-être ajouter un retry avec prompt strengthened ("OUTPUT VALID JSON ONLY") avant le fallback cloud manuel.
- **Mention resolution sémantique** en chapter view (highlighter LLM-based, pas regex) — débloqué économiquement par slice 1.

---

## Status (2026-05-02 soirée, chunk (d.x) post-validation iterations livré)

**Itérations UX/data sur (d) suite à validation live par le user. V013 appliquée. 4 paquets livrés.**

Voir **[docs/demo/slice-d-x-iterations.md](./demo/slice-d-x-iterations.md)** pour le walkthrough.

### Migration V013 (appliquée)

- DROP du trigger `entity_versions_no_update` (entity_versions devient updateable)
- ADD policies RLS owner-scoped UPDATE + DELETE sur `entity_versions`
- ADD unique partial `entity_versions_per_event ON (entity_id, source_event_id) WHERE source_event_id IS NOT NULL` — au plus 1 version par (entity, event)

### Paquet 1 — Chapter reordering dans BookDetailScreen

Manquait depuis Slice 4 (jamais livré). Boutons ▲▼ ajoutés à gauche de chaque row chapter dans les `PartSection`, dispatch sur `useUpdateChapter({readingRank})` via les helpers `rankForMoveUp/Down(ranks: string[])`. Sort client-side pour bypass la collation case-insensitive Postgres (cf. bug Slice 7). `useUpdateChapter` étendu avec `readingRank?: string`.

### Paquet 2 — Editor EventScreen aligné sur NoteEditor

Le Tiptap maison de l'EventScreen ne déléguait pas le focus au click sur la zone et n'avait pas de hauteur min — UX cassée. Remplacé par le composant partagé `NoteEditor` (forwardRef + autosave debounce 400ms + entity highlights live + `min-h-[40vh]`). Sémantique préservée : autosave écrit `events.description_html` + `events.description` (plain) en parallèle.

### Paquet 3 — Autosave silencieux sur Manual edit + 📌 Snapshot

Avant : éditer une version `manual_edit` → banner jaune "Unsaved manual edits" + Save → nouvelle row à chaque correction. Trop verbeux pour les typos.

Après :
- **Draft (v0)** : autosave silencieux dans la même row (inchangé).
- **Manual edit (vN)** : autosave silencieux dans la même row (NEW). Banner haut du panel = "Editing in place · autosave on · 📌 Snapshot". Le bouton fork la row courante en nouvelle `manual_edit` (auto-final), permet de garder un point de retour avant de continuer à éditer.
- **Upscale (vN)** : comportement inchangé (banner jaune + Save as new version) → préserve le texte LLM original.

Wiring : `ChapterScreen.isEditingDraft` renommé `isEditableInPlace` (true pour `draft` ET `manual_edit`). Nouveau `onSnapshotManualEdit` lit `editorRef.getHTML()` synchroneusement pour bypasser le debounce. `VersionsPanel` reçoit `showSnapshotButton` + `onSnapshot` + `snapshotPending`.

### Paquet 4 — entity_versions per-field editable in place (BIG)

**Modèle delta** : chaque entity_version stocke uniquement les champs explicitement modifiés à son anchor. La résolution walk per-field — chaque champ remonte la timeline indépendamment, héritant de la dernière version qui l'a set.

Avant : propose-canon mergeait le snapshot courant avec les diffs LLM → chaque version dupliquait les fields inchangés. Pas d'edit in place. "— current —" anchor redondant avec "after dernier event".

Après :
- `useUpsertEntityField({entityId, eventId|null, fieldName, value, validFromRank})` — INSERT-then-fallback-UPDATE sur conflit unique (race-safe pour les blur handlers parallèles). `useResetEntityField` qui delete la row si snapshot becomes empty et event-anchored (init reste toujours).
- Nouveaux helpers `resolveSnapshotAtRank(versions, rank, fields)` (Map field → {value, source}), `resolveSnapshotMapAtRank` (flat record), `resolveSnapshotAtAnchor` (avec next-rank upper bound). Drop de `rankAfterEvent` (devenu inutile avec l'unique partial). Drop du `current` anchor de `buildAnchors`.
- ProposeUpdatesModal funnel — stocke direct `diff.fieldChanges` (plus de merge). Versions deviennent vraiment des deltas.
- EntityDetailScreen refonte : `FieldsEditor` inline avec autosave on blur, hint italique `(inherited from initial / earlier event / never set)`, bouton ↺ reset uniquement quand le field est explicitement set au current anchor. Default cursor = dernier anchor (current view) via `cursorId: null` + lazy fallback. AnchorVersionList et NewVersionModal supprimés.
- Consumers (ChapterScreen upscale entity cards, ReaderChapterScreen popup, EntitiesScreen inline preview) → tous switchent `resolveStateAtRank(...)?.snapshot[f]` → `resolveSnapshotMapAtRank(versions, rank, fields)[f]`.

### Validation

- typecheck ✓ · lint 0 erreur (1 warning pré-existant) · 97 Vitest ✓ (10 nouveaux : per-field walk, anchor windowing, init-only fallback) · build prod ✓
- Smoke Chrome live OpenAI sur Smoke Test World :
  - Chapter "Le sermon des cendres" créé via le form first-event-required, reorder avec les ▲▼ → Chapter 3 "test" remonté en 2.
  - EventScreen : click central focus l'éditeur, frappe live highlight les entities (Vieille Forteresse, Maitre Sorn, Iria), reload → texte persisté.
  - ChapterScreen : édit v2 manual_edit → pas de banner, count Versions stable. Click 📌 Snapshot → Versions (9) → (10), nouvelle row auto-sélectionnée.
  - "Propose canon" sur Confrontation → 2 events proposés (`Sorn brise le bras d'Iria`, `Edran reste impassible`) → Accept all → events créés et liés, badge `NO EVENTS LINKED` disparaît.
  - EntityDetailScreen Iria : default cursor = "after Découverte du messager mort". Click initial → set bio="Jeune femme intrépide" → 1 version créée. Click "after Maitre Sorn prêche" → set age=21 → 2ᵉ version (delta `{age: 21}` uniquement). Naviguer vers anchor postérieur → `age (inherited from earlier event) · 21`, `bio (inherited from initial)`. Naviguer vers anchor antérieur → `age (never set)` (pas de leak en arrière). ↺ reset disponible uniquement quand explicitement set.

### Décisions tranchées (d.x)

- **Hint visuel pour les valeurs héritées** = italique + opacité réduite + `(inherited from X)` en suffix. Discret, suffisant.
- **"— current —" anchor** = supprimé, redondant avec le dernier event anchor depuis le pivot canon.
- **Init v0** = éditable librement (important si on ajoute des champs au type).
- **`note_excerpt`** = pas touché lors d'un edit manuel (la justif LLM reste comme trace, sera écrasée au prochain propose-canon sur le même event si présent).
- **Race-safe upsert** = INSERT-then-UPDATE-on-conflict côté client (pas de SQL function, pas de PostgREST `.upsert()` qui ne supporte pas bien les partial unique indexes).
- **Per-field walk dans 1 fonction** = simpler que stocker des "snapshots complets" + checksum diff. Coût : O(versions × fields) par résolution, négligeable au scale auteur (≤200 entities, ≤50 versions chacune).
- **Pas de "Snapshot" sur draft v0** = le draft EST l'espace de travail. Snapshoter une version brouillon n'a pas de sens, l'user fork via Upscale ou via la première version Manual edit (fork au premier edit d'un upscale).

### À reprendre dans une prochaine session — point d'entrée

**Vision v2 brainstormée 2026-05-02 PM :** intégration IA externe en 2 slices indépendantes. Cf. § "Vision v2" ci-dessous.

- **Slice 1 (livrée — 2026-05-02 nuit)** : Local LLM provider. V014 appliquée. 4 tasks routables vers Ollama/LM Studio via toggle global + per-task model. Cf. **[docs/demo/local-llm-setup.md](./demo/local-llm-setup.md)** pour le setup.
- **Slice 2a (figée)** : MCP server exposant World Builder. ~17 reads + ~28 writes + 4 intents. Auth = service role local. Logging = nouvelle table `agent_actions` (writes only). Distribution = `packages/mcp-server` workspace, `npx world-builder-mcp` pour Claude Desktop. Migration V015. Spec complète : **[docs/post-v1-mcp-server.md](./post-v1-mcp-server.md)**.
- **Slice 2b (figée)** : agents qui consomment le MCP. Scope = 2b.1 (Drafting Agent V1/V2/V3) + 2b.2 (4 rôles via Claude Desktop Projects : Drafter, Continuity Checker, World Expander, Editor). Slice principalement documentaire (3 docs `docs/agents/*`) + tuning itératif de `get_writing_guide`. Aucune migration. Spec complète : **[docs/post-v1-mcp-agents.md](./post-v1-mcp-agents.md)**.

Candidats post-(d.x) toujours valides, à reprioriser après slice 1/2 :
- **Propose updates direct depuis EventScreen** (pas via le funnel chapter) — pour le canon side-of-the-house pur.
- **Re-analysis intelligente** dans le funnel : passer au LLM les events déjà liés + leurs diffs déjà acceptés pour qu'il propose UNIQUEMENT du nouveau (à la place du current "skip events already in canon" qui est plus grossier).
- **Auto-create entities** : autoriser le LLM à proposer des nouvelles entities dans le funnel (insert entities → events → versions séquentiel).
- **dnd-kit reorder** sur EventsCoveredPanel, TimelineScreen, BookDetailScreen — quand on dépassera 10+ items, les boutons ▲▼ deviendront pénibles.
- **Versioning de chapter au publish** — figer le `final_version_id` au moment du publish.
- **Stemming FR/EN dans search** — `worlds.search_lang` + switch `to_tsvector`.
- **(post-slice 1) Mention resolution sémantique** : pass LLM en chapter view qui détecte les références implicites aux entities (pronoms, sobriquets, descriptions) et les link en hover. Économiquement viable une fois le local LLM en place.

---

## Vision v2 — IA externe (brainstorm 2026-05-02 PM)

L'idée : aujourd'hui l'app est "humain-first, LLM-assist" (90% utilisateur, 10% IA intégrée). v2 = inverser le ratio dans un mode optionnel : "LLM-first, humain-arbitre" (10% utilisateur direction + arbitrage, 90% agent qui pilote l'app via MCP). Les deux modes doivent coexister (l'app reste full-featured pour l'écriture directe).

Deux slices indépendantes mais complémentaires :

### Slice 1 — Local LLM provider ✅ livrée

Cf. **[docs/post-v1-local-llm.md](./post-v1-local-llm.md)** (spec) et **[docs/demo/local-llm-setup.md](./demo/local-llm-setup.md)** (setup walkthrough). Livré 2026-05-02 nuit, V014 appliquée. Détails dans `## Status (2026-05-02 nuit, slice 1 — Local LLM provider livrée)`.

### Slice 2a — MCP server ✅ figée

Cf. **[docs/post-v1-mcp-server.md](./post-v1-mcp-server.md)**. Expose World Builder en serveur MCP, distribué via `packages/mcp-server` workspace + `npx world-builder-mcp`. Migration V015 = table `agent_actions` (writes only). ~17 reads + ~28 writes + 4 intents (split sur extract/propose, one-shot sur upscale/summarize). Auth service role local. Pas de chat tool exposé.

### Slice 2b — Agents qui consomment le MCP ✅ figée

Cf. **[docs/post-v1-mcp-agents.md](./post-v1-mcp-agents.md)**. Scope = 2b.1 (Drafting Agent en 3 variantes V1/V2/V3, default V2) + 2b.2 (4 rôles via Claude Desktop Projects : Drafter, Continuity Checker, World Expander, Editor). Pre-req : slice 2a livrée (MCP server) + slice 1 idéale (local LLM pour les intents).

Slice essentiellement documentaire :
- `docs/agents/system-prompts.md` — 3 Drafting + 4 rôles, prêts à coller dans Claude Desktop Projects
- `docs/agents/setup-claude-desktop.md` — walkthrough installation MCP + création des 4 Projects
- `docs/agents/recipes.md` — 5 recettes opérationnelles (Draft from scratch / Continuity audit / Expand entity / Polish for publish / Cascade Drafter→Editor)
- Tuning itératif de `get_writing_guide` (3-5 cycles courts)

Multi-LLM dans le scope sans effort :
- **Pilote** : Sonnet 4.6 ou Opus 4.7 selon Project (selector Claude Desktop)
- **Tools intents** : per-task local/cloud config héritée de slice 1

Multi-agent autonome multi-LLM = slice 3+ (agent custom SDK).

**Workflow type pressenti (Recipe A — Draft from scratch) :**
1. User ouvre Project "Drafter" dans Claude Desktop
2. User : "World 'Ashen Crowns'. Nouveau chapter où Iria affronte Sorn dans les ruines."
3. Agent V2 : `get_writing_guide` → 1 question créative (ton ? rythme ?)
4. User répond brièvement
5. Agent : note brainstorm → `auto_extract` → entities/events créées → `create_chapter` (avec first_event) → prose draft → `upscale` → `propose_canon_from_chapter` → diffs appliqués
6. User revient dans l'app, revue + accept/reject ponctuels, vue `/agent-activity` pour scroller ce qui a bougé.

---

## Status (2026-05-02 PM, chunk (d) Event upgrade + canonical pivot livré)

**Chunk (d) du plan post-v1 livré end-to-end. V012 appliquée. Smoke Chrome live OpenAI green.**

Voir **[docs/demo/slice-d-events-canon.md](./demo/slice-d-events-canon.md)** pour le walkthrough.

### Migration V012 (appliquée)

- `chapters.chronological_rank` → DROP (chrono d'un chapter = dérivé de `min(linked event chrono)`)
- `chapters.last_analyzed_at` → ADD (nouveau badge "Prose changed since last canon analysis")
- `entity_versions.source_chapter_id` → DROP, `source_chapter_version_id` → DROP IF EXISTS
- `entity_versions.source_event_id` → ADD + index partial
- `entity_versions_single_init` unique partial : exactement 1 version sans event source par entity
- `truncate entity_versions` (data de test, on reset)
- `chapter_events (chapter_id, event_id, world_id, owner_id, narrative_rank)` — M:M, cascade des deux côtés, RLS owner-scoped
- `event_participants (event_id, entity_id, world_id, owner_id, pinned_manually)` — calque chapter_participants, RLS owner-scoped
- `events.description_html` → ADD (Tiptap mini)
- `chat_threads.parent_kind` CHECK étendu pour autoriser `'event'`

### Livré

- **Data layer** : nouvelles queries `chapterEvents.ts` (link/unlink/reorder narrative_rank + byChapter/byEvent/byWorld) et `eventParticipants.ts` (link/unlink). `useCreateEntityVersion` accepte `sourceEventId`. `useEvents`/`useEvent` exposent `description_html`. `useCreateChapter` accepte un argument `firstEvent` qui insère event + `chapter_events` dans la même transaction d'app.
- **Helpers** : `chronoDerive.ts` (`buildChapterChronoMap`, `buildEventChaptersMap`) — chrono dérivé, base de toute résolution. `versioning.ts` refactor : `buildRankPickerItems(chapters, events, chapterChrono?)` skip chapters sans chrono dérivé ; `rankAfterChapter` → `rankAfterEvent`. `pcc.ts` prend désormais `chapterChrono` map au lieu de `chapter.chronological_rank`. `timelineItems.ts` simplifié à `sortEventsByChrono` + `rankForMoveUp/Down(string[])`.
- **Routes** : nouvelle `/worlds/$worldId/events/$eventId` → `EventScreen`. Route `/timeline` conservée.
- **`EventScreen`** : layout 3-col (LinkedEntities + DetectedEntities | description Tiptap mini autosave | ChatPanel `parentKind='event'`). Header avec back-to-timeline, badge OFF-SCREEN conditionnel, position chrono `#k of N`, delete. Section "Told in chapters" = chips cliquables vers chaque chapter retelling.
- **`TimelineScreen` refonte** : list events-only triés chrono, ↑▼ reorder de `chronological_rank`, chaque row montre les chips chapters qui le retellent ; badge `OFF-SCREEN` si aucun ; create/edit/delete inline préservés ; click event → EventScreen. Plus d'insertion de chapters comme rows.
- **`ChapterScreen`** : `chronological_rank` retiré partout (résolution entity cards / PCC passe par `buildChapterChronoMap` puis fallback `CURRENT_RANK_SENTINEL`). Header : badges `NO EVENTS LINKED` (orange) et `Prose changed` (sky) ; bouton renommé `Propose canon` ; layout 3-col inchangé (LinkedEntities + DetectedEntities + nouveau **`EventsCoveredPanel`** en tête de l'aside gauche).
- **`EventsCoveredPanel`** : list linked events triés `narrative_rank`, ↑▼ reorder, ✕ unlink (l'event survit), `+ Link` (select des events non liés du world) et `+ New` (input title qui crée + link en une frappe). Warning rouge si 0 events.
- **`ProposeUpdatesModal` → funnel "Propose canon from chapter"** : LLM via nouveau helper `src/lib/llm/proposeCanon.ts` (zod schema `{events:[{title,description,entityDiffs[]}]}`, mock + openai providers). Modal affiche les events proposés, chacun avec checkbox par diff + justification quotes ; Accept = transaction app séquentielle (insert event → chapter_events → event_participants → entity_versions avec `source_event_id` + `rankAfterEvent`). Mute `chapters.last_analyzed_at` au run pour clear le badge "Prose changed".
- **Forced ≥1 event sur création de chapter** : 2 entry points couverts. (1) `BookDetailScreen` → form 2-inputs (chapter title optional + first event title required) + helper text. (2) `PromoteToChapterModal` → input "First event title" required, pré-rempli depuis le titre de la note.
- **`PromoteToEntityVersionModal`** + bouton "Promote → version" sur NoteScreen : **supprimés**. **`NewVersionModal`** + bouton "+ New version…" sur EntityDetailScreen : **supprimés**. Remplacés par un hint "Updates flow through events" — pour modifier l'état d'une entity il faut maintenant passer par un event.
- **`ReaderChapterScreen`** : popup entity utilise `CURRENT_RANK_SENTINEL` (chapter n'a plus de chrono propre). Per la macro-décision "current state suffit pour v1".
- **`ChatPanel` & `runs`** : `ThreadParentKind` étendu à `'event'`. `runs.parentKind` étendu à `'event'`.

### Validation

- typecheck ✓ · lint ✓ (1 warning pré-existant, react-refresh sur `router.tsx`) · 96 Vitest (13 nouveaux : 7 chronoDerive + révisions versioning/timelineItems/pcc) · 4 Playwright e2e ✓ · build prod ✓
- Smoke Chrome live OpenAI sur Smoke Test World :
  - Timeline events-first, badges OFF-SCREEN visibles sur events legacy. ✓
  - Création chapter via Books — form forcé à first event, redirect vers ChapterScreen avec EVENTS COVERED (1) et le nouvel event apparaît dans la timeline avec son chip "📖 Le sermon des cendres". ✓
  - "Propose canon" sur Confrontation à la forteresse → 2 events proposés ("Sorn brise le bras d'Iria" + "Edran reste impassible") avec diffs Iria.bio et Edran Voss.bio + justifications citant la prose. Accept all → events créés et liés, badge `NO EVENTS LINKED` disparaît, panel passe à EVENTS COVERED (2). ✓
  - Run loggué (`propose_updates · 3199ms`) en Monitoring. ✓
  - EventScreen sur l'event #3 : header back/chrono pos/delete, "Told in chapters: 📖 Le sermon des cendres", description editor + ChatPanel. ✓
  - Iria EntityDetailScreen : rail timeline montre les 2 nouveaux anchors `after 📅 Sorn brise le bras d'Iria · 1 update` et `after 📅 Edran reste impassible · 1 update`, snapshot current = nouvelle bio + alive=true ; le bouton "+ New version" est remplacé par "Updates flow through events". ✓

### Décisions tranchées (cf. § d du brainstorm)

- **Pas de dnd-kit** pour le narrative_rank reorder — simples boutons ↑▼ comme partout ailleurs (cohérent + simplest path).
- **Pas de "Propose updates from this event" direct** sur EventScreen pour cette slice : le funnel "Propose canon from chapter" couvre déjà la boucle. À ajouter en (d.x) si besoin.
- **Pas de Re-analysis "Run again"** dans le funnel — ré-ouvrir le modal et re-cliquer Run analysis suffit, le LLM reçoit la liste "Already in canon" pour éviter les doublons.
- **Pas d'auto-création d'entities** dans le funnel : LLM contraint aux entityIds des linked entities. Création via "+ Entity" reste manuelle. Élargissable en (d.x).
- **Chapter chrono dérivé = MIN linked-event chrono** (pas average / median). Cohérent avec l'idée "earliest event = where the chapter starts".
- **Card resolution rank dans ChapterScreen** : `chapterChrono.get(chapterId) ?? CURRENT_RANK_SENTINEL` — si chapter sans events liés, on tombe sur l'état courant (rare, transient, OK).
- **Reader popup state** : `CURRENT_RANK_SENTINEL` (per macro-décision "current state suffit pour v1, raffinement chrono fine = backlog").
- **`PromoteToEntityVersionModal` / `NewVersionModal`** : supprimés. Pas de chemin direct pour créer une entity_version sans event source. Question "edit in-place de v0" laissée en backlog (cf. § "À revisiter plus tard").

### À reprendre dans une prochaine session — point d'entrée

V1 + chunks (a)/(b)/(c)/(d) tous livrés. Pour le suivant : utiliser l'app sur un projet d'écriture réel quelques jours puis prioriser ce qui frotte le plus.

Candidats post-(d) sourcés du brainstorm :
- **(d.x) Propose updates direct depuis EventScreen** (pas via le funnel chapter) — pour le canon side-of-the-house pur.
- **(d.x) Re-analysis intelligente** : envoyer en contexte au LLM les events déjà liés + leurs diffs déjà appliqués, pour qu'il propose UNIQUEMENT du nouveau (à la place du current "skip events already in canon" qui est plus grossier).
- **(d.x) Auto-create entities** : autoriser le LLM à proposer des nouvelles entities dans le funnel (insert entities → events → versions séquentiel).
- **(d.x) dnd-kit reorder** sur EventsCoveredPanel et TimelineScreen — quand on dépassera 10+ items, les boutons ↑▼ deviendront pénibles.
- **(d.x) Versioning de chapter au publish** — déjà candidat avant (d).
- **(d.x) Stemming FR/EN dans search** — déjà candidat avant (d).

---

## Status (2026-05-02 PM, chunks (a)/(b)/(c) + type tabs livrés)

Chunks (a), (b), (c) du plan post-v1 livrés en une session, plus un ajout user-driven : tabs de filtre par type sur `/entities`. **Aucune migration appliquée** — toutes les features sont DB-compatible avec V010.

### Doc de chantier en cours

**[docs/post-v1-nav-canon.md](./post-v1-nav-canon.md)** — chunks (a) appbar ✅ / (b) entity types relégués ✅ / (c) page entities enrichie ✅ / (d) event upgrade ✅. Décisions tranchées + tasks détaillées + critères de validation.

### Livré cette session (PM)

- **(a) Appbar par mode** : 3 CSS vars `--mode-{brainstorm,canon,narrative}` dans [index.css](../src/index.css) ; [AppHeader.tsx](../src/components/AppHeader.tsx) réordonne les tabs en `[Notes] | [Entities · Timeline] | [Books · Read]` avec séparateurs visuels et bordure colorée sous le tab actif. Brainstorm = sky-300, Canon = amber-600, Narrative = rose-800.
- **(b) Entity types relégués** : [EntityTypesEditorModal.tsx](../src/features/entities/EntityTypesEditorModal.tsx) ouverte via bouton `⚙ Types` en haut à droite de `/entities`. La page perd la section "Entity types" du flow principal — la création d'entité reste, le `<select>` du type reste alimenté par `useEntityTypes`. Modale = create, list (chips colorés), delete, link "→ Edit fields" (vers la page detail existante).
- **(c) Page Entities enrichie** ([EntitiesScreen.tsx](../src/features/entities/EntitiesScreen.tsx)) :
  - Search bar debounced 150ms sur `name + aliases`.
  - "View as of" rank picker (chapitre/event) → résout le state via `resolveStateAtRank`.
  - Toggle "Hide dead" (conditionnel, apparaît si rank ≠ current) : si le type a un field bool `alive`, masque les entités où `alive === false` à ce rank.
  - Aperçu inline : 2 premiers fields `string`/`text` du type (hors `alive`), valeur résolue au rank courant. Sans migration `entity_types.preview_fields` : on prend automatiquement via le helper local `pickPreviewFields`.
  - Sort selector : Name (default) / Last update (max `entity_versions.created_at`) / First appearance (min `valid_from_rank`).
  - Nouvelle query bulk [`useEntityVersionsByWorld`](../src/lib/queries/entityVersions.ts) — invalide aussi par `byWorld` quand on crée une version.
- **Type tabs** (ajout post-(c) sur retour du user) : barre de tabs au-dessus de la liste, "All N" + un tab par type avec compteur. Tab actif = chip pastel + texte coloré (couleur du type). Quand un type unique est sélectionné, le heading de groupe est masqué (devenu redondant). Compteurs reflètent l'état post-search/post-hide-dead. Skip le scroll infini quand on aura 100+ entités.

### Validation

- typecheck ✓ · lint ✓ (1 warning pré-existant) · 87 Vitest ✓ · build prod ✓
- Smoke Chrome live (Smoke Test World, 7 entities) :
  - Appbar : 3 couleurs distinctes vues sur Notes/Entities/Books, séparateurs présents.
  - `/entities` : "⚙ Types" ouvre la modale, Items/Lieux/Personnages listés avec leurs couleurs.
  - Tabs : All 7 / Items 1 / Lieux 2 / Personnages 4. Click Personnages → 4 lignes affichées sans heading de groupe.
  - Search "iri" → filtre à Iria seulement, aperçu `bio:` correct.
  - Toolbar (rank picker, sort, hide-dead conditionnel) rendu correctement.

### À reprendre dans une prochaine session — point d'entrée

**Prochaine session = chunk (d) Event upgrade + pivot canonical** (gros chunk >1 journée).

Lire **[post-v1-nav-canon.md § d](./post-v1-nav-canon.md#d-event-upgrade--events-comme-source-canonique--funnel-dextraction-depuis-les-chapters)** pour le détail. Résumé exécutable :

1. **Migration V012** à préparer en début de session, à faire appliquer par le user avant de coder :
   - Drop `chapters.chronological_rank`, `entity_versions.source_chapter_id` (et `source_chapter_version_id` si V011 a été appliquée — ce n'est pas le cas)
   - Add `events.description_html`, `chapters.last_analyzed_at`
   - Add `entity_versions.source_event_id` + index unique partiel `entity_versions_single_init` (1 seule version sans event source par entity)
   - New table `chapter_events (chapter_id, event_id, narrative_rank)` — M:M, cascade delete des deux côtés
   - New table `event_participants (event_id, entity_id, pinned_manually)` — calque de `chapter_participants`
   - `truncate entity_versions` (data de test, on reset)
2. **EventScreen** = layout 3-col chapter-light (description Tiptap mini + LinkedEntitiesPanel/DetectedEntitiesPanel + ChatPanel).
3. **Refonte TimelineScreen** events-first (chips de chapters par event, marqueur off-screen).
4. **Funnel "Propose canon from chapter"** : LLM propose des events → accept → entity_versions générées avec `source_event_id`.
5. **M:M chapter_events** + drag-to-reorder du `narrative_rank` côté chapter (dnd-kit).
6. **Création de chapter forcée à ≥ 1 event** (rule métier, pas SQL).

Risque architectural : factoriser proprement chapter/event (chat + propose + linkSource) sans dupliquer 80% du code. Cf. la note "Risque architectural" dans § d.

---

## Et après ? (post-v1)

V1 = slices 0 → 8 toutes livrées. Plus de slice numérotée prévue dans le plan original. Pour la suite, les chantiers candidats se trouvent dans [docs/future-ideas.md](./future-ideas.md). En vrac, ce qui a le plus de valeur perçue (à re-prioriser en début de session future) :

- **Stemming FR/EN dans le search** — `worlds.search_lang` + switch sur `to_tsvector('french'|'english', …)` pour que `chevaux` matche `cheval`. Petit (1 colonne + V011 + un settings selector).
- **Versioning de chapitre au publish** — aujourd'hui le toggle est pur, pas de snapshot. Pour un vrai "canon stable", figer le `final_version_id` au moment du publish (plus retour facile en cas d'unpublish). Bigger (modèle DB).
- **Streaming SSE upscale + summaries** — aujourd'hui blocking, 5-30s. Streaming = UX premium, requiert refacto edge function `llm-call` pour pipe SSE → React.
- **Beta reader sharing** — lien magique read-only sur le Reader view. Auth token scoped au world. Slice ~moyenne.
- **Embeddings + recherche sémantique** — pgvector sur Supabase, à brancher quand on veut chercher par sens et plus juste par mot.
- **Détection de contradictions** — pass LLM périodique sur les chapters récents qui flag les incohérences avec les entity snapshots. Très fort produit, demande un budget runs.
- **Templates d'EntityTypes pré-faits** — Personnage / Lieu / Objet / Faction avec fields recommandés. Petit, valeur "onboarding".
- **Export EPUB / PDF** d'un book — pour l'auteur qui veut envoyer à un beta reader hors-app.

Recommandation pour la prochaine session : ne pas attaquer l'un de ces chantiers à froid, plutôt **utiliser l'app pour un projet d'écriture réel** quelques jours, puis prioriser ce qui frotte le plus en pratique.

---

## Status (2026-05-01 PM, Slice 8 livré et validé live — **v1 complète**)

**Slice 8 livré, V010 appliquée, validé live par le user.** Six features livrées :

1. **Reader view** (`/read` + `/read/:chapterId`) — TOC books → parts → chapters, page lecture typo prose, prev/next, mini-popup entity au state du chapter via `resolveStateAtRank`. Drafts inclus avec badge.
2. **Summaries S/M/L** — nouveau tab `Summary` dans le right panel ChapterScreen, generate par niveau via LLM (`src/lib/llm/summaries.ts`, tier `cheapest` par défaut, configurable). Save direct dans `chapters.summary_{s,m,l}`. 6 tests Vitest.
3. **PCC (Previous-Chapter Context)** — config `worlds.previous_chapter_context jsonb` editable via SettingsScreen (chips colorés, reorder ←/→, remove, add raw/L/M/S, reset to default). Default `[raw,L,M,S,S,S]`. Resolver `src/features/chapters/pcc.ts` avec fallback chain S→M→L→raw. Wiring upscale + chat-on-chapter via checkbox "Include previous N chapters". 12 tests Vitest.
4. **Search global** — modal Cmd+K (mounté global dans RootLayout), 3 requêtes parallèles via `.textSearch('search_text', q, {config:'simple'})` sur notes / chapter_versions / entities, résultats groupés. Bouton 🔍 dans AppHeader. Click → navigate.
5. **Chapter `published` flag** — toggle Publish/Unpublish dans le header ChapterScreen. Quand published : éditeur read-only, upscale/manual save/propose updates/summary generate tous désactivés. Badge `PUBLISHED` visible. Reader affiche aussi les drafts (badge DRAFT).
6. **Runs history** — page `/runs` avec filtres (kind, status, range today/7d/30d/all) + pagination 50/page + agrégats tokens. Footer Monitoring garde son comportement, ajoute "View all →".

**Demo guide** : [docs/demo/slice-8-reader-summaries-search-runs.md](./demo/slice-8-reader-summaries-search-runs.md).
**Plan détaillé** : [docs/slice-8-plan.md](./slice-8-plan.md).

### Migration V010 — galère IMMUTABLE

Première version utilisait des `tsvector` generated columns. Postgres a refusé : `to_tsvector('simple', text)` est STABLE (le cast `text → regconfig` dépend de search_path). Wrapper IMMUTABLE pas suffisant. Deuxième version : generated TEXT columns + expression GIN index. Toujours refusé. Troisième et finale : **trigger-maintained `search_text text` columns** (pas de generated, pas d'IMMUTABLE check) + GIN expression index avec `to_tsvector('simple', search_text)`. Bulletproof. Voir commentaires dans `V010__slice_8_search_pcc.sql`.

### Bug surprise fixé pendant le pilote

`chapter_versions` embed sur `chapters` failait avec `Could not embed because more than one relationship was found`. Cause : 2 FKs entre les deux tables (`chapter_versions.chapter_id` ET `chapters.final_version_id`). Fix : split en 2 requêtes (search + lookup par chapter_id séparé) dans `src/lib/queries/search.ts`.

### Validation Slice 8

- typecheck ✓ · lint ✓ · 83 Vitest ✓ (12 nouveaux PCC + 6 nouveaux summaries) · 4 Playwright ✓ · build prod ✓
- Smoke Chrome côté Claude : Worlds list, Reader page rendue, Settings PCC editor avec chips colorés default `[raw,L,M,S,S,S]`, Settings Summarize tier, Search modal Ctrl+K + query → "No results." (FTS pipeline fonctionne) ✓
- Validation live par le user (les 6 features sur un world peuplé) : ✓
- Polish session : ajout d'un `notFoundComponent` propre au root route avec un bouton "Back to your worlds" + hint sur le hard-refresh, parce que TanStack Router code-based + Vite HMR a un quirk où les nouvelles routes ajoutées en cours de session ne sont pas re-registrées avant un refresh complet.

### Décisions tranchées Slice 8

- **PCC ordering** : `chronological_rank` (cohérence narrative), pas `reading_rank`.
- **PCC fallback** : si summary manque, downgrade `S→M→L→raw`. Si même raw vide, le chapter est skip.
- **PCC checkbox** : default ON dans upscale et chat-on-chapter. Disabled visible quand `pcc.length === 0`.
- **Reader = tous les chapters** (badge DRAFT) — auto-relecture utile à l'auteur. "Published only" = setting toggle plus tard.
- **Search config** = `'simple'` (pas de stemming FR/EN).
- **FTS storage** = trigger-maintained `search_text text` (pas tsvector generated columns).
- **Summaries** : pas de versioning, overwrite à chaque generate.
- **Published** : flag pur, pas de snapshot. Bloque toutes les mutations chapter (manual edit, upscale, propose updates, summary generate, change final).
- **Runs page** : agrégats simples côté client sur la page courante.

---

## Status (2026-05-01 PM, Slice 7 livré et validé live)

**Slice 7 livré, V009 appliquée, full flow validé live OpenAI.** Boucle écriture → mise à jour entities :
- Le chapter n'a plus `draft`/`content` mais une **chaîne de versions de texte** (`chapter_versions`, append-only doux). v0 = draft, v1+ = upscales (généré par LLM avec user prompt) ou manual_edit (utilisateur édite + Save).
- **`chapters.final_version_id`** pointe la version courante. Toute nouvelle version devient automatiquement final. Radio "final" dans le panneau Versions pour basculer vers une autre.
- **Upscale** : panel droit avec textarea + Send (UX type chat). Prompt LLM = world memory + custom_prompt + entity cards résolues au `chronological_rank` du chapter + texte de la final version + user_prompt. Tier `best` par défaut. Output → nouvelle row `chapter_versions` (origin=`upscale`).
- **Propose updates** : bouton dans le header chapter → modal scan les linked entities, LLM (json mode) retourne `{ entityId, fieldChanges, justification }[]` validé Zod. Accept = create `entity_version` au `chapter.chronological_rank` avec `source_chapter_id` + `note_excerpt = justification`. Réutilise tout le scaffold Slice 6.
- **Tier per task** : `user_settings.{upscale,proposals,extract}_tier`, configurables dans SettingsScreen.

**Demo guide** : [docs/demo/slice-7-upscale-proposals.md](./demo/slice-7-upscale-proposals.md).
**Plan détaillé** : [docs/slice-7-plan.md](./slice-7-plan.md).

### Validation live Slice 7 (2026-05-01)

- ChapterScreen Confrontation à la forteresse : panneau droit Versions ⚡/Chat (tabs en haut), Versions actif par défaut, v0 — Draft visible avec radio final. Upscale form en bas. ✓
- Upscale prompt FR ("3 phrases courtes, paysage nocturne, faits inchangés") → OpenAI gpt-5.4 (tier `best`) répondu en ~6s avec un texte respectant la consigne ("Au pied de la Vieille Forteresse, sous un ciel sans lune où le vent râpait les pierres et les herbes noires…"). v1 — Upscale créée, devient final, l'éditeur affiche le nouveau texte. Highlights des entities appliqués. ✓
- Édition manuelle ("[edit manuel]" inséré) → bannière jaune "Unsaved manual edits" + bouton Save → v2 — Manual edit créée, final pointer bouge dessus. ✓
- Click radio "final" sur v1 Upscale → final repasse sur v1, v2 reste en read-only. ✓
- Propose updates → 4 entities en scope → Run analysis → 2 proposals (Maitre Sorn + Edran Voss, tous deux avec field `bio` proposé, avec justification LLM citant le chapter). Accept all → status "accepted" sur chaque card. Vérification DB : `entity_versions` créées avec `source_chapter_id = chapter.id` + `note_excerpt = justification` + `valid_from_rank = chapter.chronological_rank`. ✓
- Settings : 3 tier selectors visibles, sauvegarde immédiate. ✓
- Console clean (les `message channel closed` sont du bruit de l'extension Chrome).

### Bugs surprise fixés en cours

1. **False positive "unsaved manual edits"** sur HMR/remount : Tiptap fire `onUpdate` sur les transactions y compris programmatiques (initial setContent, decoration refresh). Fix : gate `onUpdate` avec `editor.isFocused && transaction.docChanged` dans NoteEditor — n'émet le callback parent que pour de vraies frappes utilisateur.
2. **Ordre des versions inversé** dans le panneau (Manual edit avant Upscale alors que rank 'j' > 'U') : Postgres default collation est case-insensitive donc `.order('rank')` côté serveur cassait l'ordre byte-wise du fractional indexing. Fix : sort côté client après fetch dans `useChapterVersions`. Note : les autres tables avec `rank text` (chapters, parts, books, events, entity_versions) ont **probablement le même bug latent** mais n'ont pas mordu jusqu'ici parce que les ranks sont restés du même cas. À surveiller, fix ciblé si on en voit un autre.

### Polish post-Slice 7 (live)

- **Pending feedback Upscale** : `createVersion.isPending` ne couvrait QUE l'insert DB (~50ms), pas le LLM call (~5-30s) → user pouvait cliquer plusieurs fois et créer N versions. Fix : état local `upscaling` dans ChapterScreen (true du clic à fin du try/finally), passé à VersionsPanel. UI : banner purple `⟳ Upscaling… (this may take 5–30s)` + bouton qui devient `⟳ Upscaling…` avec spinner + textarea disabled. Idempotency `if (upscaling) return;` au début de `onUpscale`. Validé : double-clic pendant pending → 1 seule nouvelle version créée. Même pattern Spinner appliqué à ProposeUpdatesModal "Analyzing chapter…".
- **Layout right panel overflow** : la VersionsPanel s'étirait à 754px et débordait la colonne 320px du grid. Cause : `<textarea>` HTML a un `cols` implicite (~20ch) qui force une largeur intrinsèque que `flex-1` ne contre pas. Fix : `min-w-0` sur le wrapper `<div className="flex-1">`, `w-full min-w-0` sur le root VersionsPanel, `w-full cols={1}` sur la textarea. Versions/Chat tabs ont maintenant la même largeur (320px).

### Décisions tranchées Slice 7

- **Plus de `chapters.draft` / `chapters.content`** — tout passe par `chapter_versions` ; migration data a backfillé un v0 row par chapter avec `text = ancien draft`.
- **Pas de streaming** (loader blocking, ~5-15s pour upscale, OK). Streaming = Slice 7.x si besoin.
- **Pas de propose-new-fields** (LLM ne propose pas d'ajouter un FieldDef au type, seulement des valeurs sur les fields existants). Slice 7.x si besoin.
- **Upscale source = always `final`** (pas la sélectionnée) : cohérent, l'user flag ce qu'il considère canonique.
- **Édition manuelle de v0 (draft) = autosave in-place**. Édition de toute autre version = nouvelle row au save explicite.
- **Pas de trigger SQL `prevent_modification` sur chapter_versions** (contrairement à entity_versions) — le draft a besoin d'UPDATE et l'app est responsable de jamais update les autres.
- **Tier per task** sur `user_settings` (3 colonnes dédiées) plutôt que dans `ui_prefs` jsonb.

---

## Status (2026-05-01 PM, Slice 6 livré et validé live)

**Slice 6 livré, V008 appliquée, full flow validé live.** Versioning append-only des entities + résolution "state at rank R" + vraies pages d'édition entity & entity_type + aliases enfin exposés.

**Demo guide** : [docs/demo/slice-6-versioning.md](./demo/slice-6-versioning.md) — walkthrough ~5 min.
**Plan détaillé** : [docs/slice-6-plan.md](./slice-6-plan.md).

### Validation live Slice 6

- EntityTypeDetailScreen : éditeur de fields (string|text|int|bool, required, reorder ↑↓, remove). Pour Personnages : ajouté `age (int) / bio (text) / alive (bool)`, save, fields persistés ✓.
- EntityDetailScreen sur Iria :
  - Aliases ajoutés "la jeune fille" + "lui" via Enter ✓.
  - "+ New version" au rank "📖 Confrontation à la forteresse" : age=17, bio=Jeune femme intrépide…, alive=true. Sauvegarde + retour fiche, "From version at 📖 Confrontation à la forteresse" affiché. Versions (2) avec "initial" + "at Confrontation…" + chips diff `age bio alive` ✓.
  - 2ᵉ version au rank "📅 Le resultat de la grande bataille" : age=18, bio=Capitaine de la garde… → Versions (3), 3ᵉ row chips diff `age bio` (alive unchanged donc absent) ✓.
  - Scrubber rank "📅 Rencontre à la Vieille Forteresse" → revient à v1 (age=17). Picker fonctionne pour la résolution state-at-rank ✓.
- Promote → version depuis NoteScreen :
  - 4ᵉ bouton "Promote → version" dans header NoteScreen ✓.
  - Modal : entity dropdown (toutes les entities du world avec leur type entre parens), rank dropdown chronologique, form auto-généré depuis le type de l'entity choisie, pré-rempli avec valeurs au rank choisi ✓.
  - Promote Maitre Sorn (Personnages) au rank Rencontre… avec age=55, bio=Vieux maître…, alive=true → redirect vers fiche Maitre Sorn, Versions (2) ✓.
- Console clean (les `message channel closed` sont du bruit de l'extension Chrome, pas de l'app).

### Ce qui a été fait dans Slice 6

- **V008** : `entity_versions` (entity_id + world_id + valid_from_rank + snapshot jsonb + source_note_id + source_chapter_id + note_excerpt) + trigger `prevent_modification` (BEFORE UPDATE) + index `(entity_id, valid_from_rank DESC)` pour la résolution O(log n) + RLS owner-scoped (SELECT/INSERT seulement, pas d'UPDATE/DELETE policies).
- **Sentinel** `INIT_RANK = '!init'` dans `src/lib/ranks.ts`. `'!'` (0x21) < `'0'` (0x30, premier char de l'alphabet base-62) donc lex < tous les ranks générés. Test ranks.test.ts ajouté.
- **Helpers `src/features/entities/versioning.ts`** :
  - `resolveStateAtRank(versions, rank)` : version la plus récente avec `valid_from_rank <= rank` (avec sentinel `~current` pour "latest").
  - `buildRankPickerItems(chapters, events)` : merge + sort lex par `chronological_rank`.
  - `versionLabelForRank(rank, items)` : "initial" / "at 📖 X" / "after 📅 Y" / "before timeline start".
  - `coerceFieldValue(kind, raw)` + `formatFieldValue(value)` + `diffSnapshots(prev, next)`.
  - **16 tests Vitest** dans `versioning.test.ts`.
- **Types** : `FieldKind = 'string' | 'text' | 'int' | 'bool'`, `FieldDef`, `Snapshot`, `EntityVersion` dans `src/features/entities/types.ts`.
- **Queries** : `src/lib/queries/entityVersions.ts` (`useEntityVersions`, `useCreateEntityVersion`, `ensureInitVersion`). `useEntity` + `useEntityType` ajoutées (lookups par id). `useUpdateEntity` étendu avec `aliases` + `tags`. `useUpdateEntityType` étendu avec `fields`.
- **Routes nouvelles** :
  - `/worlds/$worldId/entity-types/$typeId` → EntityTypeDetailScreen
  - `/worlds/$worldId/entities/$entityId` → EntityDetailScreen
- **EntitiesScreen refactor** : suppression de l'édition inline (name + type). Chips de type cliquables vers detail. Rows entity = `<Link>` vers la fiche. Quick-create reste.
- **NewVersionModal** + **PromoteToEntityVersionModal** : forms auto-générés depuis les `FieldDef` du type, type-specific input (`number` pour int, `textarea` pour text, `checkbox` pour bool, sinon `text`).
- **NoteScreen** : 4ᵉ bouton "Promote → version" dans le header.

### Décisions tranchées Slice 6 (cf. `docs/slice-6-plan.md`)

- **Field kinds v1** : `string | text | int | bool` seulement. `rel`/`relList` reportés.
- **Aliases** : édition exposée enfin (chip input avec Enter). La détection/highlight les utilisait déjà depuis Slice 3.y mais ils étaient toujours `[]` en pratique faute d'UI.
- **Edit name d'une entity** : reste un `UPDATE entities` direct (méta hors-canon, comme aliases/tags).
- **v0 implicite** au sentinel `'!init'` créée par `ensureInitVersion()` lors de la 1ʳᵉ "New version" — pas besoin de back-fill data existante.
- **Picker rank** : dropdown chronologique merged chapters+events, pas de slider.
- **Pas d'auto-diff LLM** au promote — Slice 7.

---

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
| **6** ✅ | **Versioning append-only** + résolution "state at rank R" + vraies pages d'édition entity & entity_type + aliases enfin exposés. Validé live 2026-05-01. | Évolution dans le temps ✓ |
| **7** ✅ | **Upscale** (text versioning de chapter, prompt user-driven) + **Proposals** (diffs structurés sur entities → entity_versions). Validé live 2026-05-01. | Boucle écriture → mise à jour entities ✓ |
| **8** ✅ | **Reader view** + summaries S/M/L + **PCC** (Previous-Chapter Context) + global search + chapter `published` flag + runs history page. Validé locale + smoke Chrome 2026-05-01. | Polish + ergonomie ✓ |

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
