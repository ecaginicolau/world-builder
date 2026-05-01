import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useBooks } from '@/lib/queries/books';
import { usePartsByWorld } from '@/lib/queries/parts';
import { useCreateChapter } from '@/lib/queries/chapters';
import { logNotePromotion } from '@/lib/queries/notePromotions';
import { useSession } from '@/features/auth/session';
import type { Part } from '@/features/chapters/types';

interface Props {
  open: boolean;
  onClose: () => void;
  worldId: string;
  noteId: string;
  noteTitle?: string;
  noteContent: string;
}

export function PromoteToChapterModal({
  open,
  onClose,
  worldId,
  noteId,
  noteTitle,
  noteContent,
}: Props) {
  const session = useSession();
  const booksQ = useBooks(worldId);
  const partsQ = usePartsByWorld(worldId);
  const createChapter = useCreateChapter();
  const navigate = useNavigate();

  const partsByBook = useMemo(() => {
    const m = new Map<string, Part[]>();
    for (const p of partsQ.data ?? []) {
      const list = m.get(p.book_id) ?? [];
      list.push(p);
      m.set(p.book_id, list);
    }
    return m;
  }, [partsQ.data]);

  const [partId, setPartId] = useState<string>('');
  const [title, setTitle] = useState<string>(noteTitle ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(noteTitle ?? '');
    setError(null);
    if (!partId && partsQ.data && partsQ.data.length > 0) {
      setPartId(partsQ.data[0].id);
    }
  }, [open, noteTitle, partId, partsQ.data]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    if (!partId) {
      setError('Pick a part to put the chapter under.');
      return;
    }
    try {
      const chapter = await createChapter.mutateAsync({
        worldId,
        partId,
        ownerId: session.session.user.id,
        title: title.trim() || null,
        draft: noteContent,
        sourceNoteId: noteId,
      });
      void logNotePromotion({
        noteId,
        ownerId: session.session.user.id,
        targetKind: 'chapter',
        targetId: chapter.id,
      });
      onClose();
      void navigate({
        to: '/worlds/$worldId/chapters/$chapterId',
        params: { worldId, chapterId: chapter.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const noBooks = !booksQ.isLoading && (booksQ.data?.length ?? 0) === 0;
  const noParts = !partsQ.isLoading && (partsQ.data?.length ?? 0) === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="promote-modal"
    >
      <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-bg-panel p-4">
        <h2 className="text-lg font-semibold">Promote to chapter</h2>
        {noBooks ? (
          <p className="text-sm text-fg-muted" data-testid="promote-no-books">
            No books yet — create one in the Books screen first.
          </p>
        ) : noParts ? (
          <p className="text-sm text-fg-muted" data-testid="promote-no-parts">
            No parts yet — open a book and add a part first.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3" data-testid="promote-form">
            <label className="block space-y-1">
              <span className="text-xs text-fg-muted">Destination part</span>
              <select
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className="w-full bg-bg-subtle px-2 py-2 text-sm"
                data-testid="promote-part"
              >
                {(booksQ.data ?? []).map((b) => {
                  const parts = partsByBook.get(b.id) ?? [];
                  return (
                    <optgroup key={b.id} label={b.title}>
                      {parts.map((p, i) => (
                        <option key={p.id} value={p.id}>
                          {p.title ?? `Part ${i + 1}`}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-fg-muted">Chapter title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled chapter"
                className="w-full px-3 py-2 text-sm"
                data-testid="promote-title"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-400" data-testid="promote-error">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
                data-testid="promote-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createChapter.isPending}
                className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
                data-testid="promote-submit"
              >
                {createChapter.isPending ? 'Promoting…' : 'Promote'}
              </button>
            </div>
          </form>
        )}
        {(noBooks || noParts) ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              data-testid="promote-cancel"
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
