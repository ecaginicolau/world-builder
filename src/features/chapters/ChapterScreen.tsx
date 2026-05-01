import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  useChapter,
  useDeleteChapter,
  useUpdateChapter,
} from '@/lib/queries/chapters';
import { useWorld } from '@/lib/queries/worlds';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import { useUiStore } from '@/lib/uiStore';
import { htmlToPlainText } from '@/lib/html';
import { resolveColor } from '@/lib/entityColors';
import { NoteEditor } from '@/features/notes/NoteEditor';
import { ChatPanel } from '@/features/notes/ChatPanel';
import { LinkedEntitiesPanel } from '@/features/notes/NoteEntitiesPanel';
import { DetectedEntitiesPanel } from '@/features/notes/DetectedEntitiesPanel';
import { useAutoExtract } from '@/features/notes/useAutoExtract';
import { useChapterLinkSource } from '@/features/notes/linkSources';
import type { EntityHighlightSpec } from '@/features/notes/entityHighlightExtension';
import type { TaggedEntity } from '@/lib/llm';

export function ChapterScreen() {
  const { worldId, chapterId } = useParams({
    from: '/worlds/$worldId/chapters/$chapterId',
  });
  const navigate = useNavigate();
  const chapterQ = useChapter(chapterId);
  const worldQ = useWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const participantsQ = useChapterParticipants(chapterId);
  const linkSource = useChapterLinkSource(chapterId);
  const updateChapter = useUpdateChapter();
  const deleteChapter = useDeleteChapter();
  const chatPanelOpen = useUiStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useUiStore((s) => s.setChatPanelOpen);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const currentTitle = titleDraft ?? chapterQ.data?.title ?? '';

  const draftTextForLlm = useMemo(() => {
    if (!chapterQ.data) return '';
    return htmlToPlainText(chapterQ.data.draft);
  }, [chapterQ.data]);

  const extract = useAutoExtract({
    parentKind: 'chapter',
    parentId: chapterId,
    worldId,
    plainText: draftTextForLlm,
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
    const links = participantsQ.data ?? [];
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
  }, [participantsQ.data, entitiesQ.data, typesQ.data]);

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
      <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-6 py-6">
        <p className="text-fg-muted">Loading chapter…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId/books"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-books"
        >
          ← Books
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
            data-testid="delete-chapter"
          >
            Delete
          </button>
        </div>
      </header>

      <input
        type="text"
        value={currentTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Untitled chapter"
        className="bg-transparent px-1 py-2 text-2xl font-semibold tracking-tight focus:outline-none"
        data-testid="chapter-title"
      />

      <div
        className={`grid flex-1 min-h-0 gap-4 ${
          chatPanelOpen ? 'grid-cols-1 md:grid-cols-[2fr_1fr]' : 'grid-cols-1'
        }`}
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <NoteEditor
            initialContent={chapterQ.data.draft}
            onChange={onDraftChange}
            entityHighlights={entityHighlights}
          />
          <LinkedEntitiesPanel worldId={worldId} source={linkSource} />
          <DetectedEntitiesPanel
            worldId={worldId}
            candidates={extract.candidates}
            status={extract.status}
            error={extract.error}
            source={linkSource}
          />
        </div>
        {chatPanelOpen ? (
          <div className="min-h-0">
            <ChatPanel
              parentKind="chapter"
              parentId={chapterId}
              worldId={worldId}
              worldMemory={worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined}
              worldCustomPrompt={worldQ.data?.custom_prompt ?? undefined}
              noteTitle={currentTitle || undefined}
              noteContextText={draftTextForLlm}
              taggedEntities={taggedEntitiesForLlm}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
