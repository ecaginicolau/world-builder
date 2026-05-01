export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  worldMemory?: string;
  noteContext?: string;
  history: ChatMessage[];
  userMessage: string;
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
