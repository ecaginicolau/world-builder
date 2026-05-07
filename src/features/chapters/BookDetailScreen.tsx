import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useNavigate } from '@tanstack/react-router';
import { useBook } from '@/lib/queries/books';
import { useCreatePart, useDeletePart, usePartsByBook } from '@/lib/queries/parts';
import { useChaptersByPart, useChaptersByWorld, useCreateChapter, useDeleteChapter, useUpdateChapter } from '@/lib/queries/chapters';
import { useChapterWordCountsByWorld } from '@/lib/queries/chapterWordCounts';
import { fetchVersionsByIds } from '@/lib/queries/chapterVersions';
import { useSession } from '@/features/auth/session';
import { useConfirm } from '@/lib/useConfirm';
import { rankForMoveDown, rankForMoveUp } from '@/features/timeline/timelineItems';
import { formatWordCount } from '@/lib/wordCount';
import { SharePanel } from './SharePanel';
import type { Part } from './types';

export function BookDetailScreen() {
  const { worldId, bookId } = useParams({ from: '/worlds/$worldId/books/$bookId' });
  const session = useSession();
  const bookQ = useBook(bookId);
  const partsQ = usePartsByBook(bookId);
  const wordCountsQ = useChapterWordCountsByWorld(worldId);
  const worldChaptersQ = useChaptersByWorld(worldId);
  const wordCounts = wordCountsQ.data;

  const bookTotalWords = useMemo(() => {
    if (!wordCounts || !worldChaptersQ.data || !partsQ.data) return null;
    const partIds = new Set(partsQ.data.map((p) => p.id));
    let total = 0;
    for (const c of worldChaptersQ.data) {
      if (partIds.has(c.part_id)) total += wordCounts.get(c.id) ?? 0;
    }
    return total;
  }, [wordCounts, worldChaptersQ.data, partsQ.data]);
  const createPart = useCreatePart();
  const deletePart = useDeletePart();
  const confirm = useConfirm();
  const [partTitle, setPartTitle] = useState('');
  const [exporting, setExporting] = useState(false);

  async function onExportPdf() {
    const parts = partsQ.data;
    const allChapters = worldChaptersQ.data;
    const book = bookQ.data;
    if (!parts || !allChapters || !book) return;

    setExporting(true);
    try {
      const partIds = new Set(parts.map((p) => p.id));
      const sortedParts = parts.slice().sort((a, b) => (a.rank < b.rank ? -1 : 1));

      const finalVersionIds = allChapters
        .filter((c) => partIds.has(c.part_id) && c.final_version_id)
        .map((c) => c.final_version_id as string);

      const versions = await fetchVersionsByIds(finalVersionIds);
      const versionText = new Map(versions.map((v) => [v.id, v.text]));

      const exportData = {
        title: book.title,
        description: book.description,
        parts: sortedParts.map((p) => ({
          id: p.id,
          title: p.title,
          rank: p.rank,
          chapters: allChapters
            .filter((c) => c.part_id === p.id)
            .sort((a, b) => (a.reading_rank < b.reading_rank ? -1 : 1))
            .map((c) => ({
              id: c.id,
              title: c.title,
              reading_rank: c.reading_rank,
              text: c.final_version_id ? (versionText.get(c.final_version_id) ?? '') : '',
            })),
        })),
      };

      const { generateBookPdf } = await import('./bookPdfExport');
      await generateBookPdf(exportData);
    } finally {
      setExporting(false);
    }
  }

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
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {bookQ.data?.title ?? 'Loading…'}
            </h1>
            {bookTotalWords !== null ? (
              <span className="text-sm text-fg-muted" data-testid="book-word-count">
                {formatWordCount(bookTotalWords)}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={exporting || !bookQ.data || !partsQ.data || !worldChaptersQ.data}
            className="shrink-0 rounded border border-border px-3 py-1.5 text-sm text-fg-muted hover:border-fg-muted hover:text-fg disabled:cursor-wait disabled:opacity-40"
            data-testid="export-pdf-btn"
          >
            {exporting ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
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
              wordCounts={wordCounts}
              onDelete={() => onDeletePart(p)}
            />
          ))}
        </div>
      ) : null}

      <SharePanel worldId={worldId} bookId={bookId} />
    </main>
  );
}

interface PartSectionProps {
  part: Part;
  indexLabel: string;
  worldId: string;
  wordCounts: Map<string, number> | undefined;
  onDelete: () => void;
}

function PartSection({ part, indexLabel, worldId, wordCounts, onDelete }: PartSectionProps) {
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
  const partTotalWords = wordCounts
    ? sortedChapters.reduce((sum, c) => sum + (wordCounts.get(c.id) ?? 0), 0)
    : null;

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
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{indexLabel}</span>
          {partTotalWords !== null ? (
            <span className="text-xs text-fg-muted" data-testid="part-word-count">
              {formatWordCount(partTotalWords)}
            </span>
          ) : null}
        </div>
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
                className="flex flex-1 items-baseline justify-between gap-2 px-3 py-2 hover:bg-bg-subtle"
                data-testid="chapter-link"
              >
                <span className="text-sm">
                  Chapter {i + 1} · {c.title?.trim() || '(untitled)'}
                </span>
                {wordCounts ? (
                  <span
                    className="text-xs text-fg-muted"
                    data-testid="chapter-row-word-count"
                  >
                    {formatWordCount(wordCounts.get(c.id) ?? 0)}
                  </span>
                ) : null}
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
