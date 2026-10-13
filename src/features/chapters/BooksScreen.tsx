import { useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useWorld } from '@/lib/queries/worlds';
import { useBooks, useCreateBook, useDeleteBook, useUpdateBook } from '@/lib/queries/books';
import { rankForMoveDown, rankForMoveUp } from '@/features/timeline/timelineItems';
import { useSession } from '@/features/auth/session';
import { useConfirm } from '@/lib/useConfirm';

export function BooksScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/books' });
  const session = useSession();
  const worldQ = useWorld(worldId);
  const booksQ = useBooks(worldId);
  const createBook = useCreateBook();
  const deleteBook = useDeleteBook();
  const updateBook = useUpdateBook();
  const confirm = useConfirm();
  const [title, setTitle] = useState('');

  function moveBook(index: number, direction: 'up' | 'down') {
    const books = booksQ.data;
    if (!books || updateBook.isPending) return;
    const ranks = books.map((book) => book.rank);
    const rank = direction === 'up' ? rankForMoveUp(ranks, index) : rankForMoveDown(ranks, index);
    if (rank !== null) updateBook.mutate({ id: books[index].id, rank });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || session.status !== 'authed') return;
    await createBook.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      title: title.trim(),
    });
    setTitle('');
  }

  async function onDelete(id: string, t: string) {
    const ok = await confirm({
      title: `Delete book "${t}"?`,
      message: 'All parts and chapters under it will be deleted too.',
      danger: true,
    });
    if (!ok) return;
    deleteBook.mutate({ id, worldId });
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-world"
        >
          ← {worldQ.data?.name ?? 'World'}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Books</h1>
      </header>

      <form onSubmit={onCreate} className="flex gap-2" data-testid="create-book-form">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New book title"
          className="flex-1 px-3 py-2 text-sm"
          data-testid="create-book-title"
        />
        <button
          type="submit"
          disabled={createBook.isPending || !title.trim()}
          className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-book-submit"
        >
          Add
        </button>
      </form>

      {booksQ.error ? (
        <p className="text-sm text-red-400" data-testid="books-error">
          {booksQ.error.message}
        </p>
      ) : null}
      {createBook.error ? (
        <p className="text-sm text-red-400" data-testid="books-error">
          {createBook.error.message}
        </p>
      ) : null}

      {updateBook.error ? <p role="alert" className="text-sm text-red-400">{updateBook.error.message}</p> : null}

      {booksQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : booksQ.data && booksQ.data.length === 0 ? (
        <p className="text-fg-muted" data-testid="books-empty">
          No books yet. Add one above.
        </p>
      ) : booksQ.data ? (
        <ul className="space-y-2" data-testid="books-list">
          {booksQ.data.map((b, index) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-panel"
              data-testid="book-item"
            >
              <Link
                to="/worlds/$worldId/books/$bookId"
                params={{ worldId, bookId: b.id }}
                className="flex-1 px-4 py-3 hover:bg-bg-subtle"
                data-testid="book-link"
              >
                <div className="text-xs text-fg-muted">
                  {b.series_title ? `${b.series_title} · ` : ''}
                  {b.volume_number != null ? `Tome ${b.volume_number} · ` : ''}
                  Position {index + 1}
                </div>
                <div className="font-medium">{b.title}</div>
                {b.description ? (
                  <div className="text-xs text-fg-muted">{b.description}</div>
                ) : null}
              </Link>
              <div className="flex flex-col">
                <button type="button" aria-label={`Move ${b.title} up`} disabled={index === 0 || updateBook.isPending}
                  onClick={() => moveBook(index, 'up')} className="px-3 py-1 disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Move ${b.title} down`} disabled={index === booksQ.data.length - 1 || updateBook.isPending}
                  onClick={() => moveBook(index, 'down')} className="px-3 py-1 disabled:opacity-30">↓</button>
              </div>
              <button
                type="button"
                onClick={() => onDelete(b.id, b.title)}
                className="px-3 py-3 text-xs text-fg-muted hover:text-red-400"
                data-testid="book-delete"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
