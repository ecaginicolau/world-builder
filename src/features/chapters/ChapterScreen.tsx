import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  useChapter,
  useDeleteChapter,
  useUpdateChapter,
} from '@/lib/queries/chapters';
import { NoteEditor } from '@/features/notes/NoteEditor';

export function ChapterScreen() {
  const { worldId, chapterId } = useParams({
    from: '/worlds/$worldId/chapters/$chapterId',
  });
  const navigate = useNavigate();
  const chapterQ = useChapter(chapterId);
  const updateChapter = useUpdateChapter();
  const deleteChapter = useDeleteChapter();
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  function onTitleChange(value: string) {
    setTitleDraft(value);
    updateChapter.mutate({ id: chapterId, title: value || null });
  }

  function onDraftChange(html: string) {
    updateChapter.mutate({ id: chapterId, draft: html });
  }

  async function onDelete() {
    if (!chapterQ.data) return;
    if (!window.confirm('Delete this chapter?')) return;
    await deleteChapter.mutateAsync({
      id: chapterId,
      partId: chapterQ.data.part_id,
      worldId,
    });
    void navigate({ to: '/worlds/$worldId/books', params: { worldId } });
  }

  if (chapterQ.isLoading || !chapterQ.data) {
    return (
      <main className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-6 py-6">
        <p className="text-fg-muted">Loading chapter…</p>
      </main>
    );
  }

  const currentTitle = titleDraft ?? chapterQ.data.title ?? '';

  return (
    <main className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId/books"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-books"
        >
          ← Books
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-fg-muted hover:text-red-400"
          data-testid="delete-chapter"
        >
          Delete
        </button>
      </header>

      <input
        type="text"
        value={currentTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled chapter"
        className="bg-transparent px-1 py-2 text-2xl font-semibold tracking-tight focus:outline-none"
        data-testid="chapter-title"
      />

      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="chapter-editor-wrap">
        <NoteEditor
          initialContent={chapterQ.data.draft}
          onChange={onDraftChange}
        />
      </div>
    </main>
  );
}
