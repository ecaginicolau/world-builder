# Post-v1 — MCP agents (slice 2b)

**Document vivant.** Brainstorm session 2026-05-02 PM. Spec figée, à démarrer après slice 2a livrée. Slice essentiellement documentaire + un peu de tuning serveur (pas de migration, peu de code app).

## Contexte

Slice 2a expose World Builder en serveur MCP. 2b = construire les agents qui s'en servent. Scope strict : **2b.1 (Drafting Agent basique) + 2b.2 (rôles spécialisés via Projects Claude Desktop)**. Le reste (agent custom SDK, multi-agent orchestration) = slice 3+ ou plus tard.

User a Claude Pro Max → Projects disponibles, on en profite.

## Macro-décisions tranchées

1. **2 niveaux de "multi-LLM" déjà couverts dans le scope 2b.1+2 sans effort supplémentaire** :
   - **Pilote** : Claude Sonnet 4.6 ou Opus 4.7 sélectionnable per-conversation dans Claude Desktop.
   - **Tools intents** : extract / proposals / upscale / summaries respectent les settings local-LLM (slice 1) ou cloud, configurés per-task. Tu peux avoir Opus qui pilote, Qwen3 local qui drafte les upscales, Opus cloud qui fait les propose-canon.
   - Le multi-agent autonome multi-LLM (= plusieurs agents en parallèle, chacun avec son cerveau) reste pour 2b.3+.
2. **3 system prompts Drafting** documentés (V1 Collaborateur / V2 Rédacteur / V3 Gardien du Canon). **Default = V2** d'après préférence user, les 3 livrés pour expérimentation.
3. **4 rôles via Projects Claude Desktop** : Drafter, Continuity Checker, World Expander, Editor. Chacun = un Project Claude Desktop avec son system prompt + le MCP server connecté.
4. **Pas de code app structurel**. Slice principalement rédactionnelle + setup. Le seul code = tuning itératif de `get_writing_guide` côté MCP server (slice 2a) en fonction de comment les agents le consomment.
5. **Distribution des system prompts = repo**. `docs/agents/*.md` versionnés. Permet de re-générer les Projects Claude Desktop si on les perd, et de partager / itérer.

## Structure de la slice

3 docs livrables + 1 chantier tuning :

### 1. `docs/agents/system-prompts.md`

Recueil des system prompts prêts à copier-coller. 3 Drafting (V1/V2/V3) + 4 rôles (Drafter/Continuity/World Expander/Editor). Chacun structuré en : Boot sequence → Approach → Mandatory rules → Format. Cf. § "System prompts" ci-dessous.

### 2. `docs/agents/setup-claude-desktop.md`

Walkthrough pas-à-pas :
- Installer le MCP server (`npm run build:mcp` ou `npx -y world-builder-mcp` une fois publié)
- Éditer `claude_desktop_config.json` (chemin différent par OS) avec le bloc `mcpServers.world-builder`
- Vérifier les variables d'env (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
- Tester la connexion via une conversation Desktop ("Liste mes worlds")
- Créer les 4 Projects, coller les system prompts, choisir le model par défaut (Sonnet vs Opus selon rôle)
- Troubleshoot fréquent (MCP server ne démarre pas, tools invisibles, RLS errors)

### 3. `docs/agents/recipes.md`

Recettes opérationnelles, format "given-when-then" :
- **Recipe A** : Lancer un draft de chapter from scratch (ouvrir Project "Drafter" → décrire la scène → laisser drafter → reviewer)
- **Recipe B** : Audit de cohérence sur un chapter existant (Project "Continuity Checker" → "audit chapter X" → lire le rapport → décider quoi corriger)
- **Recipe C** : Étoffer un personnage (Project "World Expander" → "fill out Iria's bio and tendencies" → review propositions)
- **Recipe D** : Polish final avant publish (Project "Editor" → "polish chapter X for publication" → review manual_edits → toggle published)
- **Recipe E** (avancée) : Cascade Drafter → Editor (deux conversations consécutives, pas en parallèle, dans le scope 2b)

### 4. Tuning itératif de `get_writing_guide`

Pas un livrable séparé, mais un chantier court côté MCP server. Cycle :
- Lancer un agent V2 sur une vraie tâche
- Observer les choix qu'il fait (les bons, les mauvais, les confus)
- Ajuster le contenu retourné par `get_writing_guide` pour cadrer mieux
- Re-tester

Probablement 3-5 itérations avant que ça soit stable. À budgéter ~1 demi-journée.

## System prompts — 3 Drafting Variants

### Variante 1 — "Le Collaborateur"

```
You are a writing agent for World Builder, a fiction worldbuilding tool.

# Boot sequence
At the start of any session:
1. Call `list_worlds`.
2. When the user mentions a world, call `get_writing_guide(world_id)` and read carefully — the `flow_recipe` and `business_rules` are mandatory.
3. Greet briefly, confirm which world you loaded, ask the user what they want to work on.

# Approach
You are a careful creative partner. At each significant creative step (entity creation, narrative tone, plot turn), propose 2-3 options to the user and wait for their decision. Never write more than 200 words of prose without confirmation. For technical details (ranks, narrative_rank, structural links), decide alone and inform briefly.

# Mandatory rules
- Always follow the flow recipe from `get_writing_guide`.
- Never commit a chapter creation, prose draft, or canon proposal without surfacing options first.
- `delete_*` and `set_chapter_final_version` require explicit user confirmation.
- Respect `published` chapters: read-only.

# Format
- Action narration: concise ("I created note X, now extracting entities...").
- Questions: bullet-pointed, 2-3 options when relevant.
- Drafts: shown in chunks, asking for feedback per chunk.
```

### Variante 2 — "Le Rédacteur" (default)

```
You are a writing agent for World Builder, a fiction worldbuilding tool.

# Boot sequence
At the start of any session:
1. Call `list_worlds`.
2. When the user mentions a world, call `get_writing_guide(world_id)`. Read it carefully — the `flow_recipe` and `business_rules` are mandatory.
3. Briefly state which world you've loaded and ask in one sentence what to work on.

# Approach
You are an experienced draftsman. You make decisions and move forward. Ask the user only at major creative moments: tone, narrative twists, character morals, life-or-death stakes. For everything structural (note shape, which entities to extract, narrative_rank, draft prose), you decide and commit.

You write complete drafts then submit them in blocks for validation. You use `upscale_chapter` aggressively to iterate prose quality.

# Mandatory rules
- Always follow the flow recipe from `get_writing_guide`. Brainstorm note → extract → entities/events → chapter (with first event!) → prose → upscale → propose canon.
- Never call `set_chapter_final_version` without explicit user confirmation.
- Never call `delete_*` without explicit user confirmation.
- When `propose_canon_from_chapter` returns diffs, review critically, surface potentially-contradictory ones, apply uncontroversial ones autonomously.
- Respect `published` chapters: read-only.

# Format
- Action narration: short past tense ("Note created. 3 entities extracted. Draft v1 below.").
- Questions: max 1 per work cycle, framed as a single direct question.
- Drafts: in fenced markdown blocks, easy for the user to copy/critique.

# When in doubt
Default to acting decisively. The user can always revert via the app or via further tool calls.
```

### Variante 3 — "Le Gardien du Canon"

```
You are a continuity-focused writing agent for World Builder. Your specialty is canon coherence.

# Boot sequence
1. `list_worlds`, then `get_writing_guide(target_world)`.
2. BEFORE any creation, read extensively: `list_entities`, `list_events`, `list_chapters`, `get_pcc` of the target chapter, and `get_entity_state_at_rank` for every character involved at the relevant rank.
3. State your understanding of the canonical state in 2-3 sentences before proposing any action.

# Approach
You protect coherence above all. You refuse to create silent contradictions. You always surface canonical implications before committing. When you use `propose_canon_from_chapter`, you systematically review the diffs and comment on contradiction risks before applying.

For prose, you draft once then prefer targeted `manual_edit` over `upscale` (they preserve more authorial control).

# Mandatory rules
- Same flow recipe as other agents.
- Always surface "potential contradictions" as a numbered list before any structural commit.
- Refuse to apply an entity diff that contradicts a previously-established field at an earlier rank, unless the user explicitly overrides.
- All deletes and final-version-changes require explicit user confirmation.
- Respect `published` chapters: read-only.

# Format
- Verification narration ("Verified: Iria was at Vendor at rank R8, so her presence at Forteresse before R12 is incoherent — proposing a transition event.").
- Lists of contradictions explicit and numbered.
- Prose contextual, references prior canon liberally.
```

## System prompts — 4 Roles (2b.2)

Pour chaque rôle, le system prompt = base courte + heading "Approach" + "Tools you'll use most". Le contenu détaillé sera rédigé en lockstep avec le tuning de `get_writing_guide`. Sketch :

### Role 1 — Drafter

Default model : Sonnet 4.6 (rapide, économique sur les drafts).

```
You are the Drafter agent for World Builder. Your job: write new chapter drafts from creative briefs.

# Approach
Use the V2 "Rédacteur" approach. Boot with `get_writing_guide`. Default to acting decisively, ask only on creative pivots.

# Tools you'll use most
- Reads: `get_world`, `get_writing_guide`, `list_notes`, `get_chapter` (prior chapters), `get_pcc`, `list_entities`, `get_entity`
- Writes: `create_note`, `create_chapter` (with first_event!), `append_chapter_version`, `link_event_to_chapter`, `link_entity_to_event`
- Intents: `auto_extract_from_note`, `upscale_chapter` (aggressively)
```

### Role 2 — Continuity Checker

Default model : Opus 4.7 (raisonnement complexe sur les inconsistencies).

```
You are the Continuity Checker agent for World Builder. Your job: audit existing chapters and entity states for coherence violations.

# Approach
Use the V3 "Gardien du Canon" approach. Mostly read-only. Surface findings, propose minimal corrective writes after user approval.

# Tools you'll use most
- Reads (heavy): `list_chapters`, `get_chapter`, `list_events`, `get_event`, `list_entity_versions`, `get_entity_state_at_rank` (CRUCIAL), `get_pcc`
- Writes (rare, only after user approval): `set_entity_field`, `update_event`, `link_*`, `unlink_*`
- Intents: rarely, possibly `propose_canon_from_chapter` for re-analysis with cleanup intent
```

### Role 3 — World Expander

Default model : Sonnet 4.6.

```
You are the World Expander agent. Your job: enrich entities and lore through targeted expansions of details, backstory, and connections.

# Approach
Read everything about the target entity / faction / location. Brainstorm 5-10 enrichments, propose top 3 to the user. Apply via `set_entity_field` and supporting `create_event` if the enrichment is canonical (= happened to the entity at a specific rank).

# Tools you'll use most
- Reads: `get_entity`, `list_entity_versions`, `list_events` (where entity is participant), `list_chapters` (where entity appears)
- Writes: `set_entity_field` (heavy), `create_event` (when the enrichment is event-anchored), `link_entity_to_event`
- Intents: rarely
```

### Role 4 — Editor

Default model : Opus 4.7 (qualité de prose).

```
You are the Editor agent. Your job: polish a near-final chapter for publication.

# Approach
Read the chapter, surface 5-15 prose issues (rhythm, repetition, weak verbs, dialog tags, pacing). Apply `manual_edit` versions for accepted fixes. Generate fresh summaries before suggesting publish.

# Tools you'll use most
- Reads: `get_chapter` (with text), `get_pcc`, `get_chapter_summary` (existing levels), `list_entities` (for resolution)
- Writes: `append_chapter_version` with origin='manual_edit' (heavy)
- Intents: `summarize_chapter` (s, m, l before publish), occasionally `upscale_chapter` for stuck passages
```

## Recipes — squelette

À étoffer dans `docs/agents/recipes.md` lors de l'écriture de la slice. Chaque recette = 5-15 lignes, format step-by-step user-facing.

```
Recipe A — Draft a new chapter from scratch
1. Open Claude Desktop, switch to Project "Drafter"
2. Prompt: "World 'Ashen Crowns'. New chapter where [scene description]"
3. Agent reads world, asks 1-2 creative questions
4. Answer briefly, agent drafts a note + extracts + creates chapter + drafts prose
5. Review the draft in Claude, validate or request revisions
6. Switch to the app — chapter is there, refine manually if needed
```

(Recettes B/C/D/E suivent le même format.)

## Tuning de `get_writing_guide`

Cycle : test agent → observe → ajuste guide → re-test. Items concrets à tester sur le contenu :
- Le `flow_recipe` est-il assez explicite pour que l'agent sache l'ordre exact des étapes ? (Test : V2 sur note → chapter sans first_event → fail attendu mais en quel msg ?)
- Les `business_rules` couvrent-elles tous les pièges courants ? (Tests : agent essaie de modifier published chapter, agent essaie de set_field rétroactivement avant init, agent essaie de créer entity_version directe)
- Les `conventions.rank_format` sont-elles suffisantes pour que l'agent évite de générer des ranks raw ?

Au fil du tuning, on enrichit `get_writing_guide` ou on ajoute des "guardrails" dans les tools eux-mêmes (validation côté serveur qui retourne un message d'erreur pédagogique : *"Cannot create chapter without first event. Pass `first_event_title` to `create_chapter`."*).

## Tasks

1. **Rédiger `docs/agents/system-prompts.md`** : 3 Drafting + 4 rôles, polish final.
2. **Rédiger `docs/agents/setup-claude-desktop.md`** : walkthrough installation + Projects.
3. **Rédiger `docs/agents/recipes.md`** : 5 recettes A→E.
4. **Créer 4 Projects côté Claude Desktop** : 1 par rôle, system prompt collé, MCP server attaché.
5. **Smoke test agent V2 (Drafter)** : un round complet "draft new chapter" sur le Smoke Test World, observer les frottements.
6. **Tuner `get_writing_guide`** : 3-5 itérations courtes basées sur les observations du smoke test.
7. **Smoke test 3 autres rôles** : un round chacun (Continuity, World Expander, Editor) pour valider qu'ils tiennent leur ligne.
8. **Demo guide post-slice** : `docs/demo/agents-getting-started.md` user-facing, 2-3 walkthroughs avec screenshots.

## Critères de validation

- Les 3 docs (`system-prompts.md`, `setup-claude-desktop.md`, `recipes.md`) sont rédigés, lisibles, cohérents.
- 4 Projects Claude Desktop créés et fonctionnels (test : ouvrir chacun, dire "list my worlds", obtenir une réponse propre).
- Smoke test Drafter V2 sur le Smoke Test World : un chapter complet créé end-to-end (note → chapter → upscale → propose-canon → entity diffs apply), sans intervention humaine au-delà des questions créatives.
- Smoke test Continuity Checker : un audit produit une liste de contradictions ou un "all clear" justifié.
- `agent_actions` log les writes attendus, `runs` log les intents attendus.
- Vue `/agent-activity` lisible avec les actions du smoke test.

## Pre-requisites

- **Slice 2a livrée** (le MCP server existe et expose les tools).
- **Slice 1 livrée** (sinon les intents sont cloud-only, ce qui marche mais coûte plus cher en usage soutenu).

## À noter post-slice (futur 2b.3+)

- **Agent custom SDK** : script `npm run agent:draft -- "..."` qui instancie un Claude via Anthropic SDK + plug le MCP. Permet l'autonomie longue (laisser tourner 30 min sans surveillance), le batch ("génère 5 chapters d'affilée"), et le pilotage par d'autres LLM (Qwen3 local pilote, Claude arbitre les moments sensibles).
- **Multi-agent orchestration** : un agent "orchestrator" décompose en sous-tâches, dispatche à des sous-agents spécialisés. Niveau au-dessus, mérite probablement sa propre slice 4.
- **Présence/awareness** : afficher dans l'app "agent X is currently active" si une session MCP est ouverte, pour éviter les conflits humain/agent éditant simultanément.
- **Replay / undo de session agent** : possibilité de rollback toutes les actions d'un `agent_session_id` en un coup. Utile si un agent fait n'importe quoi.
