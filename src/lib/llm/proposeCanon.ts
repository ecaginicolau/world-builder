import { z } from 'zod';
import type { ChatMessage, ModelTier } from './types';
import { llmCallWithRetry, providerTag, type TransportMode } from './transport';
import { pickTransport, type RoutingSettings } from './routing';
import type { FieldDef } from '@/features/entities/types';

/**
 * One entity in scope for a "propose canon from chapter" pass: its current
 * snapshot at the chapter's derived chrono (or current state if unanchored),
 * and the FieldDef list it can be updated against.
 */
export interface CanonEntityCard {
  id: string;
  name: string;
  type: string;
  fields: FieldDef[];
  /** name → value (string repr) for the resolved snapshot. Empty if no version yet. */
  currentSnapshot: Record<string, string>;
}

export interface CanonRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  /** Entities the chapter is linked to. The LLM may also leave entityIds empty. */
  entityCards: CanonEntityCard[];
  /** Already-linked events on this chapter — for "don't repropose what's canon". */
  existingEvents: { title: string; description: string | null }[];
  /** Defaults to 'medium'. Cloud-only knob. */
  tier?: ModelTier;
}

const entityDiffSchema = z.object({
  entityId: z.string().uuid(),
  fieldChanges: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  justification: z.string().min(1),
});

const eventProposalSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  /** May be empty. Each diff updates one entity that is already linked. */
  entityDiffs: z.array(entityDiffSchema).default([]),
});
export type EventDiff = z.infer<typeof entityDiffSchema>;
export type EventProposal = z.infer<typeof eventProposalSchema>;

const responseSchema = z.object({ events: z.array(eventProposalSchema) });

export function buildCanonMessages(req: CanonRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    'You analyze a chapter of fiction and extract the canonical EVENTS it depicts.',
    'An event is an atomic moment in the world that the chapter retells. Output JSON only with shape:',
    '{ "events": [ { "title": string, "description": string, "entityDiffs": [ { "entityId": uuid, "fieldChanges": { fieldName: newValue }, "justification": string } ] } ] }',
    'Rules:',
    '- Propose 1 to 5 events; only the most distinct, story-shaping moments. Prefer fewer.',
    '- Skip events that are already in the "Already in canon" list — propose ONLY new events.',
    '- "title" is short (3-8 words), "description" is one or two factual sentences.',
    '- "entityDiffs" is OPTIONAL per event. Only include when the chapter strictly justifies a field change for an entity in the entity list. Use only listed fields. Match the field "kind".',
    '- Do not invent entity ids — use only the ones provided.',
    '- "justification" is one short sentence quoting or paraphrasing the chapter evidence.',
    '- If nothing new happens in the chapter, return { "events": [] }.',
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
    blocks.push('', '# Entities in scope', '(none — entityDiffs must be empty)');
  }
  if (req.existingEvents.length > 0) {
    const lines = req.existingEvents.map(
      (e) => `- ${e.title}${e.description ? ` — ${e.description}` : ''}`,
    );
    blocks.push('', '# Already in canon (do NOT re-propose these)', lines.join('\n'));
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

export interface CanonResult {
  events: EventProposal[];
  model: string;
  provider: string;
}

export interface TransportOpts {
  transport: TransportMode;
  model: string;
}

export async function proposeCanon(
  req: CanonRequest,
  opts: TransportOpts,
): Promise<CanonResult> {
  const messages = buildCanonMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model, response_format: { type: 'json_object' } },
    opts.transport,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new Error('propose-canon: response was not valid JSON');
  }
  const valid = responseSchema.safeParse(parsed);
  if (!valid.success) {
    throw new Error(`propose-canon: response schema invalid: ${valid.error.message}`);
  }
  return {
    events: valid.data.events,
    model: response.model,
    provider: providerTag(opts.transport),
  };
}

export async function proposeCanonMock(req: CanonRequest): Promise<CanonResult> {
  await new Promise((r) => setTimeout(r, 200));
  // Mock: emit one event "Mock event from chapter X" with diffs that bump int fields by 1.
  const text = req.chapterText.toLowerCase();
  const diffs: EventDiff[] = [];
  for (const card of req.entityCards) {
    if (!text.includes(card.name.toLowerCase())) continue;
    const intField = card.fields.find((f) => f.kind === 'int');
    if (!intField) continue;
    const cur = Number(card.currentSnapshot[intField.name] ?? 0);
    diffs.push({
      entityId: card.id,
      fieldChanges: { [intField.name]: cur + 1 },
      justification: `[mock] ${card.name} mentioned — bumped ${intField.name} by 1`,
    });
  }
  const events: EventProposal[] =
    diffs.length === 0 && req.entityCards.length === 0
      ? []
      : [
          {
            title: req.chapterTitle ? `Echoes of ${req.chapterTitle}` : 'New mock event',
            description: '[mock] derived from chapter prose.',
            entityDiffs: diffs,
          },
        ];
  return { events, model: 'mock-canon', provider: 'mock' };
}

export type CanonProposer = (req: CanonRequest) => Promise<CanonResult>;

function isMockEnv(): boolean {
  return ((import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase()) !== 'openai';
}

export function getCanonProposer(
  settings: RoutingSettings | undefined,
  opts: { forceCloud?: boolean } = {},
): CanonProposer {
  if (isMockEnv()) return proposeCanonMock;
  return async (req) => {
    const t = pickTransport(settings, 'proposals', req.tier ?? 'medium', opts);
    return proposeCanon(req, { transport: t.mode, model: t.model });
  };
}
