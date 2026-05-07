import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  useEvent,
  useUpdateEvent,
  useDeleteEvent,
  useEvents,
} from '@/lib/queries/events';
import { useEventChapters } from '@/lib/queries/chapterEvents';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useWorld } from '@/lib/queries/worlds';
import { useEventLinkSource } from '@/features/notes/linkSources';
import { NoteEditor, type NoteEditorHandle } from '@/features/notes/NoteEditor';
import { ChatPanel } from '@/features/notes/ChatPanel';
import { LinkedEntitiesPanel } from '@/features/notes/NoteEntitiesPanel';
import { DetectedEntitiesPanel } from '@/features/notes/DetectedEntitiesPanel';
import { useAutoExtract } from '@/features/notes/useAutoExtract';
import { useConfirm } from '@/lib/useConfirm';
import { htmlToPlainText } from '@/lib/html';
import { resolveColor } from '@/lib/entityColors';
import type { EntityHighlightSpec } from '@/features/notes/entityHighlightExtension';
import type { TaggedEntity } from '@/lib/llm';

export function EventScreen() {
  const { worldId, eventId } = useParams({ from: '/worlds/$worldId/events/$eventId' });
  const navigate = useNavigate();
  const eventQ = useEvent(eventId);
  const worldQ = useWorld(worldId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const linkedChaptersQ = useEventChapters(eventId);
  const allChaptersQ = useChaptersByWorld(worldId);
  const allEventsQ = useEvents(worldId);
  const linkSource = useEventLinkSource({ eventId, worldId });
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const confirm = useConfirm();
  const editorRef = useRef<NoteEditorHandle>(null);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  const event = eventQ.data;
  const currentTitle = titleDraft ?? event?.title ?? '';

  const linkedChapters = useMemo(() => {
    const chapterIds = new Set((linkedChaptersQ.data ?? []).map((ce) => ce.chapter_id));
    return (allChaptersQ.data ?? []).filter((c) => chapterIds.has(c.id));
  }, [linkedChaptersQ.data, allChaptersQ.data]);

  const entityHighlights = useMemo<EntityHighlightSpec[]>(() => {
    const types = typesQ.data ?? [];
    const typesById = new Map(types.map((t) => [t.id, t]));
    return (entitiesQ.data ?? []).map((e) => {
      const t = typesById.get(e.entity_type_id);
      const color = t ? resolveColor(t.color, t.name) : '#a1a1aa';
      return { name: e.name, aliases: e.aliases ?? [], color };
    });
  }, [entitiesQ.data, typesQ.data]);

  // For chat context: tag the linked entities like ChapterScreen does.
  const taggedEntitiesForLlm = useMemo<TaggedEntity[]>(() => {
    const links = linkSource.links;
    if (links.length === 0) return [];
    const typesById = new Map((typesQ.data ?? []).map((t) => [t.id, t]));
    const entitiesById = new Map((entitiesQ.data ?? []).map((e) => [e.id, e]));
    const out: TaggedEntity[] = [];
    for (const l of links) {
      const e = entitiesById.get(l.entityId);
      if (!e) continue;
      out.push({ name: e.name, type: typesById.get(e.entity_type_id)?.name ?? 'Unknown' });
    }
    return out;
  }, [linkSource.links, entitiesQ.data, typesQ.data]);

  // Live HTML pushed by the editor on every keystroke — see notes in the other
  // *Screen components for the rationale (decouples extract debounce from save).
  const [liveText, setLiveText] = useState<string | null>(null);
  useEffect(() => {
    setLiveText(null);
  }, [eventId]);

  const descriptionPlain = useMemo(() => {
    if (liveText !== null) return htmlToPlainText(liveText);
    if (event?.description_html) return htmlToPlainText(event.description_html);
    return event?.description ?? '';
  }, [liveText, event]);

  const extract = useAutoExtract({
    parentKind: 'note',
    // Reuse 'note' kind for the cache key — the hook keys by (parentKind, parentId)
    // and the per-event extraction is conceptually identical to a note's.
    parentId: eventId,
    worldId,
    plainText: descriptionPlain,
  });

  function onTitleBlur() {
    if (!event || titleDraft === null) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== event.title) {
      updateEvent.mutate({ id: eventId, title: trimmed });
    }
    setTitleDraft(null);
  }

  function onEditorDebouncedChange(html: string) {
    if (!event) return;
    const plain = htmlToPlainText(html);
    if (html === (event.description_html ?? '') && plain === (event.description ?? '')) return;
    updateEvent.mutate({
      id: eventId,
      descriptionHtml: html,
      description: plain || null,
    });
  }

  async function onDelete() {
    if (!event) return;
    const ok = await confirm({
      title: `Delete event "${event.title}"?`,
      message: 'Linked chapters will become "no events linked" until you add another.',
      danger: true,
    });
    if (!ok) return;
    await deleteEvent.mutateAsync({ id: eventId, worldId });
    void navigate({ to: '/worlds/$worldId/timeline', params: { worldId } });
  }

  // Wait for the event to load before rendering — NoteEditor takes
  // `initialContent` and is keyed off the event id, so it'll be created with
  // the right content from the start.
  if (eventQ.isLoading || !event) {
    return (
      <main className="mx-auto flex h-full max-w-[1800px] flex-col gap-4 px-6 py-6">
        <p className="text-fg-muted">Loading event…</p>
      </main>
    );
  }

  const offScreen = linkedChapters.length === 0;
  // Find chrono neighbours for context display.
  const allEvents = allEventsQ.data ?? [];
  const sortedEvents = allEvents
    .slice()
    .sort((a, b) =>
      a.chronological_rank < b.chronological_rank ? -1 :
      a.chronological_rank > b.chronological_rank ? 1 : 0,
    );
  const chronoIndex = sortedEvents.findIndex((e) => e.id === eventId);

  return (
    <main className="mx-auto flex h-full max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId/timeline"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-timeline"
        >
          ← Timeline
        </Link>
        <div className="flex items-center gap-2">
          {offScreen ? (
            <span
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-mono uppercase text-amber-300"
              data-testid="event-offscreen-badge"
              title="No chapter is currently retelling this event."
            >
              Off-screen
            </span>
          ) : null}
          <span className="text-xs text-fg-muted" data-testid="event-chrono-pos">
            #{chronoIndex + 1} of {sortedEvents.length}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-fg-muted hover:text-red-400"
            data-testid="delete-event"
          >
            Delete
          </button>
        </div>
      </header>

      <input
        type="text"
        value={currentTitle}
        onChange={(e) => setTitleDraft(e.target.value)}
        onBlur={onTitleBlur}
        placeholder="Event title"
        className="bg-transparent px-1 py-2 text-2xl font-semibold tracking-tight focus:outline-none"
        data-testid="event-title"
      />

      <section className="flex flex-wrap items-center gap-2 text-xs" data-testid="told-in-chapters">
        <span className="font-semibold uppercase tracking-wider text-fg-muted">Told in chapters:</span>
        {linkedChapters.length === 0 ? (
          <span className="italic text-fg-muted">none yet — link a chapter from its "Events covered" panel.</span>
        ) : (
          linkedChapters.map((c) => (
            <Link
              key={c.id}
              to="/worlds/$worldId/chapters/$chapterId"
              params={{ worldId, chapterId: c.id }}
              className="inline-flex items-center rounded border border-rose-800/40 bg-rose-800/10 px-1.5 py-0.5 text-rose-300 hover:opacity-80"
              data-testid="told-in-chapter-chip"
            >
              📖 {c.title?.trim() || '(untitled)'}
            </Link>
          ))
        )}
      </section>

      <div className="grid min-h-0 flex-1 gap-4 grid-cols-1 md:grid-cols-[260px_1fr_540px]">
        <aside className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto md:order-1">
          <LinkedEntitiesPanel worldId={worldId} source={linkSource} />
          <DetectedEntitiesPanel
            worldId={worldId}
            candidates={extract.candidates}
            status={extract.status}
            error={extract.error}
            source={linkSource}
          />
        </aside>

        <div className="order-1 min-h-0 overflow-y-auto md:order-2">
          <NoteEditor
            ref={editorRef}
            key={event.id}
            initialContent={event.description_html ?? ''}
            onChange={onEditorDebouncedChange}
            onLiveUpdate={setLiveText}
            entityHighlights={entityHighlights}
          />
        </div>

        <div className="order-3 flex min-h-0 flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Chat about this event</h3>
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1">
              <ChatPanel
                parentKind="event"
                parentId={eventId}
                worldId={worldId}
                worldMemory={worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined}
                worldCustomPrompt={worldQ.data?.custom_prompt ?? undefined}
                noteTitle={event.title}
                noteContextText={descriptionPlain}
                taggedEntities={taggedEntitiesForLlm}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
