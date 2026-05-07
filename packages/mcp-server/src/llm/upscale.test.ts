import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildUpscaleMessages, upscaleChapter } from "./upscale.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const sb = () => ({}) as unknown as SupabaseClient;

describe("buildUpscaleMessages", () => {
  it("builds system + user with current text and user prompt", () => {
    const msgs = buildUpscaleMessages({
      worldMemory: "WM",
      chapterTitle: "Ch 1",
      currentText: "Old prose.",
      userPrompt: "Make it darker.",
      entityCards: [
        {
          id: "e1",
          name: "Iria",
          type: "Character",
          snapshot: { hp: "10", scar: "" },
        },
      ],
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].content).toContain("# World Memory\nWM");
    expect(msgs[0].content).toContain("Iria (Character)");
    expect(msgs[0].content).toContain("hp: 10");
    expect(msgs[0].content).not.toContain("scar:");
    expect(msgs[0].content).toContain("# Chapter title\nCh 1");
    expect(msgs[1].content).toContain("# Current chapter text\nOld prose.");
    expect(msgs[1].content).toContain("# What I want\nMake it darker.");
  });

  it("handles empty current text gracefully", () => {
    const msgs = buildUpscaleMessages({
      currentText: "",
      userPrompt: "Write something",
      entityCards: [],
    });
    expect(msgs[1].content).toContain("(empty)");
  });
});

describe("upscaleChapter", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("returns the LLM-generated text and provider tag", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Upscaled prose." } }],
        model: "qwen2.5:32b",
      }),
    });
    const r = await upscaleChapter(
      {
        currentText: "x",
        userPrompt: "improve",
        entityCards: [],
      },
      {
        transport: { kind: "local", endpoint: "http://localhost:11434/v1" },
        model: "qwen2.5:32b",
        supabase: sb(),
      },
    );
    expect(r.text).toBe("Upscaled prose.");
    expect(r.provider).toBe("local");
    expect(r.model).toBe("qwen2.5:32b");
  });
});
