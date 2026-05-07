# Agents — getting started (slice 2b)

User-facing walkthrough to set up the 4 World Builder agent personas in Claude Code and validate them end-to-end on the Smoke Test World.

> Companion docs: [docs/agents/setup.md](../agents/setup.md) (reference setup), [docs/agents/recipes.md](../agents/recipes.md) (operational flows), [docs/agents/system-prompts.md](../agents/system-prompts.md) (the prompts themselves).

## TL;DR

```bash
# 1. Build the MCP server
npm run mcp:build

# 2. Fill .mcp.json with your Supabase creds (copy from .mcp.json.example)
cp .mcp.json.example .mcp.json
# edit .mcp.json with SUPABASE_URL / SERVICE_ROLE_KEY / OWNER_USER_ID

# 3. Restart Claude Code in the repo, accept the project-scoped MCP prompt

# 4. Smoke test
/drafter
> List my worlds
```

If `/drafter` opens and the agent returns a list of your worlds via `mcp__world-builder__list_worlds`, you're wired. The rest of this doc validates each persona.

---

## Pre-flight

| Check | How |
|---|---|
| V015 migration applied | Supabase dashboard → SQL editor. Look for table `agent_actions`. If missing, run [V015__slice_mcp_agent_actions.sql](../../supabase/migrations/V015__slice_mcp_agent_actions.sql). |
| MCP server built | `ls packages/mcp-server/dist/index.js` — exists. If not, `npm run mcp:build`. |
| `.mcp.json` filled | `cat .mcp.json` — values are real, not the `eyJ...` placeholder. |
| Slice 1 settings (optional) | App → Settings → Local LLM. If you have Ollama / LM Studio, point at it. Cuts cloud spend on heavy intents. |

## 1. Wire MCP into Claude Code

Restart Claude Code in the repo root. On first start after `.mcp.json` is filled:

- Claude Code prompts: "Allow project-scoped MCP server `world-builder`?" → **Allow**.
- Status bar shows the MCP indicator. Hover → "world-builder · 51 tools".

Verify:

```
in Claude Code:
> list the world-builder MCP tools
```

Expected: 51 tools, `mcp__world-builder__*` prefix.

If you see less or none, see [docs/demo/mcp-server-setup.md](./mcp-server-setup.md) §troubleshooting first.

## 2. Verify the slash commands

The 4 slash commands are committed in [.claude/commands/](../../.claude/commands/):

```
.claude/commands/
├── drafter.md
├── continuity.md
├── world-expander.md
└── editor.md
```

In Claude Code, type `/` — they should appear in the palette. If they don't, you're not in the repo root.

## 3. Smoke each persona on the Smoke Test World

> Smoke Test World already has some content (Iria, Sorn, Vieille Forteresse, 3 chapters). Perfect for validating personas without polluting a real world.

### 3a. Drafter

New Claude Code session.

```
/drafter
```

Expected boot: agent calls `list_worlds`, replies in 1-2 sentences, asks one question.

```
Smoke Test World. New chapter where Iria explores the cellar of the Vieille Forteresse and finds an unsigned letter mentioning a "second betrayal".
```

Expected sequence (watch the tool calls in the Claude Code transcript):

1. `get_writing_guide` — boot
2. `create_note` — captures the brief
3. `auto_extract_from_note` — surfaces ~3-5 candidates
4. `create_entity` (per accepted, skip already-canon) + `link_entity_to_chapter` (deferred)
5. `create_chapter` with `first_event_title` set (REQUIRED — this is the canonical pivot from slice d)
6. `append_chapter_version` (origin `manual_edit`, prose draft)
7. Optionally `upscale_chapter` (prompt to tighten/polish)
8. `propose_canon_from_chapter` — review diffs, apply uncontroversial

The agent surfaces the prose in fenced markdown, narrates writes in past tense.

**Validate**:
- App → `/agent-activity` → filter by current session. You should see ~10-15 rows (creates, links, version inserts).
- App → `/runs` → 2-3 runs (`auto_extract`, possibly `upscale`, `propose_updates`).
- App → BookDetailScreen → new chapter appears, with the anchor event linked.
- ChapterScreen → VersionsPanel shows the draft (and the upscale if applied).

### 3b. Continuity Checker

In the same Claude Code session (or a fresh one):

```
/continuity
Audit "Confrontation à la forteresse" in Smoke Test World.
```

Expected sequence (read-heavy):

1. `get_writing_guide` — boot
2. `get_chapter` (with text) + `get_pcc` for the chapter
3. `list_events` filtered to the chapter, then `get_event` per event
4. `get_entity_state_at_rank` for each participant at the chapter's chrono rank

Then surfaces a numbered list of findings. **No writes** unless you approve specific fixes.

**Validate**:
- The findings reference specific quotes from the chapter and specific canonical facts (event titles, ranks, version sources).
- `/agent-activity` shows mostly reads (which aren't logged) and **zero writes** if you didn't approve any fix.
- If the chapter is canonically clean, the agent says so explicitly with a justification — not a generic "all good".

### 3c. World Expander

```
/world-expander
Expand Iria in Smoke Test World — she's central but the bio is thin.
```

Expected sequence:

1. `get_entity` + `list_entity_versions` + `list_events` (filter by participant) + `list_chapters` (where Iria appears)
2. Synthesizes 2-3 sentences of canonical state
3. Surfaces 3 enrichment pitches with target write specified

```
[after pitches] apply 1 and 2.
```

Expected writes: `set_entity_field` × 2, possibly at the init anchor.

**Validate**:
- App → EntityDetailScreen for Iria → 2 new init-anchor fields populated, with `(inherited from initial)` propagating to all anchors.
- `/agent-activity` shows the 2 `set_entity_field` writes.

### 3d. Editor

```
/editor
Polish the chapter we just drafted in 3a.
```

Expected sequence:

1. `get_chapter` (with text) + `get_pcc` + `get_chapter_summary` + `list_entities`
2. Surfaces 5-15 findings grouped by category (rhythm / repetition / weak-verbs / dialog-tags / pacing)

```
[after findings] apply rhythm and repetition fixes. leave the rest.
```

Expected writes: 1× `append_chapter_version` (origin `manual_edit`).

```
publish-ready, generate summaries
```

Expected: `summarize_chapter(level='S')` → `M` → `L`.

**Validate**:
- ChapterScreen → VersionsPanel shows new manual_edit version.
- ChapterScreen → 3 summary fields filled (S, M, L).
- `/runs` → 3 summarize runs.

## 4. Verify the audit trail

Open the app at `/agent-activity`. Filter dropdown → select the smoke-test session id. You should see the full chronological story of the smoke test:

- Drafter: ~10-15 writes (create_note, create_entity × N, create_chapter, append_chapter_version, link_*, set_entity_field × N).
- Continuity Checker: 0 writes (read-only smoke).
- World Expander: 2 `set_entity_field` writes.
- Editor: 1 `append_chapter_version` + 3 `summarize_chapter`.

Click any row → JSON payload preview shows the action_kind, target, and key payload fields.

`/runs` (existing screen) shows all the LLM calls (intents). Filter by today → you should see `auto_extract`, `propose_updates`, `upscale`, `summarize`.

## 5. (Optional) local LLM routing

If slice 1 (local LLM) is set up, validate that intents respect routing:

1. App → Settings → Local LLM → toggle on, configure endpoint + per-task model.
2. Set just `extract_local_model` (leave others empty).
3. Re-run Recipe A from `/drafter`.
4. `/runs` → the `auto_extract` row should show `provider=local`, `model=<your local model name>`. The other intents stay `provider=openai`.

This validates the slice-1 routing all the way through the MCP server (the per-task fallback is shared between app and server).

## Common stumbles

| Symptom | Likely cause | Fix |
|---|---|---|
| `/drafter` opens but agent doesn't call any MCP tool | MCP not connected for this session — the slash command was loaded before the project-scoped MCP was approved | Restart Claude Code, re-accept the prompt |
| `auto_extract_from_note` returns "Note is empty" | Agent passed an id of a note with HTML-only content (no extractable text) | Tweak the prompt; this is fine, agent should fall back to `create_note` first |
| `create_chapter` errors "first_event_title required" | Agent skipped the business rules from `get_writing_guide` | Tuning bug — log the case and adjust [packages/mcp-server/src/guide.ts](../../packages/mcp-server/src/guide.ts) |
| `/agent-activity` shows nothing | `OWNER_USER_ID` in `.mcp.json` doesn't match the user you're logged into the app as | Check the auth.users.id in Supabase dashboard, update `.mcp.json`, restart Claude Code |
| Editor agent rewrites the entire chapter via `upscale_chapter` instead of line-edits | Persona drift — system prompt says "manual_edit by default" but the agent reached for upscale | Tuning observation: tighten the Editor system prompt in [.claude/commands/editor.md](../../.claude/commands/editor.md) |
| Tools list shows 47 instead of 51 | MCP server build is stale (pre-2a.2) | `npm run mcp:build`, restart Claude Code |

## Done?

You've validated:

- [x] MCP wiring (51 tools)
- [x] 4 slash commands registered
- [x] Drafter end-to-end (Recipe A)
- [x] Continuity Checker read-only audit (Recipe B)
- [x] World Expander (Recipe C)
- [x] Editor + summaries (Recipe D)
- [x] `/agent-activity` populated
- [x] `/runs` populated
- [x] (optional) local LLM routing per task

Next:
- Tune `get_writing_guide` based on the friction you noticed during the smoke test (3-5 short cycles).
- Try the cascade Drafter → Editor on a real chapter ([recipes.md](../agents/recipes.md) Recipe E).
- For chat-UI work, set up Claude Desktop ([docs/agents/setup-claude-desktop.md](../agents/setup-claude-desktop.md)).
