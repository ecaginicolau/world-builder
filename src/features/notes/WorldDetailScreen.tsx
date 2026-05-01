import { useEffect } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useWorld } from '@/lib/queries/worlds';
import { useCreateNote, useNotes } from '@/lib/queries/notes';
import { useSession } from '@/features/auth/session';
import { useUiStore } from '@/lib/uiStore';
import { QuickCapture } from './QuickCapture';

export function WorldDetailScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId' });
  const navigate = useNavigate();
  const session = useSession();
  const worldQ = useWorld(worldId);
  const notesQ = useNotes(worldId);
  const createNote = useCreateNote();
  const setLastWorldId = useUiStore((s) => s.setLastWorldId);
  const setQcOpen = useUiStore((s) => s.setQuickCaptureOpen);

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

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 px-6 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <Link
            to="/worlds"
            className="text-sm text-fg-muted hover:text-fg"
            data-testid="back-to-worlds"
          >
            ← Worlds
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {worldQ.data?.name ?? 'Loading…'}
          </h1>
        </div>
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
                  {n.title?.trim() || firstLine(n.content) || 'Untitled note'}
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

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return (idx === -1 ? s : s.slice(0, idx)).trim();
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
