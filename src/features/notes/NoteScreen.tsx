import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useNote, useDeleteNote, useUpdateNote } from '@/lib/queries/notes';
import { useWorld } from '@/lib/queries/worlds';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useNoteEntities } from '@/lib/queries/noteEntities';
import { useUiStore } from '@/lib/uiStore';
import { NoteEditor } from './NoteEditor';
import { htmlToPlainText } from '@/lib/html';
import { resolveColor } from '@/lib/entityColors';
import { ChatPanel } from './ChatPanel';
import { LinkedEntitiesPanel } from './NoteEntitiesPanel';
import { DetectedEntitiesPanel } from './DetectedEntitiesPanel';
import { useAutoExtract } from './useAutoExtract';
import { useNoteLinkSource } from './linkSources';
import { PromoteToChapterModal } from './PromoteToChapterModal';
import type { EntityHighlightSpec } from './entityHighlightExtension';
import type { TaggedEntity } from '@/lib/llm';

export function NoteScreen() {
  const { worldId, noteId } = useParams({ from: '/worlds/$worldId/notes/$noteId' });
  const navigate = useNavigate();
  const noteQ = useNote(noteId);
  const worldQ = useWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const noteEntitiesQ = useNoteEntities(noteId);
  const linkSource = useNoteLinkSource(noteId);
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const chatPanelOpen = useUiStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useUiStore((s) => s.setChatPanelOpen);
  const [title, setTitle] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const currentTitle = title ?? noteQ.data?.title ?? '';

  const noteTextForLlm = useMemo(() => {
    if (!noteQ.data) return '';
    return htmlToPlainText(noteQ.data.content);
  }, [noteQ.data]);

  const extract = useAutoExtract({
    parentKind: 'note',
    parentId: noteId,
    worldId,
    plainText: noteTextForLlm,
  });

  const entityHighlights = useMemo<EntityHighlightSpec[]>(() => {
    const types = typesQ.data ?? [];
    const typesById = new Map(types.map((t) => [t.id, t]));
    return (entitiesQ.data ?? []).map((e) => {
      const t = typesById.get(e.entity_type_id);
      const color = t ? resolveColor(t.color, t.name) : '#a1a1aa';
      return {
        name: e.name,
        aliases: e.aliases ?? [],
        color,
      };
    });
  }, [entitiesQ.data, typesQ.data]);

  const taggedEntitiesForLlm = useMemo<TaggedEntity[]>(() => {
    const links = noteEntitiesQ.data ?? [];
    if (links.length === 0) return [];
    const typesById = new Map((typesQ.data ?? []).map((t) => [t.id, t]));
    const entitiesById = new Map((entitiesQ.data ?? []).map((e) => [e.id, e]));
    const out: TaggedEntity[] = [];
    for (const l of links) {
      const e = entitiesById.get(l.entity_id);
      if (!e) continue;
      out.push({ name: e.name, type: typesById.get(e.entity_type_id)?.name ?? 'Unknown' });
    }
    return out;
  }, [noteEntitiesQ.data, entitiesQ.data, typesQ.data]);

  function onTitleChange(value: string) {
    setTitle(value);
    updateNote.mutate({ id: noteId, title: value || null });
  }

  function onContentChange(html: string) {
    updateNote.mutate({ id: noteId, content: html });
  }

  function onToggleArchive() {
    if (!noteQ.data) return;
    const next = noteQ.data.status === 'archived' ? 'open' : 'archived';
    updateNote.mutate({ id: noteId, status: next });
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
    <main className="mx-auto flex h-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
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
            onClick={() => setPromoteOpen(true)}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            data-testid="promote-to-chapter"
          >
            Promote → chapter
          </button>
          <button
            type="button"
            onClick={onToggleArchive}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            data-testid="toggle-archive"
            title={noteQ.data.status === 'archived' ? 'Unarchive this note' : 'Archive this note'}
          >
            {noteQ.data.status === 'archived' ? 'Unarchive' : 'Archive'}
          </button>
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
        className={`grid min-h-0 flex-1 gap-4 grid-cols-1 ${
          chatPanelOpen
            ? 'md:grid-cols-[240px_1fr_300px]'
            : 'md:grid-cols-[240px_1fr]'
        }`}
      >
        <aside className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto md:order-1">
          <LinkedEntitiesPanel worldId={worldId} source={linkSource} />
          <DetectedEntitiesPanel
            noteIdForPromotionLog={noteId}
            worldId={worldId}
            candidates={extract.candidates}
            status={extract.status}
            error={extract.error}
            source={linkSource}
          />
        </aside>
        <div className="order-1 min-h-0 overflow-y-auto md:order-2">
          <NoteEditor
            initialContent={noteQ.data.content}
            onChange={onContentChange}
            entityHighlights={entityHighlights}
          />
        </div>
        {chatPanelOpen ? (
          <div className="order-3 min-h-0">
            <ChatPanel
              parentKind="note"
              parentId={noteId}
              worldId={worldId}
              worldMemory={worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined}
              worldCustomPrompt={worldQ.data?.custom_prompt ?? undefined}
              noteTitle={currentTitle || undefined}
              noteContextText={noteTextForLlm}
              taggedEntities={taggedEntitiesForLlm}
            />
          </div>
        ) : null}
      </div>

      <PromoteToChapterModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        worldId={worldId}
        noteId={noteId}
        noteTitle={currentTitle || undefined}
        noteContent={noteQ.data.content}
      />
    </main>
  );
}
