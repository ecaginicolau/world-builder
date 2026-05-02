import type { ChatMessage, ModelTier } from './types';
import { llmCallWithRetry, providerTag, type TransportMode } from './transport';
import { pickTransport, type RoutingSettings } from './routing';
import type { PccSlot } from '@/features/chapters/pcc';
import { formatPccBlock } from '@/features/chapters/pcc';

/** A snapshot of an entity, resolved at the chapter's chronological_rank. */
export interface UpscaleEntityCard {
  id: string;
  name: string;
  type: string;
  /** Field name → display value. Empty object if no version exists at the rank. */
  snapshot: Record<string, string>;
}

export interface UpscaleRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  /** The current text of the chapter version we're upscaling from. */
  currentText: string;
  /** What the user wants done. Free-form, mandatory (the whole point). */
  userPrompt: string;
  /** Linked entity cards, resolved at the chapter's chronological_rank. */
  entityCards: UpscaleEntityCard[];
  /** Optional previous-chapter context. Empty array if disabled. */
  previousChapters?: PccSlot[];
  /** Defaults to 'best'. Cloud-only knob. */
  tier?: ModelTier;
}

export interface UpscaleResult {
  /** The new chapter text proposed by the LLM. */
  text: string;
  model: string;
  provider: string;
  tokensUsed?: { prompt?: number; completion?: number };
}

export function buildUpscaleMessages(req: UpscaleRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    'You are helping rewrite a chapter for a long-form fiction project.',
    'Output ONLY the new chapter text, nothing else — no preamble, no explanation, no markdown fences.',
    'Preserve every plot fact already established in the current text unless the user explicitly asks to change one.',
    'Stay consistent with the entity snapshots and World Memory below; never contradict them.',
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push('', '# World Memory', req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push('', '# Author preferences', req.worldCustomPrompt.trim());
  }
  if (req.entityCards.length > 0) {
    const lines = req.entityCards.map((c) => {
      const fields = Object.entries(c.snapshot)
        .filter(([, v]) => v !== '' && v !== undefined && v !== null)
        .map(([k, v]) => `    ${k}: ${v}`)
        .join('\n');
      return `- ${c.name} (${c.type})${fields ? '\n' + fields : ''}`;
    });
    blocks.push(
      '',
      '# Entities (state at this chapter\'s chronological rank)',
      lines.join('\n'),
    );
  }
  if (req.previousChapters && req.previousChapters.length > 0) {
    const block = formatPccBlock(req.previousChapters);
    if (block) blocks.push('', block);
  }
  if (req.chapterTitle) {
    blocks.push('', `# Chapter title`, req.chapterTitle);
  }
  return [
    { role: 'system', content: blocks.join('\n') },
    {
      role: 'user',
      content: [
        '# Current chapter text',
        req.currentText.trim() || '(empty)',
        '',
        '# What I want',
        req.userPrompt.trim(),
      ].join('\n'),
    },
  ];
}

export interface TransportOpts {
  transport: TransportMode;
  model: string;
}

export async function upscaleChapter(
  req: UpscaleRequest,
  opts: TransportOpts,
): Promise<UpscaleResult> {
  const messages = buildUpscaleMessages(req);
  const response = await llmCallWithRetry(
    { messages, model: opts.model },
    opts.transport,
  );
  return {
    text: response.content,
    model: response.model,
    provider: providerTag(opts.transport),
    tokensUsed: response.usage
      ? { prompt: response.usage.prompt_tokens, completion: response.usage.completion_tokens }
      : undefined,
  };
}

export async function upscaleChapterMock(req: UpscaleRequest): Promise<UpscaleResult> {
  await new Promise((r) => setTimeout(r, 200));
  const text = [
    `[mock upscale: "${req.userPrompt.slice(0, 40)}"]`,
    req.currentText.trim() || '(no source text)',
    `[/mock: ${req.entityCards.length} entity card(s) considered]`,
  ].join('\n\n');
  return { text, model: 'mock-upscale', provider: 'mock' };
}

export type Upscaler = (req: UpscaleRequest) => Promise<UpscaleResult>;

function isMockEnv(): boolean {
  return ((import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase()) !== 'openai';
}

export function getUpscaler(
  settings: RoutingSettings | undefined,
  opts: { forceCloud?: boolean } = {},
): Upscaler {
  if (isMockEnv()) return upscaleChapterMock;
  return async (req) => {
    const t = pickTransport(settings, 'upscale', req.tier ?? 'best', opts);
    return upscaleChapter(req, { transport: t.mode, model: t.model });
  };
}
