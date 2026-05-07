import { z } from "zod";
import {
  llmCallWithRetry,
  providerTag,
  type ChatMessage,
  type TransportMode,
} from "./transport.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldDef } from "../versioning.js";

export interface CanonEntityCard {
  id: string;
  name: string;
  type: string;
  fields: FieldDef[];
  currentSnapshot: Record<string, string>;
}

export interface CanonRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  entityCards: CanonEntityCard[];
  existingEvents: { title: string; description: string | null }[];
}

const entityDiffSchema = z.object({
  entityId: z.string().uuid(),
  fieldChanges: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  justification: z.string().min(1),
});

const eventProposalSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  entityDiffs: z.array(entityDiffSchema).default([]),
});
export type EventDiff = z.infer<typeof entityDiffSchema>;
export type EventProposal = z.infer<typeof eventProposalSchema>;

const responseSchema = z.object({ events: z.array(eventProposalSchema) });

export function buildCanonMessages(req: CanonRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    "You analyze a chapter of fiction and extract the canonical EVENTS it depicts.",
    "An event is an atomic moment in the world that the chapter retells. Output JSON only with shape:",
    '{ "events": [ { "title": string, "description": string, "entityDiffs": [ { "entityId": uuid, "fieldChanges": { fieldName: newValue }, "justification": string } ] } ] }',
    "Rules:",
    "- Propose 1 to 5 events; only the most distinct, story-shaping moments. Prefer fewer.",
    '- Skip events that are already in the "Already in canon" list — propose ONLY new events.',
    '- "title" is short (3-8 words), "description" is one or two factual sentences.',
    '- "entityDiffs" is OPTIONAL per event. Only include when the chapter strictly justifies a field change for an entity in the entity list. Use only listed fields. Match the field "kind".',
    "- Do not invent entity ids — use only the ones provided.",
    '- "justification" is one short sentence quoting or paraphrasing the chapter evidence.',
    '- If nothing new happens in the chapter, return { "events": [] }.',
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push("", "# World Memory", req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push("", "# Author preferences", req.worldCustomPrompt.trim());
  }
  if (req.entityCards.length > 0) {
    const cards = req.entityCards.map((c) => {
      const fields = c.fields
        .map((f) => `    - ${f.name} (${f.kind})`)
        .join("\n");
      const snap = Object.entries(c.currentSnapshot)
        .filter(([, v]) => v !== "" && v !== undefined && v !== null)
        .map(([k, v]) => `    ${k}: ${v}`)
        .join("\n");
      return [
        `- entityId=${c.id} name="${c.name}" type=${c.type}`,
        `  fields:`,
        fields || "    (none)",
        `  current snapshot:`,
        snap || "    (empty)",
      ].join("\n");
    });
    blocks.push("", "# Entities in scope", cards.join("\n\n"));
  } else {
    blocks.push(
      "",
      "# Entities in scope",
      "(none — entityDiffs must be empty)",
    );
  }
  if (req.existingEvents.length > 0) {
    const lines = req.existingEvents.map(
      (e) => `- ${e.title}${e.description ? ` — ${e.description}` : ""}`,
    );
    blocks.push("", "# Already in canon (do NOT re-propose these)", lines.join("\n"));
  }
  return [
    { role: "system", content: blocks.join("\n") },
    {
      role: "user",
      content: [
        req.chapterTitle ? `# Chapter: ${req.chapterTitle}` : "# Chapter",
        req.chapterText.trim() || "(empty)",
      ].join("\n"),
    },
  ];
}

export interface CanonResult {
  events: EventProposal[];
  model: string;
  provider: "openai" | "local";
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface RunOpts {
  transport: TransportMode;
  model: string;
  supabase: SupabaseClient;
}

export async function proposeCanon(
  req: CanonRequest,
  opts: RunOpts,
): Promise<CanonResult> {
  const messages = buildCanonMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model, response_format: { type: "json_object" } },
    opts.transport,
    { supabase: opts.supabase },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new Error("propose-canon: response was not valid JSON");
  }
  const valid = responseSchema.safeParse(parsed);
  if (!valid.success) {
    throw new Error(`propose-canon: response schema invalid: ${valid.error.message}`);
  }
  return {
    events: valid.data.events,
    model: response.model,
    provider: providerTag(opts.transport),
    usage: response.usage,
  };
}
