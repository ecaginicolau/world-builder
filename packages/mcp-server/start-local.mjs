#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

// Reuse the repository's ignored credentials without copying them into client settings.
const config = JSON.parse(await readFile(new URL('../../.mcp.json', import.meta.url), 'utf8'));
const environment = config.mcpServers?.['world-builder']?.env;
if (!environment) throw new Error('Missing world-builder environment in repository .mcp.json');
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OWNER_USER_ID', 'PLAYWRIGHT_BROWSERS_PATH', 'WORLD_BUILDER_ARTIFACT_DIR']) {
  if (environment[name] !== undefined) process.env[name] = String(environment[name]);
}
await import('./dist/index.js');
