import type { ChatMessage, ChatRequest } from './types';

/**
 * Build the OpenAI-style messages array for the chat completion.
 * Slice 1 prompt = system (world memory + note title + note body) ; history ; user message.
 */
export function buildMessages(req: ChatRequest): ChatMessage[] {
  const systemParts: string[] = [];

  if (req.worldMemory && req.worldMemory.trim()) {
    systemParts.push(`# World memory\n${req.worldMemory.trim()}`);
  }

  const hasTitle = !!req.noteTitle && req.noteTitle.trim().length > 0;
  const hasBody = !!req.noteContext && req.noteContext.trim().length > 0;
  if (hasTitle || hasBody) {
    const lines: string[] = ['# Note the user is currently editing'];
    lines.push(`Title: ${hasTitle ? req.noteTitle!.trim() : '(untitled)'}`);
    lines.push('Body:');
    lines.push(hasBody ? req.noteContext!.trim() : '(empty)');
    systemParts.push(lines.join('\n'));
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
