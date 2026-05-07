import { z } from "zod";
import {
  llmCallWithRetry,
  providerTag,
  type ChatMessage,
  type TransportMode,
} from "./transport.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const entityCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(80),
  matchedEntityId: z.string().uuid().nullish(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;

const responseSchema = z.object({
  candidates: z.array(entityCandidateSchema),
});

export interface ExtractRequest {
  noteText: string;
  existing: { id: string; name: string; type: string; aliases?: string[] }[];
  knownTypes: string[];
}

export function buildExtractMessages(req: ExtractRequest): ChatMessage[] {
  const existing = req.existing
    .map(
      (e) =>
        `- ${e.name}${e.aliases?.length ? ` (aliases: ${e.aliases.join(", ")})` : ""} [id=${e.id}, type=${e.type}]`,
    )
    .join("\n");
  const types = req.knownTypes.length > 0 ? req.knownTypes.join(", ") : "(none yet)";
  return [
    {
      role: "system",
      content: [
        "You are an entity extraction model. Read the note text and find named entities likely to be characters, locations, factions, items, etc.",
        'Output JSON with shape: { "candidates": [{ "name": string, "type": string, "matchedEntityId"?: string }] }',
        "Rules:",
        '- "type" SHOULD be one of the known types if any of them fits; otherwise pick a sensible label.',
        '- If the candidate clearly matches an existing entity (same name or alias), set "matchedEntityId" to that id.',
        "- Do NOT include common nouns, verbs, or generic words.",
        "- Limit to at most 10 candidates per call. Prioritize the most specific named entities.",
        "",
        `Known entity types: ${types}`,
        "",
        "Existing entities for matching:",
        existing || "(none)",
      ].join("\n"),
    },
    { role: "user", content: req.noteText },
  ];
}

export interface ExtractResult {
  candidates: EntityCandidate[];
  model: string;
  provider: "openai" | "local";
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface RunOpts {
  transport: TransportMode;
  model: string;
  supabase: SupabaseClient;
}

export async function extractEntities(
  req: ExtractRequest,
  opts: RunOpts,
): Promise<ExtractResult> {
  const messages = buildExtractMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model, response_format: { type: "json_object" } },
    opts.transport,
    { supabase: opts.supabase },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new Error("extract: response was not valid JSON");
  }
  const valid = responseSchema.safeParse(parsed);
  if (!valid.success) {
    throw new Error(`extract: response schema invalid: ${valid.error.message}`);
  }
  return {
    candidates: valid.data.candidates,
    model: response.model,
    provider: providerTag(opts.transport),
    usage: response.usage,
  };
}
