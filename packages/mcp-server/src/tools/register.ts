import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { registerWorldsTools } from "./worlds.js";
import { registerNotesReadTools } from "./notes.js";
import { registerEntitiesReadTools } from "./entities.js";
import { registerEventsReadTools } from "./events.js";
import { registerChaptersReadTools } from "./chapters.js";
import { registerBooksReadTools } from "./books.js";
import { registerSearchTools } from "./search.js";
import { registerNotesWriteTools } from "./notesWrite.js";
import { registerEntitiesWriteTools } from "./entitiesWrite.js";
import { registerEventsWriteTools } from "./eventsWrite.js";
import { registerChaptersWriteTools } from "./chaptersWrite.js";
import { registerBooksPartsWriteTools } from "./booksPartsWrite.js";
import { registerLinksWriteTools } from "./linksWrite.js";

export function registerAllTools(server: McpServer, ctx: ServerContext) {
  // Reads
  registerWorldsTools(server, ctx);
  registerNotesReadTools(server, ctx);
  registerEntitiesReadTools(server, ctx);
  registerEventsReadTools(server, ctx);
  registerChaptersReadTools(server, ctx);
  registerBooksReadTools(server, ctx);
  registerSearchTools(server, ctx);

  // Writes — logged in agent_actions.
  registerNotesWriteTools(server, ctx);
  registerEntitiesWriteTools(server, ctx);
  registerEventsWriteTools(server, ctx);
  registerChaptersWriteTools(server, ctx);
  registerBooksPartsWriteTools(server, ctx);
  registerLinksWriteTools(server, ctx);

  // Intents — coming next.
  // registerIntentsTools(server, ctx);
}
