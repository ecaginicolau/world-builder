import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useNote, useDeleteNote, useUpdateNote } from '@/lib/queries/notes';
import { useWorld } from '@/lib/queries/worlds';
import { useUiStore } from '@/lib/uiStore';
import { NoteEditor } from './NoteEditor';
import { htmlToPlainText } from '@/lib/html';
import { ChatPanel } from './ChatPanel';

export function NoteScreen() {
  const { worldId, noteId } = useParams({ from: '/worlds/$worldId/notes/$noteId' });
  const navigate = useNavigate();
  const noteQ = useNote(noteId);
  const worldQ = useWorld(worldId);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const chatPanelOpen = useUiStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useUiStore((s) => s.setChatPanelOpen);
  const [title, setTitle] = useState<string | null>(null);

  const currentTitle = title ?? noteQ.data?.title ?? '';

  const noteTextForLlm = useMemo(() => {
    if (!noteQ.data) return '';
    return htmlToPlainText(noteQ.data.content);
  }, [noteQ.data]);

  function onTitleChange(value: string) {
    setTitle(value);
    updateNote.mutate({ id: noteId, title: value || null });
  }

  function onContentChange(html: string) {
    updateNote.mutate({ id: noteId, content: html });
  }

  async function onDelete() {
    const confirmed = window.confirm('Delete this note?');
    if (!confirmed) return;
    await deleteNote.mutateAsync({ id: noteId, worldId });
    void navigate({ to: '/worlds/$worldId', params: { worldId } });
  }

  if (noteQ.isLoading || !noteQ.data) {
    return (
      <main className="mx-auto flex h-full max-w-5xl flex-col gap-4 px-6 py-6">
        <p className="text-fg-muted">Loading note…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-notes"
        >
          ← {worldQ.data?.name ?? 'World'}
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            data-testid="toggle-chat"
          >
            {chatPanelOpen ? 'Hide chat' : 'Show chat'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-fg-muted hover:text-red-400"
            data-testid="delete-note"
          >
            Delete
          </button>
        </div>
      </header>

      <input
        type="text"
        value={currentTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled note"
        className="bg-transparent px-1 py-2 text-2xl font-semibold tracking-tight focus:outline-none"
        data-testid="note-title"
      />

      <div
        className={`grid flex-1 min-h-0 gap-4 ${
          chatPanelOpen ? 'grid-cols-1 md:grid-cols-[2fr_1fr]' : 'grid-cols-1'
        }`}
      >
        <div className="min-h-0 overflow-y-auto">
          <NoteEditor
            initialContent={noteQ.data.content}
            onChange={onContentChange}
          />
        </div>
        {chatPanelOpen ? (
          <div className="min-h-0">
            <ChatPanel
              noteId={noteId}
              worldId={worldId}
              worldMemory={worldQ.data?.description ?? undefined}
              noteContextText={noteTextForLlm}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
