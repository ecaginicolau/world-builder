export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Quality vs cost axis. Each provider maps these to one of its models.
 * - cheapest: small model, near-instant, drafting / classifications
 * - medium:   default for chat — good quality at low cost
 * - best:     for polished prose, complex reasoning, final outputs
 */
export type ModelTier = 'cheapest' | 'medium' | 'best';

/**
 * Reasoning effort axis (independent of tier).
 * - none:   no reasoning — fastest, default for live chat
 * - low / medium / high / xhigh: pay more thinking time for harder tasks
 */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ChatRequest {
  worldMemory?: string;
  noteTitle?: string;
  noteContext?: string;
  history: ChatMessage[];
  userMessage: string;
  /** Default 'medium'. */
  tier?: ModelTier;
  /** Default 'none'. */
  reasoning?: ReasoningEffort;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  tokensUsed?: { prompt?: number; completion?: number };
}

export interface LlmProvider {
  readonly name: string;
  chat(req: ChatRequest, opts?: { signal?: AbortSignal }): Promise<ChatResponse>;
}
