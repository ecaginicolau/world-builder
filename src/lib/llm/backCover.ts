import type { ChatMessage, ModelTier } from './types';
import { llmCallWithRetry, providerTag, type TransportMode } from './transport';
import { pickTransport, type RoutingSettings } from './routing';

/**
 * One chapter's contribution to the back-cover generation prompt.
 * Either `summary` (preferred — concise) or `text` (fallback) is sent;
 * never both.
 */
export interface BackCoverChapterInput {
  title: string | null;
  /** Pre-extracted summary (S/M/L picked by caller). Empty string if none. */
  summary: string;
  /** Plain-text final version. Used only when summary is empty. */
  text: string;
}

export type BackCoverSource = 'summary' | 'text';

export interface BackCoverRequest {
  worldMemory?: string;
  worldCustomPrompt?: string;
  bookTitle: string;
  /** Optional existing description, given to the model as soft tone guidance. */
  bookDescription?: string | null;
  /** Optional author guidance ("emphasize the love triangle", "PG-13", …). */
  userPrompt?: string;
  chapters: BackCoverChapterInput[];
  /** Which field of `chapters` was used — informational, included in the system prompt. */
  source: BackCoverSource;
  /** Defaults to 'best'. Cloud-only knob. */
  tier?: ModelTier;
}

export interface BackCoverResult {
  text: string;
  model: string;
  provider: string;
  tokensUsed?: { prompt?: number; completion?: number };
}

export function buildBackCoverMessages(req: BackCoverRequest): ChatMessage[] {
  const sys: string[] = [];
  sys.push(
    'You write the back-cover synopsis for a published novel.',
    'Goal: 120-200 words of persuasive marketing copy that makes a bookstore browser want to open the book.',
    'Open with a hook. Introduce the protagonist and stakes. Hint at the central conflict. End with intrigue, not resolution.',
    'NEVER spoil the ending or reveal late twists. Stay in present tense. Write in the voice of the book itself.',
    'Output ONLY the back-cover text — no preamble, no headings, no markdown fences, no quotation marks around the whole thing.',
  );
  if (req.worldMemory && req.worldMemory.trim()) {
    sys.push('', '# World Memory', req.worldMemory.trim());
  }
  if (req.worldCustomPrompt && req.worldCustomPrompt.trim()) {
    sys.push('', '# Author preferences', req.worldCustomPrompt.trim());
  }
  if (req.bookDescription && req.bookDescription.trim()) {
    sys.push('', '# Existing short description (tone reference, do not copy verbatim)', req.bookDescription.trim());
  }

  const user: string[] = [];
  user.push(`# Book title`, req.bookTitle);
  if (req.userPrompt && req.userPrompt.trim()) {
    user.push('', '# Author guidance for this back cover', req.userPrompt.trim());
  }
  user.push(
    '',
    req.source === 'summary'
      ? '# Chapter summaries (in reading order)'
      : '# Chapter full text (in reading order, truncated)',
  );
  if (req.chapters.length === 0) {
    user.push('(no chapter content available)');
  } else {
    req.chapters.forEach((c, i) => {
      const heading = `## Chapter ${i + 1}${c.title ? ` — ${c.title}` : ''}`;
      const body = req.source === 'summary' ? c.summary : c.text;
      user.push('', heading, body.trim() || '(empty)');
    });
  }

  return [
    { role: 'system', content: sys.join('\n') },
    { role: 'user', content: user.join('\n') },
  ];
}

export interface TransportOpts {
  transport: TransportMode;
  model: string;
}

export async function generateBackCover(
  req: BackCoverRequest,
  opts: TransportOpts,
): Promise<BackCoverResult> {
  const messages = buildBackCoverMessages(req);
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

export async function generateBackCoverMock(req: BackCoverRequest): Promise<BackCoverResult> {
  await new Promise((r) => setTimeout(r, 150));
  const titles = req.chapters
    .map((c, i) => c.title?.trim() || `Chapter ${i + 1}`)
    .slice(0, 3)
    .join(', ');
  const text = [
    `[mock back cover for "${req.bookTitle}"]`,
    `Across ${req.chapters.length} chapters (${titles}${req.chapters.length > 3 ? ', …' : ''}), a story unfolds.`,
    req.userPrompt?.trim() ? `(guidance honored: "${req.userPrompt.trim().slice(0, 60)}")` : '',
    `Source: ${req.source}. Will they prevail? Open the book to find out.`,
  ]
    .filter(Boolean)
    .join(' ');
  return { text, model: 'mock-back-cover', provider: 'mock' };
}

export type BackCoverGenerator = (req: BackCoverRequest) => Promise<BackCoverResult>;

function isMockEnv(): boolean {
  return ((import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase()) !== 'openai';
}

/**
 * Routes through the `upscale` task slot (same model class as chapter upscale —
 * a creative-writing task that benefits from a strong model). Falls back to
 * cloud tier when no local model is configured.
 */
export function getBackCoverGenerator(
  settings: RoutingSettings | undefined,
  opts: { forceCloud?: boolean } = {},
): BackCoverGenerator {
  if (isMockEnv()) return generateBackCoverMock;
  return async (req) => {
    const t = pickTransport(settings, 'upscale', req.tier ?? 'best', opts);
    return generateBackCover(req, { transport: t.mode, model: t.model });
  };
}
