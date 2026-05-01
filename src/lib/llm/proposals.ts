import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { modelForTier } from './openai';
import type { ChatMessage, ModelTier } from './types';
import type { FieldDef } from '@/features/entities/types';

/**
 * One entity in scope for the propose-updates pass: its current snapshot at
 * the chapter's chronological_rank, and the FieldDef list it can be updated
 * against.
 */
export interface ProposalEntityCard {
  id: string;
  name: string;
  type: string;
  fields: FieldDef[];
  /** name → value (string repr) for the resolved snapshot. Empty if no version yet. */
  currentSnapshot: Record<string, string>;
}

export interface ProposalsRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  entityCards: ProposalEntityCard[];
  /** Defaults to 'medium'. */
  tier?: ModelTier;
}

const proposalSchema = z.object({
  entityId: z.string().uuid(),
  /** Map of field name → new value (string form). Only fields that change. */
  fieldChanges: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  justification: z.string().min(1),
});
export type Proposal = z.infer<typeof proposalSchema>;

const responseSchema = z.object({ proposals: z.array(proposalSchema) });

export function buildProposalsMessages(req: ProposalsRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    'You analyze a chapter of fiction and propose factual updates to the entities involved.',
    'Output JSON only with shape: { "proposals": [{ "entityId": uuid, "fieldChanges": { fieldName: newValue }, "justification": string }] }',
    'Rules:',
    '- ONLY propose a change if the chapter text strictly justifies it.',
    '- Use only the field names listed below for each entity. Do not invent new fields.',
    '- Match the field "kind": int → number, bool → true/false, string/text → string.',
    '- Omit fields that are unchanged. If an entity has nothing to update, do not include it.',
    '- "justification" is one short sentence quoting or paraphrasing the chapter evidence.',
    '- If nothing changes for any entity, return { "proposals": [] }.',
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push('', '# World Memory', req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push('', '# Author preferences', req.worldCustomPrompt.trim());
  }
  if (req.entityCards.length > 0) {
    const cards = req.entityCards.map((c) => {
      const fields = c.fields
        .map((f) => `    - ${f.name} (${f.kind})${f.required ? ' *required' : ''}`)
        .join('\n');
      const snap = Object.entries(c.currentSnapshot)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .map(([k, v]) => `    ${k}: ${v}`)
        .join('\n');
      return [
        `- entityId=${c.id} name="${c.name}" type=${c.type}`,
        `  fields:`,
        fields || '    (none)',
        `  current snapshot:`,
        snap || '    (empty)',
      ].join('\n');
    });
    blocks.push('', '# Entities in scope', cards.join('\n\n'));
  } else {
    blocks.push('', '# Entities in scope', '(none — return empty proposals array)');
  }
  return [
    { role: 'system', content: blocks.join('\n') },
    {
      role: 'user',
      content: [
        req.chapterTitle ? `# Chapter: ${req.chapterTitle}` : '# Chapter',
        req.chapterText.trim() || '(empty)',
      ].join('\n'),
    },
  ];
}

export interface ProposalsResult {
  proposals: Proposal[];
  model: string;
  provider: string;
}

export async function proposeUpdatesOpenai(req: ProposalsRequest): Promise<ProposalsResult> {
  const messages = buildProposalsMessages(req);
  const model = modelForTier(req.tier ?? 'medium');
  const { data, error } = await supabase.functions.invoke('llm-call', {
    body: {
      messages,
      model,
      response_format: { type: 'json_object' },
    },
  });
  if (error) throw new Error(error.message ?? 'proposals llm-call failed');
  if (!data || typeof data.content !== 'string') {
    throw new Error('proposals llm-call returned an invalid payload');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.content);
  } catch {
    throw new Error('proposals llm-call returned non-JSON content');
  }
  const valid = responseSchema.safeParse(parsed);
  if (!valid.success) {
    throw new Error(`proposals llm-call returned invalid schema: ${valid.error.message}`);
  }
  return { proposals: valid.data.proposals, model: data.model ?? model, provider: 'openai' };
}

export async function proposeUpdatesMock(req: ProposalsRequest): Promise<ProposalsResult> {
  await new Promise((r) => setTimeout(r, 200));
  // Mock: propose to bump any int field by 1 if the entity is mentioned in the text.
  const text = req.chapterText.toLowerCase();
  const proposals: Proposal[] = [];
  for (const card of req.entityCards) {
    if (!text.includes(card.name.toLowerCase())) continue;
    const intField = card.fields.find((f) => f.kind === 'int');
    if (!intField) continue;
    const cur = Number(card.currentSnapshot[intField.name] ?? 0);
    proposals.push({
      entityId: card.id,
      fieldChanges: { [intField.name]: cur + 1 },
      justification: `[mock] ${card.name} mentioned — bumped ${intField.name} by 1`,
    });
  }
  return { proposals, model: 'mock-proposals', provider: 'mock' };
}

export function getProposer(): (req: ProposalsRequest) => Promise<ProposalsResult> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'openai') return proposeUpdatesOpenai;
  return proposeUpdatesMock;
}
