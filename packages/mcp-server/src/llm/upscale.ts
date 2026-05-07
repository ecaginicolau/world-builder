import {
  llmCallWithRetry,
  providerTag,
  type ChatMessage,
  type TransportMode,
} from "./transport.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UpscaleEntityCard {
  id: string;
  name: string;
  type: string;
  snapshot: Record<string, string>;
}

export interface UpscaleRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  currentText: string;
  userPrompt: string;
  entityCards: UpscaleEntityCard[];
}

export interface UpscaleResult {
  text: string;
  model: string;
  provider: "openai" | "local";
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function buildUpscaleMessages(req: UpscaleRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    "You are helping rewrite a chapter for a long-form fiction project.",
    "Output ONLY the new chapter text, nothing else — no preamble, no explanation, no markdown fences.",
    "Preserve every plot fact already established in the current text unless the user explicitly asks to change one.",
    "Stay consistent with the entity snapshots and World Memory below; never contradict them.",
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push("", "# World Memory", req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push("", "# Author preferences", req.worldCustomPrompt.trim());
  }
  if (req.entityCards.length > 0) {
    const lines = req.entityCards.map((c) => {
      const fields = Object.entries(c.snapshot)
        .filter(([, v]) => v !== "" && v !== undefined && v !== null)
        .map(([k, v]) => `    ${k}: ${v}`)
        .join("\n");
      return `- ${c.name} (${c.type})${fields ? "\n" + fields : ""}`;
    });
    blocks.push("", "# Entities (current state)", lines.join("\n"));
  }
  if (req.chapterTitle) {
    blocks.push("", "# Chapter title", req.chapterTitle);
  }
  return [
    { role: "system", content: blocks.join("\n") },
    {
      role: "user",
      content: [
        "# Current chapter text",
        req.currentText.trim() || "(empty)",
        "",
        "# What I want",
        req.userPrompt.trim(),
      ].join("\n"),
    },
  ];
}

export interface RunOpts {
  transport: TransportMode;
  model: string;
  supabase: SupabaseClient;
}

export async function upscaleChapter(
  req: UpscaleRequest,
  opts: RunOpts,
): Promise<UpscaleResult> {
  const messages = buildUpscaleMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model },
    opts.transport,
    { supabase: opts.supabase },
  );
  return {
    text: response.content,
    model: response.model,
    provider: providerTag(opts.transport),
    usage: response.usage,
  };
}
