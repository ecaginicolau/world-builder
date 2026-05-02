import type { ChatMessage, ModelTier } from './types';
import { llmCallWithRetry, providerTag, type TransportMode } from './transport';
import { pickTransport, type RoutingSettings } from './routing';

export type SummaryLength = 'S' | 'M' | 'L';

export interface SummarizeRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  length: SummaryLength;
  /** Cloud-only knob. */
  tier?: ModelTier;
}

export interface SummarizeResult {
  text: string;
  model: string;
  provider: string;
  tokensUsed?: { prompt?: number; completion?: number };
}

const TARGET: Record<SummaryLength, string> = {
  S: 'short summary (about 2 sentences, ~50 words)',
  M: 'medium summary (one paragraph, ~150 words)',
  L: 'long summary (3 to 5 paragraphs, ~400 words)',
};

export function buildSummarizeMessages(req: SummarizeRequest): ChatMessage[] {
  const blocks: string[] = [];
  blocks.push(
    'You are summarizing a chapter from a long-form fiction project.',
    `Produce a ${TARGET[req.length]}.`,
    'Output ONLY the summary text — no preamble, no markdown headings, no commentary.',
    'Be faithful: only include facts present in the chapter text.',
    'Stay consistent with the World Memory style if provided.',
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    blocks.push('', '# World Memory', req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    blocks.push('', '# Author preferences', req.worldCustomPrompt.trim());
  }
  if (req.chapterTitle) {
    blocks.push('', '# Chapter title', req.chapterTitle);
  }
  return [
    { role: 'system', content: blocks.join('\n') },
    {
      role: 'user',
      content: ['# Chapter text', req.chapterText.trim() || '(empty)'].join('\n'),
    },
  ];
}

export interface TransportOpts {
  transport: TransportMode;
  model: string;
}

export async function summarize(
  req: SummarizeRequest,
  opts: TransportOpts,
): Promise<SummarizeResult> {
  const messages = buildSummarizeMessages(req);
  const response = await llmCallWithRetry({ messages, model: opts.model }, opts.transport);
  return {
    text: response.content.trim(),
    model: response.model,
    provider: providerTag(opts.transport),
    tokensUsed: response.usage
      ? { prompt: response.usage.prompt_tokens, completion: response.usage.completion_tokens }
      : undefined,
  };
}

export async function summarizeMock(req: SummarizeRequest): Promise<SummarizeResult> {
  await new Promise((r) => setTimeout(r, 100));
  const head = req.chapterText.trim().slice(0, 80) || '(empty)';
  const text =
    req.length === 'S'
      ? `[mock S] ${head}…`
      : req.length === 'M'
        ? `[mock M paragraph] ${head}\n…`
        : `[mock L summary]\n\n${head}\n\nLorem ipsum dolor sit amet.\n\nConsectetur adipiscing elit.`;
  return { text, model: 'mock-summarize', provider: 'mock' };
}

export type Summarizer = (req: SummarizeRequest) => Promise<SummarizeResult>;

function isMockEnv(): boolean {
  return ((import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase()) !== 'openai';
}

export function getSummarizer(
  settings: RoutingSettings | undefined,
  opts: { forceCloud?: boolean } = {},
): Summarizer {
  if (isMockEnv()) return summarizeMock;
  return async (req) => {
    const t = pickTransport(settings, 'summaries', req.tier ?? 'cheapest', opts);
    return summarize(req, { transport: t.mode, model: t.model });
  };
}
