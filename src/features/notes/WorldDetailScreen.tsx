import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useUpdateWorld, useWorld } from '@/lib/queries/worlds';
import { useCreateNote, useNotes } from '@/lib/queries/notes';
import { useSession } from '@/features/auth/session';
import { useUiStore } from '@/lib/uiStore';
import { htmlToPlainText } from '@/lib/html';
import { QuickCapture } from './QuickCapture';

export function WorldDetailScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId' });
  const navigate = useNavigate();
  const session = useSession();
  const worldQ = useWorld(worldId);
  const updateWorld = useUpdateWorld();
  const notesQ = useNotes(worldId);
  const createNote = useCreateNote();
  const setLastWorldId = useUiStore((s) => s.setLastWorldId);
  const setQcOpen = useUiStore((s) => s.setQuickCaptureOpen);

  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState<string | null>(null);

  useEffect(() => {
    setLastWorldId(worldId);
  }, [worldId, setLastWorldId]);

  async function onCreate() {
    if (session.status !== 'authed') return;
    const note = await createNote.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
    });
    void navigate({
      to: '/worlds/$worldId/notes/$noteId',
      params: { worldId, noteId: note.id },
    });
  }

  function onSaveMemory() {
    if (memoryDraft === null) return;
    updateWorld.mutate(
      { id: worldId, world_memory: memoryDraft.trim() || null },
      {
        onSuccess: () => {
          setMemoryDraft(null);
          setMemoryOpen(false);
        },
      },
    );
  }

  const memoryValue = memoryDraft ?? worldQ.data?.world_memory ?? '';

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 px-6 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {worldQ.data?.name ?? 'Loading…'}
        </h1>
        <button
          type="button"
          onClick={onCreate}
          disabled={createNote.isPending}
          className="hidden bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-50 sm:inline-flex"
          data-testid="create-note"
        >
          {createNote.isPending ? 'Creating…' : '+ Note'}
        </button>
      </header>

      <section
        className="rounded-md border border-border bg-bg-panel"
        data-testid="world-memory"
      >
        <button
          type="button"
          onClick={() => setMemoryOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-subtle"
          data-testid="world-memory-toggle"
        >
          <span className="font-medium">World memory</span>
          <span className="text-xs text-fg-muted">
            {memoryOpen ? 'hide' : worldQ.data?.world_memory ? 'edit' : 'add'}
          </span>
        </button>
        {memoryOpen ? (
          <div className="space-y-2 border-t border-border p-3">
            <p className="text-xs text-fg-muted">
              Persistent context injected into every chat about this world.
            </p>
            <textarea
              value={memoryValue}
              onChange={(e) => setMemoryDraft(e.target.value)}
              placeholder="e.g. Setting: low-magic dark fantasy. Tone: bleak, ironic. Recurring themes…"
              rows={5}
              className="w-full px-3 py-2 text-sm"
              data-testid="world-memory-input"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setMemoryDraft(null);
                  setMemoryOpen(false);
                }}
                className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveMemory}
                disabled={updateWorld.isPending || memoryDraft === null}
                className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
                data-testid="world-memory-save"
              >
                {updateWorld.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {notesQ.error ? (
        <p className="text-sm text-red-400" data-testid="notes-error">
          {notesQ.error.message}
        </p>
      ) : null}

      {notesQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : notesQ.data && notesQ.data.length === 0 ? (
        <p className="text-fg-muted" data-testid="notes-empty">
          No notes yet. Tap + to start.
        </p>
      ) : notesQ.data ? (
        <ul className="space-y-2" data-testid="notes-list">
          {notesQ.data.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-border bg-bg-panel"
              data-testid="note-item"
            >
              <Link
                to="/worlds/$worldId/notes/$noteId"
                params={{ worldId, noteId: n.id }}
                className="block px-4 py-3 hover:bg-bg-subtle"
                data-testid="note-link"
              >
                <div className="font-medium">
                  {n.title?.trim() || preview(n.content) || 'Untitled note'}
                </div>
                <div className="text-xs text-fg-muted">
                  Updated {formatDate(n.updated_at)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setQcOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-accent text-2xl font-semibold text-accent-fg shadow-lg sm:hidden"
        aria-label="Quick capture"
        data-testid="quick-capture-fab"
      >
        +
      </button>
      <QuickCapture worldId={worldId} />
    </main>
  );
}

function preview(html: string): string {
  const text = htmlToPlainText(html);
  if (text.length <= 80) return text;
  return text.slice(0, 77) + '…';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
