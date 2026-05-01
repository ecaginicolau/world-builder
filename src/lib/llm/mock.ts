import type { LlmProvider, ChatRequest, ChatResponse } from './types';

export const mockProvider: LlmProvider = {
  name: 'mock',
  async chat(req: ChatRequest): Promise<ChatResponse> {
    await new Promise((r) => setTimeout(r, 200));
    const truncated = req.userMessage.length > 80
      ? req.userMessage.slice(0, 77) + '…'
      : req.userMessage;
    const ctx = req.noteContext ? ' (with note context)' : '';
    const tier = req.tier ?? 'medium';
    const reasoning = req.reasoning ?? 'none';
    return {
      content: `[mock ${tier}/${reasoning}]${ctx} I heard: "${truncated}"`,
      model: `mock-${tier}`,
      provider: 'mock',
      tokensUsed: { prompt: 0, completion: 0 },
    };
  },
};
