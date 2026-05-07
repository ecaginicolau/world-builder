# Agent setup — Claude Desktop (alternative)

Voie alternative pour qui veut une UI chat dédiée plutôt que le terminal Claude Code. Mêmes system prompts, host différent.

> **Default = Claude Code via slash commands.** Voir [setup.md](./setup.md). Cette voie est documentée pour le cas où tu veux une vraie chat UI, mais la config `claude_desktop_config.json` est plus pénible côté Windows.

## Pre-requisites

Identiques à la voie Claude Code :
- MCP server build + creds disponibles ([mcp-server-setup.md](../demo/mcp-server-setup.md)).
- Slice 2a.2 livrée (les 4 intents).
- Slice 1 livrée (optionnel mais recommandé pour la facture cloud).

## 1. Locate the config file

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**Windows note**: the `Claude` folder is only created the first time you toggle a setting in the Claude Desktop dev settings UI. If the path doesn't exist, open Claude Desktop → Settings → Developer → toggle anything once, then it'll appear.

## 2. Add the MCP server entry

Edit the config (create if missing):

```json
{
  "mcpServers": {
    "world-builder": {
      "command": "node",
      "args": ["D:\\workspace\\world-builder\\packages\\mcp-server\\dist\\index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ...",
        "OWNER_USER_ID": "YOUR_AUTH_USERS_ID_UUID"
      }
    }
  }
}
```

Notes:
- Use **absolute paths** in `args` — Claude Desktop's working dir isn't the repo.
- On Windows, **double-escape backslashes** in JSON (`\\`) or use forward slashes (`/`).
- `service_role` key bypasses RLS. Treat as a password — don't commit.

Restart Claude Desktop fully (quit, not just close) for the config to take effect.

## 3. Verify the connection

In Claude Desktop, start a new chat. The hammer icon (🔨) at the bottom of the input box should show **51 tools** under `world-builder`.

If not:
- Settings → Developer → check the MCP server log for errors (most common: bad path, bad creds, missing migration V015).
- Quit Claude Desktop fully, fix the config, relaunch.

## 4. Create 4 Projects (one per role)

Claude Desktop's "Projects" feature is the equivalent of Claude Code slash commands. Create one project per persona:

1. New Project → Name "World Builder · Drafter".
2. **Custom Instructions** = paste the Drafter system prompt from [system-prompts.md](./system-prompts.md) §"Role 1 — Drafter".
3. Repeat for Continuity / World Expander / Editor.

For each project, optionally set the model (Settings → Model) according to the recommendation in `system-prompts.md`:

| Project | Recommended model |
|---|---|
| Drafter | Sonnet 4.6 |
| Continuity Checker | Opus 4.7 |
| World Expander | Sonnet 4.6 |
| Editor | Opus 4.7 |

## 5. Smoke test

Open the Drafter project → new chat → type:

```
New chapter for Smoke Test World, where Iria visits the cellar of the Vieille Forteresse and finds an unsigned letter.
```

Expected sequence — same as Claude Code (cf. [setup.md](./setup.md) §3 step 4-7).

## Verify writes

Open the app at `/agent-activity`. Filter by the most recent session.

## Limitations vs Claude Code

- **No project-scoped command files** → if you update a system prompt, you have to manually re-paste into the Project's Custom Instructions. Claude Code's `.claude/commands/*.md` are versioned in the repo and update on `git pull`.
- **One model per project** → can't quickly swap Sonnet ↔ Opus mid-session. In Claude Code, `/model` toggles instantly.
- **Heavier UI for terminal-y work** — for fast iterations on tooling/tuning, Claude Code wins.

For day-to-day writing on a polished chapter, Claude Desktop is more comfortable. For setup, debugging, and tuning, prefer Claude Code.
