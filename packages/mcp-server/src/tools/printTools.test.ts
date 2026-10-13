import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../context.js';
import { registerEditionTools } from './editions.js';
import { registerLayoutTools } from './layout.js';
import { allRows } from '../print/data.js';
import { editionSettings } from '../print/editions.js';

type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>) {
  const mutations: Row[] = [];
  const from = (table: string) => {
    let result = tables[table] ?? [];
    let patch: Row | undefined;
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => {
        result = result.filter((row) => row[key] === value);
        return q;
      },
      update: (value: Row) => {
        patch = value;
        return q;
      },
      maybeSingle: async () => {
        if (result.length > 1) throw new Error('Multiple rows');
        if (patch && result.length) {
          mutations.push(patch);
          Object.assign(result[0], patch);
        }
        return { data: result[0] ?? null, error: null };
      },
    };
    return q;
  };
  const ctx = {
    supabase: { from, rpc: vi.fn() },
    ownerId: 'owner',
    logAction: vi.fn(),
    agentSessionId: 'test',
  } as unknown as ServerContext;
  const registerTool = vi.fn();
  const server = { registerTool } as unknown as McpServer;
  registerEditionTools(server, ctx);
  registerLayoutTools(server, ctx);
  async function call(name: string, args: Row) {
    const callback = registerTool.mock.calls.find((call) => call[0] === name)?.[2];
    const response = await callback(args);
    return JSON.parse(response.content[0].text);
  }
  return { call, mutations, ctx };
}
describe('print tool ownership and concurrent edits', () => {
  it('does not read another owner edition', async () => {
    const f = fixture({ book_editions: [{ id: 'private', owner_id: 'other' }] });
    expect((await f.call('get_book_edition', { edition_id: 'private' })).ok).toBe(false);
    expect(f.mutations).toEqual([]);
  });
  it('rejects stale edition updates without writing', async () => {
    const f = fixture({
      book_editions: [
        {
          ...editionSettings.parse({}),
          id: 'e',
          world_id: 'w',
          owner_id: 'owner',
          updated_at: 'now',
        },
      ],
    });
    const result = await f.call('update_book_edition', {
      edition_id: 'e',
      expected_updated_at: 'before',
      settings: { image_grayscale: true },
    });
    expect(result.ok).toBe(false);
    expect(f.mutations).toEqual([]);
  });
  it('writes only requested edition fields', async () => {
    const f = fixture({
      book_editions: [
        {
          ...editionSettings.parse({}),
          id: 'e',
          world_id: 'w',
          owner_id: 'owner',
          updated_at: 'now',
        },
      ],
    });
    expect(
      (
        await f.call('update_book_edition', {
          edition_id: 'e',
          expected_updated_at: 'now',
          settings: { image_grayscale: true },
        })
      ).ok,
    ).toBe(true);
    expect(f.mutations).toEqual([{ image_grayscale: true }]);
  });
  it('refuses stale chapter revisions before invoking transaction', async () => {
    const f = fixture({
      chapters: [{ id: 'c', owner_id: 'owner', final_version_id: 'v', updated_at: 'now' }],
      chapter_versions: [{ id: 'v', chapter_id: 'c', owner_id: 'owner', text: '<p>Text</p>' }],
    });
    expect(
      (
        await f.call('edit_chapter_layout', {
          chapter_id: 'c',
          expected_revision: 'stale',
          insert: [],
          remove_blocks: [],
          dry_run: false,
        })
      ).ok,
    ).toBe(false);
    expect(f.ctx.supabase.rpc).not.toHaveBeenCalled();
  });
  it('follows pagination past the first server page', async () => {
    const source = Array.from({ length: 1201 }, (_, i) => ({ id: i }));
    const fetch = vi.fn(async (a: number, b: number) => ({
      data: source.slice(a, b + 1),
      error: null,
    }));
    expect(await allRows(fetch)).toHaveLength(1201);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
