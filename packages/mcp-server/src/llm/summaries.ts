import {
  llmCallWithRetry,
  providerTag,
  type ChatMessage,
  type TransportMode,
} from "./transport.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SummaryLength = "S" | "M" | "L";

export interface SummarizeRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  length: SummaryLength;
}

export interface SummarizeResult {
  text: string;
  model: string;
  provider: "openai" | "local";
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const TARGET: Record<SummaryLength, string> = {
  S: "short summary (about 2 sentences, ~50 words)",
  M: "medium summary (one paragraph, ~150 words)",
  L: "long summary (3 to 5 paragraphs, ~400 words)",
};

export function buildSummarizeMessages(req: SummarizeRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    "You are summarizing a chapter from a long-form fiction project.",
    `Produce a ${TARGET[req.length]}.`,
    "Output ONLY the summary text — no preamble, no markdown headings, no commentary.",
    "Be faithful: only include facts present in the chapter text.",
    "Stay consistent with the World Memory style if provided.",
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push("", "# World Memory", req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push("", "# Author preferences", req.worldCustomPrompt.trim());
  }
  if (req.chapterTitle) {
    blocks.push("", "# Chapter title", req.chapterTitle);
  }
  return [
    { role: "system", content: blocks.join("\n") },
    {
      role: "user",
      content: ["# Chapter text", req.chapterText.trim() || "(empty)"].join("\n"),
    },
  ];
}

export interface RunOpts {
  transport: TransportMode;
  model: string;
  supabase: SupabaseClient;
}

export async function summarize(
  req: SummarizeRequest,
  opts: RunOpts,
): Promise<SummarizeResult> {
  const messages = buildSummarizeMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model },
    opts.transport,
    { supabase: opts.supabase },
  );
  return {
    text: response.content.trim(),
    model: response.model,
    provider: providerTag(opts.transport),
    usage: response.usage,
  };
}
