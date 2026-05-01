import { supabase } from '@/lib/supabase';
import { modelForTier } from './openai';
import type { ChatMessage, ModelTier } from './types';

export type SummaryLength = 'S' | 'M' | 'L';

export interface SummarizeRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  chapterTitle?: string;
  chapterText: string;
  length: SummaryLength;
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

export async function summarizeOpenai(req: SummarizeRequest): Promise<SummarizeResult> {
  const messages = buildSummarizeMessages(req);
  const model = modelForTier(req.tier ?? 'cheapest');
  const { data, error } = await supabase.functions.invoke('llm-call', {
    body: { messages, model },
  });
  if (error) throw new Error(error.message ?? 'summarize llm-call failed');
  if (!data || typeof data.content !== 'string') {
    throw new Error('summarize llm-call returned an invalid payload');
  }
  return {
    text: data.content.trim(),
    model: data.model ?? model,
    provider: 'openai',
    tokensUsed: data.usage
      ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
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

export function getSummarizer(): (req: SummarizeRequest) => Promise<SummarizeResult> {
  const provider = (import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'openai') return summarizeOpenai;
  return summarizeMock;
}
