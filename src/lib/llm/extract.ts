import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { modelForTier } from './openai';
import type { ChatMessage } from './types';

export const entityCandidateSchema = z.object({
  name: z.string().min(1).max(200),
  /** LLM's best guess of the entity type by name (e.g. "Character", "Location"). */
  type: z.string().min(1).max(80),
  /** If the LLM matched the candidate to a known entity, the matched id. */
  matchedEntityId: z.string().uuid().optional(),
});
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;

const responseSchema = z.object({
  candidates: z.array(entityCandidateSchema),
});

export interface ExtractRequest {
  noteText: string;
  /** Existing entities for the world, used by the LLM to match candidates. */
  existing: { id: string; name: string; type: string; aliases?: string[] }[];
  /** Known type names (e.g. ["Character", "Location"]) the LLM should pick from. */
  knownTypes: string[];
}

export function buildExtractMessages(req: ExtractRequest): ChatMessage[] {
  const existing = req.existing
    .map((e) => `- ${e.name}${e.aliases?.length ? ` (aliases: ${e.aliases.join(', ')})` : ''} [id=${e.id}, type=${e.type}]`)
    .join('\n');
  const types = req.knownTypes.length > 0 ? req.knownTypes.join(', ') : '(none yet)';
  return [
    {
      role: 'system',
      content: [
        'You are an entity extraction model. Read the note text and find named entities likely to be characters, locations, factions, items, etc.',
        'Output JSON with shape: { "candidates": [{ "name": string, "type": string, "matchedEntityId"?: string }] }',
        'Rules:',
        '- "type" SHOULD be one of the known types if any of them fits; otherwise pick a sensible label.',
        '- If the candidate clearly matches an existing entity (same name or alias), set "matchedEntityId" to that id.',
        '- Do NOT include common nouns, verbs, or generic words.',
        '- Limit to at most 10 candidates per call. Prioritize the most specific named entities.',
        '',
        `Known entity types: ${types}`,
        '',
        'Existing entities for matching:',
        existing || '(none)',
      ].join('\n'),
    },
    {
      role: 'user',
      content: req.noteText,
    },
  ];
}

export interface ExtractResult {
  candidates: EntityCandidate[];
  model: string;
  provider: string;
}

export async function extractEntitiesOpenai(req: ExtractRequest): Promise<ExtractResult> {
  const messages = buildExtractMessages(req);
  const model = modelForTier('cheapest');
  const { data, error } = await supabase.functions.invoke('llm-call', {
    body: {
      messages,
      model,
      response_format: { type: 'json_object' },
    },
  });
  if (error) throw new Error(error.message ?? 'extract llm-call failed');
  if (!data || typeof data.content !== 'string') {
    throw new Error('extract llm-call returned an invalid payload');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.content);
  } catch {
    throw new Error('extract llm-call returned non-JSON content');
  }
  const valid = responseSchema.safeParse(parsed);
  if (!valid.success) {
    throw new Error(`extract llm-call returned invalid schema: ${valid.error.message}`);
  }
  return {
    candidates: valid.data.candidates,
    model: data.model ?? model,
    provider: 'openai',
  };
}

export async function extractEntitiesMock(req: ExtractRequest): Promise<ExtractResult> {
  await new Promise((r) => setTimeout(r, 150));
  const text = req.noteText.toLowerCase();
  const candidates: EntityCandidate[] = [];
  const seenLower = new Set<string>();
  // Naïve pattern: capitalized words 3+ chars, dedupe.
  const matches = req.noteText.match(/\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]{2,}\b/g) ?? [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    const matchedExisting = req.existing.find(
      (e) =>
        e.name.toLowerCase() === lower ||
        (e.aliases ?? []).some((a) => a.toLowerCase() === lower),
    );
    candidates.push({
      name: m,
      type: matchedExisting?.type ?? req.knownTypes[0] ?? 'Character',
      matchedEntityId: matchedExisting?.id,
    });
    if (candidates.length >= 5) break;
  }
  // Cheap heuristic: include "Iria" or "forteresse" demo cues if present.
  if (text.includes('iria') && !candidates.some((c) => c.name.toLowerCase() === 'iria')) {
    candidates.push({ name: 'Iria', type: req.knownTypes[0] ?? 'Character' });
  }
  return { candidates, model: 'mock-cheapest', provider: 'mock' };
}

export function getExtractor(): (req: ExtractRequest) => Promise<ExtractResult> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'openai') return extractEntitiesOpenai;
  return extractEntitiesMock;
}
