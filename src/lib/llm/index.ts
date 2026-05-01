import { mockProvider } from './mock';
import { openaiProvider } from './openai';
import type { LlmProvider } from './types';

export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatRole,
  LlmProvider,
  ModelTier,
  ReasoningEffort,
} from './types';
export { buildMessages } from './prompt';

export function getLlm(): LlmProvider {
  const provider = (import.meta.env.VITE_LLM_PROVIDER ?? 'mock').toLowerCase();
  if (provider === 'openai') return openaiProvider;
  return mockProvider;
}
