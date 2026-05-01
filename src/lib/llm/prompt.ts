import type { ChatMessage, ChatRequest } from './types';

/**
 * Build the OpenAI-style messages array for the chat completion.
 * Slice 1: system = world memory + note context; then history; then user message.
 */
export function buildMessages(req: ChatRequest): ChatMessage[] {
  const systemParts: string[] = [];
  if (req.worldMemory && req.worldMemory.trim()) {
    systemParts.push(`# World memory\n${req.worldMemory.trim()}`);
  }
  if (req.noteContext && req.noteContext.trim()) {
    systemParts.push(`# Current note\n${req.noteContext.trim()}`);
  }
  const messages: ChatMessage[] = [];
  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: `${systemParts.join('\n\n')}\n\nYou are an assistant helping the author brainstorm and develop their world. Be concise.`,
    });
  }
  for (const m of req.history) {
    messages.push(m);
  }
  messages.push({ role: 'user', content: req.userMessage });
  return messages;
}
