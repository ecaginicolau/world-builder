import { Link, useParams } from '@tanstack/react-router';
import { useBooks } from '@/lib/queries/books';
import { usePartsByWorld } from '@/lib/queries/parts';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useMemo, useState } from 'react';

export function ReaderScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/read' });
  const booksQ = useBooks(worldId);
  const partsQ = usePartsByWorld(worldId);
  const chaptersQ = useChaptersByWorld(worldId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => {
    const books = booksQ.data ?? [];
    const parts = partsQ.data ?? [];
    const chapters = chaptersQ.data ?? [];
    return books.map((b) => ({
      ...b,
      preface: chapters.find((c) => c.is_preface && c.book_id === b.id) ?? null,
      parts: parts
        .filter((p) => p.book_id === b.id)
        .map((p) => ({
          ...p,
          chapters: chapters
            .filter((c) => c.part_id === p.id)
            .sort((a, b) => (a.reading_rank < b.reading_rank ? -1 : a.reading_rank > b.reading_rank ? 1 : 0)),
        })),
    }));
  }, [booksQ.data, partsQ.data, chaptersQ.data]);

  function toggleBook(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reader</h1>
        <p className="text-sm text-fg-muted">
          Books → parts → chapters in reading order. Drafts are included with a badge so you can
          re-read your own drafts.
        </p>
      </header>

      {booksQ.isLoading ? <p className="text-fg-muted">Loading…</p> : null}
      {!booksQ.isLoading && tree.length === 0 ? (
        <p className="italic text-fg-muted">No books in this world yet.</p>
      ) : null}

      <div className="space-y-6">
        {tree.map((book) => {
          const isCollapsed = collapsed[book.id];
          const total =
            book.parts.reduce((acc, p) => acc + p.chapters.length, 0) +
            (book.preface ? 1 : 0);
          return (
            <section key={book.id} className="space-y-3" data-testid="reader-book">
              <button
                type="button"
                onClick={() => toggleBook(book.id)}
                className="flex w-full items-baseline justify-between gap-3 border-b border-border pb-1 text-left hover:opacity-80"
                data-testid="reader-book-toggle"
              >
                <h2 className="text-xl font-semibold">
                  {isCollapsed ? '▸' : '▾'} {book.title}
                </h2>
                <span className="text-xs text-fg-muted">
                  {total} chapter{total !== 1 ? 's' : ''}
                </span>
              </button>

              {isCollapsed ? null : (
                <div className="space-y-4 pl-4">
                  {book.preface ? (
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                        Preface
                      </h3>
                      <ul className="space-y-1">
                        <li>
                          <Link
                            to="/worlds/$worldId/read/$chapterId"
                            params={{ worldId, chapterId: book.preface.id }}
                            className="flex items-baseline gap-2 rounded px-2 py-1 text-sm hover:bg-bg-subtle"
                            data-testid="reader-preface-link"
                          >
                            <span className="flex-1">
                              {book.preface.title?.trim() || 'Preface'}
                            </span>
                            {book.preface.status === 'draft' ? (
                              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-mono uppercase text-amber-300">
                                Draft
                              </span>
                            ) : (
                              <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] font-mono uppercase text-emerald-300">
                                Published
                              </span>
                            )}
                          </Link>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                  {book.parts.length === 0 ? (
                    <p className="text-xs italic text-fg-muted">No parts.</p>
                  ) : null}
                  {book.parts.map((part) => (
                    <div key={part.id} className="space-y-1">
                      {part.title ? (
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                          {part.title}
                        </h3>
                      ) : null}
                      {part.chapters.length === 0 ? (
                        <p className="text-xs italic text-fg-muted">No chapters yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {part.chapters.map((c) => (
                            <li key={c.id}>
                              <Link
                                to="/worlds/$worldId/read/$chapterId"
                                params={{ worldId, chapterId: c.id }}
                                className="flex items-baseline gap-2 rounded px-2 py-1 text-sm hover:bg-bg-subtle"
                                data-testid="reader-chapter-link"
                              >
                                <span className="flex-1">{c.title?.trim() || '(untitled)'}</span>
                                {c.status === 'draft' ? (
                                  <span
                                    className="rounded bg-amber-500/20 px-1 py-0.5 text-[10px] font-mono uppercase text-amber-300"
                                    data-testid="reader-draft-badge"
                                  >
                                    Draft
                                  </span>
                                ) : (
                                  <span
                                    className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] font-mono uppercase text-emerald-300"
                                    data-testid="reader-published-badge"
                                  >
                                    Published
                                  </span>
                                )}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
