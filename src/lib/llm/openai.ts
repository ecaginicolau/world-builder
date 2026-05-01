import { supabase } from '@/lib/supabase';
import { buildMessages } from './prompt';
import type {
  LlmProvider,
  ChatRequest,
  ChatResponse,
  ModelTier,
  ReasoningEffort,
} from './types';

const TIER_TO_MODEL: Record<ModelTier, string> = {
  cheapest: 'gpt-5.4-nano',
  medium: 'gpt-5.4-mini',
  best: 'gpt-5.4',
};

export function modelForTier(tier: ModelTier | undefined): string {
  return TIER_TO_MODEL[tier ?? 'medium'];
}

/** 'none' → undefined (effort field omitted from the OpenAI call). */
export function reasoningEffortToWire(
  effort: ReasoningEffort | undefined,
): Exclude<ReasoningEffort, 'none'> | undefined {
  if (!effort || effort === 'none') return undefined;
  return effort;
}

export const openaiProvider: LlmProvider = {
  name: 'openai',
  async chat(req: ChatRequest, opts): Promise<ChatResponse> {
    const messages = buildMessages(req);
    const model = modelForTier(req.tier);
    const reasoning = reasoningEffortToWire(req.reasoning);
    const body: Record<string, unknown> = { messages, model };
    if (reasoning) body.reasoning_effort = reasoning;

    const invokeOpts: Record<string, unknown> = { body };
    if (opts?.signal) invokeOpts.signal = opts.signal;
    const { data, error } = await supabase.functions.invoke('llm-call', invokeOpts);
    if (error) throw new Error(error.message ?? 'llm-call failed');
    if (!data || typeof data.content !== 'string') {
      throw new Error('llm-call returned an invalid payload');
    }
    return {
      content: data.content,
      model: data.model ?? model,
      provider: 'openai',
      tokensUsed: data.usage
        ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
        : undefined,
    };
  },
};
