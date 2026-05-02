import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { fail, ok } from "../response.js";

export function registerBooksReadTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "list_books",
    {
      title: "List books",
      description:
        "Return all books in a world (sorted by rank), each with its parts (sorted by rank).",
      inputSchema: { world_id: z.string().uuid() },
    },
    async ({ world_id }) => {
      const bRes = await ctx.supabase
        .from("books")
        .select("id, title, description, rank, created_at, updated_at")
        .eq("world_id", world_id)
        .eq("owner_id", ctx.ownerId)
        .order("rank", { ascending: true });
      if (bRes.error) return fail(bRes.error.message);
      const books = (bRes.data ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        rank: string;
        created_at: string;
        updated_at: string;
      }>;
      if (books.length === 0) return ok([]);

      const pRes = await ctx.supabase
        .from("parts")
        .select("id, book_id, title, description, rank, created_at, updated_at")
        .in(
          "book_id",
          books.map((b) => b.id),
        )
        .order("rank", { ascending: true });
      if (pRes.error) return fail(pRes.error.message);
      const partsByBook = new Map<
        string,
        Array<{
          id: string;
          book_id: string;
          title: string | null;
          description: string | null;
          rank: string;
          created_at: string;
          updated_at: string;
        }>
      >();
      for (const p of (pRes.data ?? []) as Array<{
        id: string;
        book_id: string;
        title: string | null;
        description: string | null;
        rank: string;
        created_at: string;
        updated_at: string;
      }>) {
        const arr = partsByBook.get(p.book_id) ?? [];
        arr.push(p);
        partsByBook.set(p.book_id, arr);
      }

      return ok(
        books.map((b) => ({ ...b, parts: partsByBook.get(b.id) ?? [] })),
      );
    },
  );
}
