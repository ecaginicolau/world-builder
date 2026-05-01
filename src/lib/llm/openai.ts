import { supabase } from '@/lib/supabase';
import { buildMessages } from './prompt';
import type { LlmProvider, ChatRequest, ChatResponse } from './types';

export const openaiProvider: LlmProvider = {
  name: 'openai',
  async chat(req: ChatRequest, opts): Promise<ChatResponse> {
    const messages = buildMessages(req);
    const invokeOpts: Record<string, unknown> = {
      body: { messages, model: 'gpt-4o-mini' },
    };
    if (opts?.signal) invokeOpts.signal = opts.signal;
    const { data, error } = await supabase.functions.invoke('llm-call', invokeOpts);
    if (error) throw new Error(error.message ?? 'llm-call failed');
    if (!data || typeof data.content !== 'string') {
      throw new Error('llm-call returned an invalid payload');
    }
    return {
      content: data.content,
      model: data.model ?? 'gpt-4o-mini',
      provider: 'openai',
      tokensUsed: data.usage
        ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens }
        : undefined,
    };
  },
};
