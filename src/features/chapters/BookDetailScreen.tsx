import { useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { useBook } from '@/lib/queries/books';
import { useCreatePart, useDeletePart, usePartsByBook } from '@/lib/queries/parts';
import { useChaptersByPart, useCreateChapter, useDeleteChapter, useUpdateChapter } from '@/lib/queries/chapters';
import { useSession } from '@/features/auth/session';
import { useConfirm } from '@/lib/useConfirm';
import { rankForMoveDown, rankForMoveUp } from '@/features/timeline/timelineItems';
import type { Part } from './types';

export function BookDetailScreen() {
  const { worldId, bookId } = useParams({ from: '/worlds/$worldId/books/$bookId' });
  const session = useSession();
  const bookQ = useBook(bookId);
  const partsQ = usePartsByBook(bookId);
  const createPart = useCreatePart();
  const deletePart = useDeletePart();
  const confirm = useConfirm();
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

  async function onDeletePart(p: Part) {
    const ok = await confirm({
      title: `Delete part "${p.title ?? '(untitled)'}"?`,
      message: 'Chapters under it will be deleted too.',
      danger: true,
    });
    if (!ok) return;
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
  const updateChapter = useUpdateChapter();
  const deleteChapter = useDeleteChapter();
  const confirm = useConfirm();
  const [chapterTitle, setChapterTitle] = useState('');
  const [firstEventTitle, setFirstEventTitle] = useState('');

  // Sort client-side: Postgres default collation is case-insensitive and would
  // scramble byte-wise fractional ranks (cf. slice 7 bug fix).
  const sortedChapters = (chaptersQ.data ?? []).slice().sort((a, b) =>
    a.reading_rank < b.reading_rank ? -1 :
    a.reading_rank > b.reading_rank ? 1 : 0,
  );
  const chapterRanks = sortedChapters.map((c) => c.reading_rank);

  function onMoveChapter(idx: number, dir: 'up' | 'down') {
    const newRank = dir === 'up'
      ? rankForMoveUp(chapterRanks, idx)
      : rankForMoveDown(chapterRanks, idx);
    if (!newRank) return;
    updateChapter.mutate({ id: sortedChapters[idx].id, readingRank: newRank });
  }

  async function onAddChapter(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const trimmedEvent = firstEventTitle.trim();
    if (!trimmedEvent) return;
    const c = await createChapter.mutateAsync({
      worldId,
      partId: part.id,
      ownerId: session.session.user.id,
      title: chapterTitle.trim() || null,
      firstEvent: { title: trimmedEvent },
    });
    setChapterTitle('');
    setFirstEventTitle('');
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

      {sortedChapters.length > 0 ? (
        <ul className="divide-y divide-border" data-testid="chapters-list">
          {sortedChapters.map((c, i) => (
            <li
              key={c.id}
              className="flex items-stretch gap-2"
              data-testid="chapter-row"
            >
              <div className="flex w-7 flex-col items-center justify-center bg-bg-subtle/40">
                <button
                  type="button"
                  onClick={() => onMoveChapter(i, 'up')}
                  disabled={i === 0}
                  className="px-1 py-0.5 text-[10px] text-fg-muted hover:text-fg disabled:opacity-30"
                  title="Move earlier in reading order"
                  data-testid="chapter-move-up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onMoveChapter(i, 'down')}
                  disabled={i === sortedChapters.length - 1}
                  className="px-1 py-0.5 text-[10px] text-fg-muted hover:text-fg disabled:opacity-30"
                  title="Move later in reading order"
                  data-testid="chapter-move-down"
                >
                  ▼
                </button>
              </div>
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
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete chapter "${c.title ?? '(untitled)'}"?`,
                    danger: true,
                  });
                  if (!ok) return;
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
        className="space-y-2 border-t border-border p-2"
        data-testid="create-chapter-form"
      >
        <input
          value={chapterTitle}
          onChange={(e) => setChapterTitle(e.target.value)}
          placeholder="New chapter title (optional)"
          className="w-full px-3 py-2 text-sm"
          data-testid="create-chapter-title"
        />
        <div className="flex gap-2">
          <input
            value={firstEventTitle}
            onChange={(e) => setFirstEventTitle(e.target.value)}
            placeholder="First event title — required"
            className="flex-1 px-3 py-2 text-sm"
            data-testid="create-chapter-first-event"
          />
          <button
            type="submit"
            disabled={createChapter.isPending || !firstEventTitle.trim()}
            className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            data-testid="create-chapter-submit"
            title={firstEventTitle.trim() ? '' : 'A chapter must retell at least one event.'}
          >
            + Chapter
          </button>
        </div>
        <p className="text-[10px] text-fg-muted">
          Every chapter retells an event on the canonical timeline. Pick a title for that first event — you can rename it later.
        </p>
      </form>
    </section>
  );
}
