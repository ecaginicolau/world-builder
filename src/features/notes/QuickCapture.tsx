import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useUiStore } from '@/lib/uiStore';
import { useCreateNote } from '@/lib/queries/notes';
import { useSession } from '@/features/auth/session';

const DRAFT_KEY = 'wb:qcDraft';

interface Props {
  worldId: string;
}

export function QuickCapture({ worldId }: Props) {
  const open = useUiStore((s) => s.quickCaptureOpen);
  const setOpen = useUiStore((s) => s.setQuickCaptureOpen);
  const session = useSession();
  const createNote = useCreateNote();
  const navigate = useNavigate();
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) return;
    setText(window.localStorage.getItem(DRAFT_KEY) ?? '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.localStorage.setItem(DRAFT_KEY, text);
  }, [text, open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || session.status !== 'authed') return;
    const trimmed = text.trim();
    const note = await createNote.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      content: `<p>${escapeHtml(trimmed).replace(/\n/g, '</p><p>')}</p>`,
    });
    window.localStorage.removeItem(DRAFT_KEY);
    setText('');
    setOpen(false);
    void navigate({
      to: '/worlds/$worldId/notes/$noteId',
      params: { worldId, noteId: note.id },
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 backdrop-blur"
      data-testid="quick-capture"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Quick capture</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="quick-capture-close"
        >
          Close
        </button>
      </header>
      <form onSubmit={onSubmit} className="flex flex-1 flex-col">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Capture an idea…"
          className="flex-1 resize-none border-0 bg-transparent px-4 py-3 text-base focus:outline-none focus:ring-0"
          data-testid="quick-capture-input"
        />
        <div className="border-t border-border p-3">
          <button
            type="submit"
            disabled={createNote.isPending || !text.trim()}
            className="w-full bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-50"
            data-testid="quick-capture-submit"
          >
            {createNote.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
