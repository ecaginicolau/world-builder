import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildExtractMessages, extractEntities } from "./extract.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = () => ({}) as unknown as SupabaseClient;

describe("buildExtractMessages", () => {
  it("emits a system + user message and lists existing entities with aliases", () => {
    const msgs = buildExtractMessages({
      noteText: "Iria the warrior visited the Tower of Glass.",
      existing: [
        { id: "e1", name: "Iria", type: "Character", aliases: ["the warrior"] },
      ],
      knownTypes: ["Character", "Location"],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("Known entity types: Character, Location");
    expect(msgs[0].content).toContain("Iria");
    expect(msgs[0].content).toContain("aliases: the warrior");
    expect(msgs[0].content).toContain("[id=e1, type=Character]");
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toContain("Iria the warrior visited");
  });

  it("falls back to '(none yet)' when no known types are passed", () => {
    const msgs = buildExtractMessages({
      noteText: "x",
      existing: [],
      knownTypes: [],
    });
    expect(msgs[0].content).toContain("Known entity types: (none yet)");
    expect(msgs[0].content).toContain("Existing entities for matching:\n(none)");
  });
});

describe("extractEntities", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("parses a valid candidates response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [{ name: "Iria", type: "Character" }],
              }),
            },
          },
        ],
        model: "qwen2.5:14b",
      }),
    });
    const r = await extractEntities(
      { noteText: "Iria", existing: [], knownTypes: ["Character"] },
      {
        transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
        model: "qwen2.5:14b",
        supabase: sb(),
      },
    );
    expect(r.candidates).toEqual([{ name: "Iria", type: "Character" }]);
    expect(r.provider).toBe("local");
    expect(r.model).toBe("qwen2.5:14b");
  });

  it("accepts matchedEntityId: null (LLM emits explicit null when no match)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  { name: "Iria", type: "Character", matchedEntityId: null },
                ],
              }),
            },
          },
        ],
        model: "qwen2.5:14b",
      }),
    });
    const r = await extractEntities(
      { noteText: "x", existing: [], knownTypes: [] },
      {
        transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
        model: "qwen2.5:14b",
        supabase: sb(),
      },
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].name).toBe("Iria");
    expect(r.candidates[0].matchedEntityId).toBeNull();
  });

  it("throws on non-JSON content", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "not json" } }],
      }),
    });
    await expect(
      extractEntities(
        { noteText: "x", existing: [], knownTypes: [] },
        {
          transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
          model: "m",
          supabase: sb(),
        },
      ),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("throws when schema is invalid", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: JSON.stringify({ candidates: [{}] }) } },
        ],
      }),
    });
    await expect(
      extractEntities(
        { noteText: "x", existing: [], knownTypes: [] },
        {
          transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
          model: "m",
          supabase: sb(),
        },
      ),
    ).rejects.toThrow(/schema invalid/);
  });
});
