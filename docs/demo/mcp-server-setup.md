# MCP server setup (slice 2a)

This walkthrough sets up the **World Builder MCP server** locally so an MCP-compatible client (Claude Code, Claude Desktop, mcp inspector, custom agents) can read and write your worlds.

> Slice 2a ships **55 tools**: 21 reads, 30 writes (all logged), `get_writing_guide` orientation tool, and 4 LLM intents (`auto_extract_from_note`, `propose_canon_from_chapter`, `upscale_chapter`, `summarize_chapter`) added in 2a.2.
>
> Post-v1 reader add-on (V016): 3 read tools `list_share_links` / `list_reader_sessions` / `list_reader_annotations` so the agent can see beta-reader feedback (👍 / 👎 / inline comments) on chapters, plus `delete_reader_annotation` to clear feedback the author has addressed in the prose.

## Pre-requisites

- V015 migration applied (creates `agent_actions` table). If you skipped it, open the Supabase SQL editor and run [supabase/migrations/V015__slice_mcp_agent_actions.sql](../../supabase/migrations/V015__slice_mcp_agent_actions.sql).
- Node.js 20+ and the repo's npm workspaces installed (`npm install` at repo root).

## 1. Build the package

```bash
npm run mcp:build
```

This compiles `packages/mcp-server/src/**` to `packages/mcp-server/dist/`. The binary `world-builder-mcp` is linked into `node_modules/.bin/` automatically.

## 2. Get the credentials

You need three values:

| Var | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → "Project URL" |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → "service_role" key. **Treat as a password** — bypasses RLS. |
| `OWNER_USER_ID` | The `auth.users.id` of the user whose worlds the agent should operate on. Find it in the Supabase dashboard → Authentication → Users. |

> The service role key bypasses RLS. The MCP server still scopes every query with `owner_id = OWNER_USER_ID` so the agent only sees one user's data, but anyone holding the key can read or modify anything. Don't expose it — local stdio only.

## 3. Smoke-test with mcp inspector

The fastest way to verify the install works.

Launch the inspector with no args — its UI will let you fill in the rest:

```bash
npx @modelcontextprotocol/inspector
```

It opens a browser tab at `http://localhost:6274`. Configure the left sidebar (the v0.21.x UI is form-based, not CLI-flag-based):

| Field | Value |
|---|---|
| Transport Type | `STDIO` |
| Command | `node` |
| Arguments | `D:\workspace\world-builder\packages\mcp-server\dist\index.js` (Windows) or `/abs/path/to/packages/mcp-server/dist/index.js` |

Then expand the **Environment Variables** section and add 3 entries:

| Key | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` |
| `OWNER_USER_ID` | your auth.users.id UUID |

Click **Connect**. The "Disconnected" indicator turns green and the **Tools** tab lists 51 tools. Try:

1. `list_worlds` → returns your worlds
2. `get_writing_guide` with a `world_id` → returns lore + flow recipe + business rules
3. `create_note` with `{world_id, title: "From MCP", content: "<p>hello</p>"}` → returns the inserted note
4. Open the app at `http://localhost:5173/worlds/<world_id>/agent-activity` → the `create_note` row should appear, grouped under the MCP session id

> The older `npx @modelcontextprotocol/inspector --env KEY=VAL ... npx world-builder-mcp` invocation no longer works in v0.21.x — the flag parser changed and dumps `--env` into the Command field. Use the form-based config above instead. Also note: `npx world-builder-mcp` only resolves from inside the project root (the bin is a workspace symlink, not published to npm registry); the `node <abspath>` form works from anywhere.

## 4. Wire up Claude Code (project-scoped)

To make Claude Code itself call the MCP while you're working on the project, the repo ships **`.mcp.json.example`**. Copy it and fill in the secrets — the actual `.mcp.json` is gitignored:

```bash
cp .mcp.json.example .mcp.json
# edit .mcp.json: paste SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_USER_ID
```

Restart Claude Code. On startup it prompts to approve the project-scoped MCP — accept. The `mcp__world-builder__*` tools then appear alongside the built-in ones.

> If you already have these values in `.env.local` (the app's frontend env file), you can pull them in with:
> ```bash
> set -a; . ./.env.local; set +a; node -e "console.log(JSON.stringify({mcpServers:{'world-builder':{type:'stdio',command:'node',args:['./packages/mcp-server/dist/index.js'],env:{SUPABASE_URL:process.env.VITE_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,OWNER_USER_ID:process.env.OWNER_USER_ID}}}}, null, 2))" > .mcp.json
> ```

## 5. Wire up Claude Desktop

Edit Claude Desktop's config (open Settings → Developer → Edit Config, or directly):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add (or merge into) `mcpServers`:

```json
{
  "mcpServers": {
    "world-builder": {
      "command": "node",
      "args": ["D:\\workspace\\world-builder\\packages\\mcp-server\\dist\\index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJ...",
        "OWNER_USER_ID": "YOUR_USER_UUID"
      }
    }
  }
}
```

Restart Claude Desktop. In a new chat you should see a 🔌 icon listing `world-builder` with all its tools. Ask: *"Call get_writing_guide for world X and summarize the recipe"* — Claude should call the tool and return the structured guide.

## 6. Watch the agent in the app

While Claude Desktop drives the MCP server, open the app's **Agent activity** panel:

- Click the 📊 monitoring toggle in the app header → "Agent activity →" link in the panel header
- Or navigate directly to `/worlds/<world_id>/agent-activity`

You'll see every write the agent performs, grouped by `agent_session_id` (a fresh UUID each time the MCP server starts). Reads are not logged (signal/bruit ratio).

## What's next (slice 2a.2)

The 4 LLM intent tools land in the next session. They will:

- Respect the user's local-vs-cloud LLM settings (slice 1, V014)
- Log to both `runs` and `agent_actions`
- Either return candidates for the agent to apply via primitives (`auto_extract`, `propose_canon`) or write directly (`upscale`, `summarize`)

Until then, run those features from the app UI and have the agent only consume the canonical results via the read tools.

## Troubleshooting

- **`Invalid environment` on startup** — The MCP server validates env vars with zod. Check the stderr output for which one is missing or malformed.
- **`World not found or not owned by this user`** — Your `OWNER_USER_ID` doesn't match the `worlds.owner_id` of the world you're addressing. Open the app, log in, look up your user id from Supabase Authentication.
- **Tool calls hang forever** — Most likely a network issue reaching Supabase. The server doesn't time out. Cancel and retry; if it keeps happening, hit your Supabase URL from the same shell with `curl` to verify connectivity.
- **`unique_violation` error from set_entity_field** — The race-safe upsert handles this internally; if you see it surface, the conflict was on a different row. Re-read `list_entity_versions` and double-check the `(entity_id, source_event_id)` you're targeting.
