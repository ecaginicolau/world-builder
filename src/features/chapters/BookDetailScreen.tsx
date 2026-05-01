import { useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { useBook } from '@/lib/queries/books';
import { useCreatePart, useDeletePart, usePartsByBook } from '@/lib/queries/parts';
import { useChaptersByPart, useCreateChapter, useDeleteChapter } from '@/lib/queries/chapters';
import { useSession } from '@/features/auth/session';
import type { Part } from './types';

export function BookDetailScreen() {
  const { worldId, bookId } = useParams({ from: '/worlds/$worldId/books/$bookId' });
  const session = useSession();
  const bookQ = useBook(bookId);
  const partsQ = usePartsByBook(bookId);
  const createPart = useCreatePart();
  const deletePart = useDeletePart();
  const [partTitle, setPartTitle] = useState('');

  async function onAddPart(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    await createPart.mutateAsync({
      worldId,
      bookId,
      ownerId: session.session.user.id,
      title: partTitle.trim() || null,
    });
    setPartTitle('');
  }

  function onDeletePart(p: Part) {
    if (!window.confirm(`Delete part "${p.title ?? '(untitled)'}"? Chapters under it will be deleted too.`)) return;
    deletePart.mutate({ id: p.id, bookId, worldId });
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <Link
          to="/worlds/$worldId/books"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-books"
        >
          ← Books
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {bookQ.data?.title ?? 'Loading…'}
        </h1>
      </header>

      <form onSubmit={onAddPart} className="flex gap-2" data-testid="create-part-form">
        <input
          value={partTitle}
          onChange={(e) => setPartTitle(e.target.value)}
          placeholder="New part title (optional)"
          className="flex-1 px-3 py-2 text-sm"
          data-testid="create-part-title"
        />
        <button
          type="submit"
          disabled={createPart.isPending}
          className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-part-submit"
        >
          Add part
        </button>
      </form>

      {partsQ.error ? (
        <p className="text-sm text-red-400" data-testid="parts-error">
          {partsQ.error.message}
        </p>
      ) : null}

      {partsQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : partsQ.data && partsQ.data.length === 0 ? (
        <p className="text-fg-muted" data-testid="parts-empty">
          No parts yet.
        </p>
      ) : partsQ.data ? (
        <div className="space-y-4" data-testid="parts-list">
          {partsQ.data.map((p, i) => (
            <PartSection
              key={p.id}
              part={p}
              indexLabel={p.title ?? `Part ${i + 1}`}
              worldId={worldId}
              onDelete={() => onDeletePart(p)}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}

interface PartSectionProps {
  part: Part;
  indexLabel: string;
  worldId: string;
  onDelete: () => void;
}

function PartSection({ part, indexLabel, worldId, onDelete }: PartSectionProps) {
  const session = useSession();
  const navigate = useNavigate();
  const chaptersQ = useChaptersByPart(part.id);
  const createChapter = useCreateChapter();
  const deleteChapter = useDeleteChapter();
  const [chapterTitle, setChapterTitle] = useState('');

  async function onAddChapter(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const c = await createChapter.mutateAsync({
      worldId,
      partId: part.id,
      ownerId: session.session.user.id,
      title: chapterTitle.trim() || null,
    });
    setChapterTitle('');
    void navigate({
      to: '/worlds/$worldId/chapters/$chapterId',
      params: { worldId, chapterId: c.id },
    });
  }

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="part-section"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="text-sm font-medium">{indexLabel}</div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-fg-muted hover:text-red-400"
          data-testid="part-delete"
        >
          delete
        </button>
      </header>

      {chaptersQ.data && chaptersQ.data.length > 0 ? (
        <ul className="divide-y divide-border" data-testid="chapters-list">
          {chaptersQ.data.map((c, i) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2"
              data-testid="chapter-row"
            >
              <Link
                to="/worlds/$worldId/chapters/$chapterId"
                params={{ worldId, chapterId: c.id }}
                className="flex-1 px-3 py-2 hover:bg-bg-subtle"
                data-testid="chapter-link"
              >
                <span className="text-sm">
                  Chapter {i + 1} · {c.title?.trim() || '(untitled)'}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete chapter "${c.title ?? '(untitled)'}"?`)) return;
                  deleteChapter.mutate({ id: c.id, partId: part.id, worldId });
                }}
                className="px-3 py-2 text-xs text-fg-muted hover:text-red-400"
                data-testid="chapter-delete"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={onAddChapter}
        className="flex gap-2 border-t border-border p-2"
        data-testid="create-chapter-form"
      >
        <input
          value={chapterTitle}
          onChange={(e) => setChapterTitle(e.target.value)}
          placeholder="New chapter title (optional)"
          className="flex-1 px-3 py-2 text-sm"
          data-testid="create-chapter-title"
        />
        <button
          type="submit"
          disabled={createChapter.isPending}
          className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-chapter-submit"
        >
          + Chapter
        </button>
      </form>
    </section>
  );
}
