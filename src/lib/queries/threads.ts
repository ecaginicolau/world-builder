import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatThread } from '@/features/notes/types';

export type ThreadParentKind = 'note' | 'chapter' | 'entity';

export const threadsKeys = {
  byParent: (kind: ThreadParentKind, id: string) =>
    ['threads', 'byParent', kind, id] as const,
  messages: (threadId: string) => ['threads', threadId, 'messages'] as const,
};

export function useThreads(parentKind: ThreadParentKind, parentId: string) {
  return useQuery<ChatThread[], Error>({
    queryKey: threadsKeys.byParent(parentKind, parentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('parent_kind', parentKind)
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatThread[];
    },
    enabled: !!parentId,
  });
}

export function useMessages(threadId: string | null) {
  return useQuery<ChatMessage[], Error>({
    queryKey: threadId ? threadsKeys.messages(threadId) : ['threads', 'no-thread'],
    queryFn: async () => {
      if (!threadId) return [];
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    enabled: !!threadId,
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation<
    ChatThread,
    Error,
    {
      worldId: string;
      ownerId: string;
      parentKind: ThreadParentKind;
      parentId: string;
      title?: string | null;
    }
  >({
    mutationFn: async ({ worldId, ownerId, parentKind, parentId, title }) => {
      const { data, error } = await supabase
        .from('chat_threads')
        .insert({
          world_id: worldId,
          owner_id: ownerId,
          parent_kind: parentKind,
          parent_id: parentId,
          title: title ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ChatThread;
    },
    onSuccess: (thread) => {
      void qc.invalidateQueries({
        queryKey: threadsKeys.byParent(
          thread.parent_kind as ThreadParentKind,
          thread.parent_id,
        ),
      });
    },
  });
}

export function useInsertMessage() {
  const qc = useQueryClient();
  return useMutation<
    ChatMessage,
    Error,
    {
      threadId: string;
      ownerId: string;
      role: 'system' | 'user' | 'assistant';
      content: string;
      model?: string | null;
      provider?: string | null;
      tokensUsed?: { prompt?: number; completion?: number } | null;
    }
  >({
    mutationFn: async ({ threadId, ownerId, role, content, model, provider, tokensUsed }) => {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          thread_id: threadId,
          owner_id: ownerId,
          role,
          content,
          model: model ?? null,
          provider: provider ?? null,
          tokens_used: tokensUsed ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ChatMessage;
    },
    onSuccess: (message) => {
      void qc.invalidateQueries({ queryKey: threadsKeys.messages(message.thread_id) });
    },
  });
}
