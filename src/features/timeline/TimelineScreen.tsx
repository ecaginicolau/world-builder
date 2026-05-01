import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useChaptersByWorld, useUpdateChapter } from '@/lib/queries/chapters';
import { useBooks } from '@/lib/queries/books';
import { usePartsByWorld } from '@/lib/queries/parts';
import {
  useCreateEvent,
  useDeleteEvent,
  useEvents,
  useUpdateEvent,
} from '@/lib/queries/events';
import { useWorld } from '@/lib/queries/worlds';
import { useSession } from '@/features/auth/session';
import { nextRankAfter } from '@/lib/ranks';
import { useConfirm } from '@/lib/useConfirm';
import type { Book, Part } from '@/features/chapters/types';
import {
  mergeTimelineItems,
  rankForMoveDown,
  rankForMoveUp,
  type TimelineItem,
} from './timelineItems';
import type { TimelineEvent } from './types';

export function TimelineScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/timeline' });
  const session = useSession();
  const worldQ = useWorld(worldId);
  const chaptersQ = useChaptersByWorld(worldId);
  const eventsQ = useEvents(worldId);
  const booksQ = useBooks(worldId);
  const partsQ = usePartsByWorld(worldId);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const updateChapter = useUpdateChapter();
  const confirm = useConfirm();
  const [newTitle, setNewTitle] = useState('');

  const chapters = useMemo(() => chaptersQ.data ?? [], [chaptersQ.data]);
  const events = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);

  const items = useMemo(() => mergeTimelineItems(chapters, events), [chapters, events]);

  const partsById = useMemo(
    () => new Map((partsQ.data ?? []).map((p) => [p.id, p] as const)),
    [partsQ.data],
  );
  const booksById = useMemo(
    () => new Map((booksQ.data ?? []).map((b) => [b.id, b] as const)),
    [booksQ.data],
  );

  async function onCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const allRanks = [
      ...chapters.map((c) => ({ rank: c.chronological_rank })),
      ...events.map((ev) => ({ rank: ev.chronological_rank })),
    ];
    const rank = nextRankAfter(allRanks);
    await createEvent.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      title: trimmed,
      chronologicalRank: rank,
    });
    setNewTitle('');
  }

  function onMove(idx: number, dir: 'up' | 'down') {
    const item = items[idx];
    const newRank = dir === 'up' ? rankForMoveUp(items, idx) : rankForMoveDown(items, idx);
    if (!newRank) return;
    if (item.kind === 'event') {
      updateEvent.mutate({ id: item.data.id, chronologicalRank: newRank });
    } else {
      updateChapter.mutate({ id: item.data.id, chronologicalRank: newRank });
    }
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex items-center justify-between gap-2">
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-world"
        >
          ← {worldQ.data?.name ?? 'World'}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <span className="text-xs text-fg-muted">
          {chapters.length} chapter{chapters.length === 1 ? '' : 's'} · {events.length} event
          {events.length === 1 ? '' : 's'}
        </span>
      </header>

      <form onSubmit={onCreateEvent} className="flex gap-2" data-testid="create-event-form">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New event (e.g. 'La Grande Bataille')"
          className="flex-1 px-3 py-2 text-sm"
          data-testid="create-event-title"
        />
        <button
          type="submit"
          disabled={createEvent.isPending || !newTitle.trim()}
          className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          data-testid="create-event-submit"
        >
          + Event
        </button>
      </form>

      {chaptersQ.error || eventsQ.error ? (
        <p className="text-sm text-red-400" data-testid="timeline-error">
          {chaptersQ.error?.message ?? eventsQ.error?.message}
        </p>
      ) : null}

      {chaptersQ.isLoading || eventsQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-fg-muted" data-testid="timeline-empty">
          No chapters or events yet. Create an event above, or write a chapter from the Books
          screen.
        </p>
      ) : (
        <div className="flex flex-col" data-testid="timeline-wrapper">
          <p
            className="pb-1 text-center text-[11px] uppercase tracking-wider text-fg-muted"
            data-testid="timeline-earlier-label"
          >
            ↑ Earlier in the story
          </p>
          <ul className="space-y-2" data-testid="timeline-list">
            {items.map((item, i) => (
              <TimelineRow
                key={`${item.kind}:${item.data.id}`}
                item={item}
                index={i + 1}
                worldId={worldId}
                isFirst={i === 0}
                isLast={i === items.length - 1}
                partsById={partsById}
                booksById={booksById}
                onMoveUp={() => onMove(i, 'up')}
                onMoveDown={() => onMove(i, 'down')}
                onSaveEvent={(patch) => {
                  if (item.kind !== 'event') return;
                  updateEvent.mutate({ id: item.data.id, ...patch });
                }}
                onDeleteEvent={async () => {
                  if (item.kind !== 'event') return;
                  const ok = await confirm({
                    title: `Delete event "${item.data.title}"?`,
                    danger: true,
                  });
                  if (!ok) return;
                  deleteEvent.mutate({ id: item.data.id, worldId });
                }}
              />
            ))}
          </ul>
          <p
            className="pt-1 text-center text-[11px] uppercase tracking-wider text-fg-muted"
            data-testid="timeline-later-label"
          >
            Later in the story ↓
          </p>
        </div>
      )}
    </main>
  );
}

interface RowProps {
  item: TimelineItem;
  index: number;
  worldId: string;
  isFirst: boolean;
  isLast: boolean;
  partsById: Map<string, Part>;
  booksById: Map<string, Book>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaveEvent: (patch: { title?: string; description?: string | null; tags?: string[] }) => void;
  onDeleteEvent: () => void;
}

function TimelineRow({
  item,
  index,
  worldId,
  isFirst,
  isLast,
  partsById,
  booksById,
  onMoveUp,
  onMoveDown,
  onSaveEvent,
  onDeleteEvent,
}: RowProps) {
  const [editing, setEditing] = useState(false);

  if (item.kind === 'chapter') {
    const chapter = item.data;
    const part = partsById.get(chapter.part_id);
    const book = part ? booksById.get(part.book_id) : null;
    const where = [book?.title, part?.title].filter(Boolean).join(' · ');
    return (
      <li
        className="flex items-stretch overflow-hidden rounded-md border border-border bg-bg-panel"
        data-testid="timeline-row"
        data-kind="chapter"
      >
        <ReorderColumn
          index={index}
          isFirst={isFirst}
          isLast={isLast}
          onUp={onMoveUp}
          onDown={onMoveDown}
        />
        <Link
          to="/worlds/$worldId/chapters/$chapterId"
          params={{ worldId, chapterId: chapter.id }}
          className="flex-1 px-3 py-2 hover:bg-bg-subtle"
          data-testid="timeline-chapter-link"
        >
          <div className="text-xs text-fg-muted">📖 Chapter{where ? ` · ${where}` : ''}</div>
          <div className="text-sm">{chapter.title?.trim() || '(untitled chapter)'}</div>
        </Link>
      </li>
    );
  }

  const event = item.data;
  return (
    <li
      className="overflow-hidden rounded-md border border-border bg-bg-panel"
      data-testid="timeline-row"
      data-kind="event"
    >
      <div className="flex items-stretch">
        <ReorderColumn
          index={index}
          isFirst={isFirst}
          isLast={isLast}
          onUp={onMoveUp}
          onDown={onMoveDown}
        />
        <div className="flex-1 px-3 py-2">
          <div className="text-xs text-fg-muted">
            📅 Event
            {event.tags.length > 0 ? ` · ${event.tags.join(', ')}` : ''}
          </div>
          <div className="text-sm">{event.title}</div>
          {event.description ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-fg-muted">{event.description}</p>
          ) : null}
        </div>
        <div className="flex flex-col justify-center gap-1 border-l border-border px-2 py-1 text-xs">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-fg-muted hover:text-fg"
            data-testid="event-edit-toggle"
          >
            {editing ? 'close' : 'edit'}
          </button>
          <button
            type="button"
            onClick={onDeleteEvent}
            className="text-fg-muted hover:text-red-400"
            data-testid="event-delete"
          >
            delete
          </button>
        </div>
      </div>
      {editing ? (
        <EventEditPanel
          event={event}
          onSave={(patch) => {
            onSaveEvent(patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}

interface ReorderProps {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
}

function ReorderColumn({ index, isFirst, isLast, onUp, onDown }: ReorderProps) {
  return (
    <div className="flex w-10 flex-col items-center justify-center border-r border-border bg-bg-subtle">
      <button
        type="button"
        onClick={onUp}
        disabled={isFirst}
        className="px-2 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30"
        title="Move earlier"
        data-testid="timeline-move-up"
      >
        ▲
      </button>
      <span
        className="font-mono text-[10px] tabular-nums text-fg-muted"
        title="Chronological position"
        data-testid="timeline-index"
      >
        #{index}
      </span>
      <button
        type="button"
        onClick={onDown}
        disabled={isLast}
        className="px-2 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30"
        title="Move later"
        data-testid="timeline-move-down"
      >
        ▼
      </button>
    </div>
  );
}

interface EventEditPanelProps {
  event: TimelineEvent;
  onSave: (patch: { title?: string; description?: string | null; tags?: string[] }) => void;
  onCancel: () => void;
}

function EventEditPanel({ event, onSave, onCancel }: EventEditPanelProps) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [tagsInput, setTagsInput] = useState(event.tags.join(', '));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onSave({
      title: trimmed,
      description: description.trim() || null,
      tags,
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 border-t border-border bg-bg-subtle/40 px-3 py-2"
      data-testid="event-edit-form"
    >
      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-2 py-1 text-sm"
          data-testid="event-edit-title"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-2 py-1 text-sm"
          data-testid="event-edit-description"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">Tags (comma-separated)</span>
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="war, off-screen"
          className="w-full px-2 py-1 text-sm"
          data-testid="event-edit-tags"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="bg-bg-subtle px-3 py-1 text-xs hover:bg-bg"
          data-testid="event-edit-cancel"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="bg-accent px-3 py-1 text-xs font-medium text-accent-fg"
          data-testid="event-edit-save"
        >
          Save
        </button>
      </div>
    </form>
  );
}
