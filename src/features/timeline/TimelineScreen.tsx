import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useChapterEventsByWorld } from '@/lib/queries/chapterEvents';
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
import { buildEventChaptersMap } from './chronoDerive';
import { sortEventsByChrono, rankForMoveDown, rankForMoveUp } from './timelineItems';
import type { TimelineEvent } from './types';
import type { Chapter } from '@/features/chapters/types';

export function TimelineScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/timeline' });
  const session = useSession();
  const worldQ = useWorld(worldId);
  const eventsQ = useEvents(worldId);
  const chaptersQ = useChaptersByWorld(worldId);
  const chapterEventsQ = useChapterEventsByWorld(worldId);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const confirm = useConfirm();
  const [newTitle, setNewTitle] = useState('');

  const events = useMemo(() => sortEventsByChrono(eventsQ.data ?? []), [eventsQ.data]);
  const chapters = useMemo(() => chaptersQ.data ?? [], [chaptersQ.data]);
  const chapterEvents = useMemo(() => chapterEventsQ.data ?? [], [chapterEventsQ.data]);
  const eventChaptersMap = useMemo(
    () => buildEventChaptersMap(chapterEvents, chapters),
    [chapterEvents, chapters],
  );
  const ranks = useMemo(() => events.map((e) => e.chronological_rank), [events]);

  async function onCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const rank = nextRankAfter((eventsQ.data ?? []).map((ev) => ({ rank: ev.chronological_rank })));
    await createEvent.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      title: trimmed,
      chronologicalRank: rank,
    });
    setNewTitle('');
  }

  function onMove(idx: number, dir: 'up' | 'down') {
    const newRank = dir === 'up' ? rankForMoveUp(ranks, idx) : rankForMoveDown(ranks, idx);
    if (!newRank) return;
    updateEvent.mutate({ id: events[idx].id, chronologicalRank: newRank });
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
        <span className="text-xs text-fg-muted" data-testid="timeline-count">
          {events.length} event{events.length === 1 ? '' : 's'}
        </span>
      </header>

      <p className="text-xs text-fg-muted">
        Events are the canonical truth of your world. Chapters retell them — each event shows the
        chapters that cover it.
      </p>

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

      {eventsQ.error || chaptersQ.error ? (
        <p className="text-sm text-red-400" data-testid="timeline-error">
          {eventsQ.error?.message ?? chaptersQ.error?.message}
        </p>
      ) : null}

      {eventsQ.isLoading ? (
        <p className="text-fg-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-fg-muted" data-testid="timeline-empty">
          No events yet. Create one above — every chapter has to point at one.
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
            {events.map((ev, i) => (
              <EventRow
                key={ev.id}
                event={ev}
                index={i + 1}
                worldId={worldId}
                chapters={eventChaptersMap.get(ev.id) ?? []}
                isFirst={i === 0}
                isLast={i === events.length - 1}
                onMoveUp={() => onMove(i, 'up')}
                onMoveDown={() => onMove(i, 'down')}
                onSave={(patch) => updateEvent.mutate({ id: ev.id, ...patch })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete event "${ev.title}"?`,
                    message: 'Linked chapters will become "no events linked".',
                    danger: true,
                  });
                  if (!ok) return;
                  deleteEvent.mutate({ id: ev.id, worldId });
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

interface EventRowProps {
  event: TimelineEvent;
  index: number;
  worldId: string;
  chapters: Chapter[];
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (patch: { title?: string; description?: string | null; tags?: string[] }) => void;
  onDelete: () => void;
}

function EventRow({
  event,
  index,
  worldId,
  chapters,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: EventRowProps) {
  const [editing, setEditing] = useState(false);
  const offScreen = chapters.length === 0;

  return (
    <li
      className="overflow-hidden rounded-md border border-border bg-bg-panel"
      data-testid="timeline-row"
      data-kind="event"
      data-off-screen={offScreen ? 'true' : 'false'}
    >
      <div className="flex items-stretch">
        <div className="flex w-10 flex-col items-center justify-center border-r border-border bg-bg-subtle">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="px-2 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30"
            title="Move earlier"
            data-testid="timeline-move-up"
          >
            ▲
          </button>
          <span
            className="font-mono text-[10px] tabular-nums text-fg-muted"
            data-testid="timeline-index"
          >
            #{index}
          </span>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="px-2 py-1 text-xs text-fg-muted hover:text-fg disabled:opacity-30"
            title="Move later"
            data-testid="timeline-move-down"
          >
            ▼
          </button>
        </div>
        <Link
          to="/worlds/$worldId/events/$eventId"
          params={{ worldId, eventId: event.id }}
          className="flex-1 px-3 py-2 hover:bg-bg-subtle"
          data-testid="timeline-event-link"
        >
          <div className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            <span>📅 Event</span>
            {offScreen ? (
              <span
                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-300"
                data-testid="event-offscreen-badge"
                title="No chapter is currently retelling this event"
              >
                off-screen
              </span>
            ) : null}
            {event.tags.length > 0 ? <span>· {event.tags.join(', ')}</span> : null}
          </div>
          <div className="text-sm font-medium">{event.title}</div>
          {event.description ? (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-fg-muted">
              {event.description}
            </p>
          ) : null}
          {chapters.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1" data-testid="event-chapter-chips">
              {chapters.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center rounded border border-rose-800/40 bg-rose-800/10 px-1.5 py-0.5 text-[10px] text-rose-300"
                  data-testid="event-chapter-chip"
                  title={c.title ?? '(untitled chapter)'}
                >
                  📖 {c.title?.trim() || '(untitled)'}
                </span>
              ))}
            </div>
          ) : null}
        </Link>
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
            onClick={onDelete}
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
            onSave(patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : null}
    </li>
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
    const tags = tagsInput.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    onSave({ title: trimmed, description: description.trim() || null, tags });
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
        <span className="text-xs text-fg-muted">Description (plain summary, edit rich text inside the event)</span>
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
