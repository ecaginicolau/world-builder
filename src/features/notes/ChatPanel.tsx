import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useCreateThread,
  useInsertMessage,
  useMessages,
  useThreads,
  type ThreadParentKind,
} from '@/lib/queries/threads';
import { useQueryClient } from '@tanstack/react-query';
import { logRun } from '@/lib/queries/runs';
import { useSession } from '@/features/auth/session';
import {
  getLlm,
  type ChatMessage as LlmChatMessage,
  type ModelTier,
  type ReasoningEffort,
  type TaggedEntity,
} from '@/lib/llm';
import type { ChatThread } from './types';

interface Props {
  parentKind: ThreadParentKind;
  parentId: string;
  worldId: string;
  worldMemory?: string;
  worldCustomPrompt?: string;
  noteTitle?: string;
  noteContextText: string;
  taggedEntities?: TaggedEntity[];
  /**
   * If provided AND the user has the PCC checkbox enabled, called at send-time to
   * fetch the previous-chapter context block. Returning '' (or null/undefined)
   * means "no previous chapters available" — the checkbox stays visible but the
   * prompt isn't augmented.
   */
  buildPccBlock?: () => Promise<string>;
  /** Number of slots in the PCC config (drives checkbox visibility). 0 hides it. */
  pccSlotCount?: number;
}

const TIERS: { value: ModelTier; label: string }[] = [
  { value: 'cheapest', label: 'Fast' },
  { value: 'medium', label: 'Balanced' },
  { value: 'best', label: 'Best' },
];

const EFFORTS: ReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];

export function ChatPanel({
  parentKind,
  parentId,
  worldId,
  worldMemory,
  worldCustomPrompt,
  noteTitle,
  noteContextText,
  taggedEntities,
  buildPccBlock,
  pccSlotCount = 0,
}: Props) {
  const session = useSession();
  const qc = useQueryClient();
  const threadsQ = useThreads(parentKind, parentId);
  const createThread = useCreateThread();
  const insertMessage = useInsertMessage();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<ModelTier>('medium');
  const [reasoning, setReasoning] = useState<ReasoningEffort>('none');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [includePcc, setIncludePcc] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset active thread on parent switch (e.g. user navigates to a different note/chapter).
  useEffect(() => {
    setActiveThreadId(null);
  }, [parentKind, parentId]);

  useEffect(() => {
    if (!activeThreadId && threadsQ.data && threadsQ.data.length > 0) {
      setActiveThreadId(threadsQ.data[0].id);
    }
  }, [threadsQ.data, activeThreadId]);

  const messagesQ = useMessages(activeThreadId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQ.data?.length]);

  async function ensureThread(): Promise<ChatThread | null> {
    if (session.status !== 'authed') return null;
    if (activeThreadId && threadsQ.data) {
      const t = threadsQ.data.find((t) => t.id === activeThreadId);
      if (t) return t;
    }
    const t = await createThread.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      parentKind,
      parentId,
    });
    setActiveThreadId(t.id);
    return t;
  }

  async function newThread() {
    if (session.status !== 'authed') return;
    const t = await createThread.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      parentKind,
      parentId,
    });
    setActiveThreadId(t.id);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending || !input.trim() || session.status !== 'authed') return;
    setError(null);
    setSending(true);
    const userText = input.trim();
    setInput('');
    const ownerId = session.session.user.id;
    const startedAt = performance.now();
    let activeThread: ChatThread | null = null;
    try {
      activeThread = await ensureThread();
      if (!activeThread) return;

      await insertMessage.mutateAsync({
        threadId: activeThread.id,
        ownerId,
        role: 'user',
        content: userText,
      });

      const history: LlmChatMessage[] = (messagesQ.data ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let pccBlock = '';
      if (includePcc && buildPccBlock) {
        try {
          pccBlock = await buildPccBlock();
        } catch (e) {
          console.warn('[chat] PCC build failed, sending without:', e);
        }
      }

      const llm = getLlm();
      const resp = await llm.chat({
        worldMemory,
        worldCustomPrompt,
        noteTitle,
        noteContext: noteContextText,
        taggedEntities,
        previousChaptersBlock: pccBlock,
        history,
        userMessage: userText,
        tier,
        reasoning,
      });

      await insertMessage.mutateAsync({
        threadId: activeThread.id,
        ownerId,
        role: 'assistant',
        content: resp.content,
        model: resp.model,
        provider: resp.provider,
        tokensUsed: resp.tokensUsed ?? null,
      });

      void logRun({
        worldId,
        ownerId,
        kind: 'chat',
        parentKind: 'thread',
        parentId: activeThread.id,
        model: resp.model,
        provider: resp.provider,
        status: 'success',
        durationMs: Math.round(performance.now() - startedAt),
        usage: resp.tokensUsed ?? null,
        inputSummary: { tier, reasoning, parentKind, parentId, historyLength: history.length },
      }).then(() => {
        void qc.invalidateQueries({ queryKey: ['runs'] });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      void logRun({
        worldId,
        ownerId,
        kind: 'chat',
        parentKind: activeThread ? 'thread' : (parentKind as 'note' | 'chapter' | 'event'),
        parentId: activeThread?.id ?? parentId,
        model: 'unknown',
        provider: getLlm().name,
        status: 'error',
        durationMs: Math.round(performance.now() - startedAt),
        errorMessage: msg.slice(0, 1000),
        inputSummary: { tier, reasoning, parentKind, parentId },
      }).then(() => {
        void qc.invalidateQueries({ queryKey: ['runs'] });
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <aside
      className="flex h-full flex-col rounded-md border border-border bg-bg-panel"
      data-testid="chat-panel"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-medium">
          Chat {threadsQ.data && threadsQ.data.length > 1
            ? `· ${threadsQ.data.findIndex((t) => t.id === activeThreadId) + 1}/${threadsQ.data.length}`
            : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg"
            data-testid="chat-settings-toggle"
            title={`Tier: ${tier} · reasoning: ${reasoning}`}
          >
            ⚙
          </button>
          {threadsQ.data && threadsQ.data.length > 0 ? (
            <select
              value={activeThreadId ?? ''}
              onChange={(e) => setActiveThreadId(e.target.value || null)}
              className="bg-bg-subtle px-2 py-1 text-xs"
              data-testid="thread-select"
            >
              {threadsQ.data.map((t, i) => (
                <option key={t.id} value={t.id}>
                  {t.title ?? `Thread ${i + 1}`}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={newThread}
            className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg"
            data-testid="new-thread"
          >
            New
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div className="space-y-2 border-b border-border px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 text-fg-muted">Quality</span>
            <div className="flex gap-1" data-testid="chat-tier-group">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTier(t.value)}
                  className={
                    'px-2 py-1 text-xs ' +
                    (tier === t.value
                      ? 'bg-accent text-accent-fg'
                      : 'bg-bg-subtle hover:bg-bg')
                  }
                  data-testid={`chat-tier-${t.value}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-fg-muted">Reasoning</span>
            <select
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value as ReasoningEffort)}
              className="bg-bg-subtle px-2 py-1 text-xs"
              data-testid="chat-reasoning"
            >
              {EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          {pccSlotCount > 0 && buildPccBlock ? (
            <label className="flex items-center gap-2" data-testid="chat-pcc-toggle">
              <input
                type="checkbox"
                checked={includePcc}
                onChange={(e) => setIncludePcc(e.target.checked)}
              />
              <span>
                Include previous {pccSlotCount} chapter{pccSlotCount > 1 ? 's' : ''} as context
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-3"
        data-testid="chat-messages"
      >
        {!activeThreadId ? (
          <p className="text-sm text-fg-muted">Type below to start a thread.</p>
        ) : messagesQ.isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : messagesQ.data && messagesQ.data.length === 0 ? (
          <p className="text-sm text-fg-muted">No messages yet.</p>
        ) : (
          messagesQ.data?.map((m) => (
            <div
              key={m.id}
              className={
                m.role === 'user'
                  ? 'self-end whitespace-pre-wrap rounded-md bg-accent/30 px-3 py-2 text-sm'
                  : 'whitespace-pre-wrap rounded-md bg-bg-subtle px-3 py-2 text-sm'
              }
              data-testid={`chat-message-${m.role}`}
            >
              {m.content}
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="px-3 py-1 text-xs text-red-400" data-testid="chat-error">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t border-border p-2"
        data-testid="chat-form"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this…"
          className="flex-1 px-3 py-2 text-sm"
          data-testid="chat-input"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="chat-send"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </aside>
  );
}
