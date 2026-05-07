import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildCanonMessages, proposeCanon } from "./proposeCanon.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = () => ({}) as unknown as SupabaseClient;

describe("buildCanonMessages", () => {
  it("includes world memory, custom prompt, entity cards and existing events", () => {
    const msgs = buildCanonMessages({
      worldMemory: "WM here",
      worldCustomPrompt: "Be terse",
      chapterTitle: "Ch 1",
      chapterText: "Some prose.",
      entityCards: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          name: "Iria",
          type: "Character",
          fields: [
            { name: "hp", kind: "int" },
            { name: "alive", kind: "bool" },
          ],
          currentSnapshot: { hp: "10", alive: "true" },
        },
      ],
      existingEvents: [{ title: "Birth of Iria", description: "She was born" }],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain("# World Memory\nWM here");
    expect(msgs[0].content).toContain("# Author preferences\nBe terse");
    expect(msgs[0].content).toContain('name="Iria"');
    expect(msgs[0].content).toContain("hp (int)");
    expect(msgs[0].content).toContain("Already in canon");
    expect(msgs[0].content).toContain("Birth of Iria");
    expect(msgs[1].content).toContain("# Chapter: Ch 1");
    expect(msgs[1].content).toContain("Some prose.");
  });

  it("explicitly says entityDiffs must be empty when no entity cards", () => {
    const msgs = buildCanonMessages({
      chapterText: "x",
      entityCards: [],
      existingEvents: [],
    });
    expect(msgs[0].content).toContain("(none — entityDiffs must be empty)");
  });
});

describe("proposeCanon", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("parses a valid events response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                events: [
                  {
                    title: "A new event",
                    description: "desc",
                    entityDiffs: [],
                  },
                ],
              }),
            },
          },
        ],
        model: "gpt-5.4-mini",
      }),
    });
    const r = await proposeCanon(
      { chapterText: "x", entityCards: [], existingEvents: [] },
      {
        transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
        model: "m",
        supabase: sb(),
      },
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].title).toBe("A new event");
    expect(r.events[0].entityDiffs).toEqual([]);
  });

  it("throws on schema mismatch", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: JSON.stringify({ events: [{ title: "" }] }) },
          },
        ],
      }),
    });
    await expect(
      proposeCanon(
        { chapterText: "x", entityCards: [], existingEvents: [] },
        {
          transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
          model: "m",
          supabase: sb(),
        },
      ),
    ).rejects.toThrow(/schema invalid/);
  });
});
