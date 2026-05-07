# Agent setup — Claude Code (default)

This walkthrough wires the **4 World Builder agent personas** (Drafter / Continuity Checker / World Expander / Editor) into Claude Code as slash commands. Default and recommended runtime.

> Looking for a chat-UI alternative? See [setup-claude-desktop.md](./setup-claude-desktop.md). Same system prompts, different host.

## Pre-requisites

- **MCP server up and reachable from Claude Code.** Build + `.mcp.json` filled in. Walkthrough: [docs/demo/mcp-server-setup.md](../demo/mcp-server-setup.md).
- **Slice 2a.2 livrée** (the 4 LLM intent tools — `auto_extract_from_note`, `propose_canon_from_chapter`, `upscale_chapter`, `summarize_chapter`). The Drafter and Editor agents won't be useful without them.
- **Slice 1 livrée** (local LLM provider) — optional but recommended. Lets you route the heavy intents (extract / upscale / summarize) to a local model and keep cloud spend on the chat-driving LLM only.

## 1. Verify the MCP wiring

Restart Claude Code in this repo. On the first start after `.mcp.json` is filled, Claude Code prompts you to allow the project-scoped server — accept.

Then in any session, ask:

```
list the world-builder MCP tools
```

You should see **51 tools** prefixed `mcp__world-builder__*` (18 reads, 29 writes, 4 intents). If not, troubleshoot via the inspector first — see [mcp-server-setup.md](../demo/mcp-server-setup.md) §3.

## 2. Verify the slash commands are registered

The 4 personas live in [.claude/commands/](../../.claude/commands/) and are committed to the repo:

- `drafter.md` — write new chapter drafts
- `continuity.md` — audit canon coherence
- `world-expander.md` — enrich entities
- `editor.md` — polish for publication

In Claude Code, type `/` and you should see them in the command palette. If not:

- Confirm you launched Claude Code from the repo root (project-scoped commands only load there).
- Restart Claude Code (commands are picked up on session start).

## 3. Smoke test — Drafter

In a fresh Claude Code session:

```
/drafter
```

The agent should respond with a brief greeting and a single question. Expected behavior:

1. It calls `mcp__world-builder__list_worlds`.
2. You name a world (e.g. "Smoke Test World").
3. It calls `mcp__world-builder__get_writing_guide`.
4. It asks one question, in one sentence (e.g. "What scene do you want to draft?").

Then prompt:

```
New chapter where Iria visits the cellar of the Vieille Forteresse and finds an unsigned letter.
```

Expected sequence (V2 stance — decisive, minimal questions):

1. `create_note` — captures the brief.
2. `auto_extract_from_note` — surfaces candidate entities.
3. `create_entity` (per accepted candidate) + `link_entity_to_chapter`.
4. `create_chapter` with `first_event_title` set (e.g. "Iria descends into the cellar").
5. `append_chapter_version` — first prose draft.
6. Maybe `upscale_chapter` for tone polish.
7. `propose_canon_from_chapter` — review diffs, apply uncontroversial.

You can interrupt and redirect at any point — the agent is decisive, not unstoppable.

## 4. Verify the writes landed

Open the app at `/agent-activity`. Filter by the most recent session. You should see a chronological list of writes (creates, links, version inserts) with payload previews. The intents (`auto_extract_from_note`, `upscale_chapter`, etc.) also show up in `/runs`.

## 5. Switch personas

Same session, type `/continuity` or `/world-expander` or `/editor` to swap personas. Each command re-applies its system prompt and the boot sequence runs again.

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `/drafter` not in command palette | Launched Claude Code outside repo root, or didn't restart after pulling `.claude/commands/`. |
| Agent doesn't call any `mcp__world-builder__*` tool | MCP server not connected. Check the MCP indicator in Claude Code (status bar) or run `mcp inspector` smoke. |
| `auto_extract_from_note` returns "Note is empty" | The agent passed an empty note id, or the note has only HTML with no extractable text. Check `list_notes` first. |
| `create_chapter` fails with "first_event_title required" | The agent skipped the `business_rules` from `get_writing_guide`. This is a tuning bug — log the case and adjust `packages/mcp-server/src/guide.ts`. |
| Writes don't show in `/agent-activity` | The `agent_actions` table is empty for this session. Check that `OWNER_USER_ID` in `.mcp.json` matches the auth user you're logged into the app as. |

## Next

Try the [recipes](./recipes.md) to see end-to-end flows for each persona.
