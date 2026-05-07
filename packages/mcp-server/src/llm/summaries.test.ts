import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildSummarizeMessages, summarize } from "./summaries.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = () => ({}) as unknown as SupabaseClient;

describe("buildSummarizeMessages", () => {
  it("includes the requested length in the system prompt", () => {
    const sM = buildSummarizeMessages({
      chapterText: "x",
      length: "M",
    });
    expect(sM[0].content).toContain("medium summary");

    const sL = buildSummarizeMessages({
      chapterText: "x",
      length: "L",
    });
    expect(sL[0].content).toContain("long summary");
  });

  it("includes world memory and custom prompt when provided", () => {
    const msgs = buildSummarizeMessages({
      worldMemory: "WM here",
      worldCustomPrompt: "Be terse",
      chapterTitle: "Ch 1",
      chapterText: "x",
      length: "S",
    });
    expect(msgs[0].content).toContain("WM here");
    expect(msgs[0].content).toContain("Be terse");
    expect(msgs[0].content).toContain("# Chapter title\nCh 1");
  });
});

describe("summarize", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("trims surrounding whitespace from the LLM output", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "  hello world  \n" } }],
        model: "m",
      }),
    });
    const r = await summarize(
      { chapterText: "x", length: "S" },
      {
        transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
        model: "m",
        supabase: sb(),
      },
    );
    expect(r.text).toBe("hello world");
    expect(r.provider).toBe("local");
  });
});
