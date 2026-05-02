import { useMemo, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';
import { useEvents, useCreateEvent } from '@/lib/queries/events';
import {
  useChapterEvents,
  useLinkChapterEvent,
  useUnlinkChapterEvent,
  useUpdateChapterEventRank,
} from '@/lib/queries/chapterEvents';
import { useConfirm } from '@/lib/useConfirm';
import { nextRankAfter } from '@/lib/ranks';
import { rankForMoveDown, rankForMoveUp } from '@/features/timeline/timelineItems';
import type { TimelineEvent } from '@/features/timeline/types';

interface Props {
  worldId: string;
  chapterId: string;
}

export function EventsCoveredPanel({ worldId, chapterId }: Props) {
  const session = useSession();
  const allEventsQ = useEvents(worldId);
  const linksQ = useChapterEvents(chapterId);
  const linkM = useLinkChapterEvent();
  const unlinkM = useUnlinkChapterEvent();
  const updateRankM = useUpdateChapterEventRank();
  const createEvent = useCreateEvent();
  const confirm = useConfirm();

  const [picker, setPicker] = useState<'closed' | 'link' | 'create'>('closed');
  const [linkEventId, setLinkEventId] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');

  const links = useMemo(() => linksQ.data ?? [], [linksQ.data]);
  const allEvents = useMemo(() => allEventsQ.data ?? [], [allEventsQ.data]);
  const eventsById = useMemo(
    () => new Map(allEvents.map((e) => [e.id, e] as const)),
    [allEvents],
  );

  const linkedEvents = useMemo(
    () =>
      links
        .map((l) => ({ link: l, event: eventsById.get(l.event_id) }))
        .filter((x): x is { link: typeof links[number]; event: TimelineEvent } => !!x.event),
    [links, eventsById],
  );
  const ranks = useMemo(() => linkedEvents.map((x) => x.link.narrative_rank), [linkedEvents]);

  const unlinkedEvents = useMemo(() => {
    const linkedIds = new Set(links.map((l) => l.event_id));
    return allEvents.filter((e) => !linkedIds.has(e.id));
  }, [links, allEvents]);

  function onMove(idx: number, dir: 'up' | 'down') {
    const newRank = dir === 'up' ? rankForMoveUp(ranks, idx) : rankForMoveDown(ranks, idx);
    if (!newRank) return;
    updateRankM.mutate({
      chapterId,
      eventId: linkedEvents[idx].link.event_id,
      narrativeRank: newRank,
    });
  }

  async function onLinkExisting(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed' || !linkEventId) return;
    const narrativeRank = nextRankAfter(linkedEvents.map((x) => ({ rank: x.link.narrative_rank })));
    await linkM.mutateAsync({
      chapterId,
      eventId: linkEventId,
      worldId,
      ownerId: session.session.user.id,
      narrativeRank,
    });
    setLinkEventId('');
    setPicker('closed');
  }

  async function onCreateAndLink(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const title = newTitle.trim();
    if (!title) return;
    // Place the new event at the end of the world chrono.
    const chronoRank = nextRankAfter(allEvents.map((ev) => ({ rank: ev.chronological_rank })));
    const event = await createEvent.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      title,
      chronologicalRank: chronoRank,
    });
    const narrativeRank = nextRankAfter(linkedEvents.map((x) => ({ rank: x.link.narrative_rank })));
    await linkM.mutateAsync({
      chapterId,
      eventId: event.id,
      worldId,
      ownerId: session.session.user.id,
      narrativeRank,
    });
    setNewTitle('');
    setPicker('closed');
  }

  async function onUnlink(eventId: string, title: string) {
    const ok = await confirm({
      title: `Unlink event "${title}"?`,
      message: 'The event itself stays in the timeline. Only the link to this chapter is removed.',
    });
    if (!ok) return;
    unlinkM.mutate({ chapterId, eventId, worldId });
  }

  return (
    <section
      className="rounded-md border border-border bg-bg-panel p-2"
      data-testid="events-covered-panel"
    >
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Events covered ({linkedEvents.length})
        </h3>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setPicker(picker === 'link' ? 'closed' : 'link')}
            disabled={unlinkedEvents.length === 0}
            className="bg-bg-subtle px-1.5 py-0.5 hover:bg-bg disabled:opacity-50"
            data-testid="link-existing-event-toggle"
            title={unlinkedEvents.length === 0 ? 'No unlinked events available' : 'Link an existing event'}
          >
            + Link
          </button>
          <button
            type="button"
            onClick={() => setPicker(picker === 'create' ? 'closed' : 'create')}
            className="bg-bg-subtle px-1.5 py-0.5 hover:bg-bg"
            data-testid="create-event-from-chapter-toggle"
          >
            + New
          </button>
        </div>
      </div>

      {picker === 'link' ? (
        <form onSubmit={onLinkExisting} className="flex gap-1 px-1 py-1" data-testid="link-existing-form">
          <select
            value={linkEventId}
            onChange={(e) => setLinkEventId(e.target.value)}
            className="flex-1 bg-bg-subtle px-1 py-0.5 text-xs"
            data-testid="link-existing-select"
          >
            <option value="">— pick an event —</option>
            {unlinkedEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!linkEventId || linkM.isPending}
            className="bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-fg disabled:opacity-50"
            data-testid="link-existing-submit"
          >
            Link
          </button>
        </form>
      ) : null}

      {picker === 'create' ? (
        <form onSubmit={onCreateAndLink} className="flex gap-1 px-1 py-1" data-testid="create-event-from-chapter-form">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New event title"
            className="flex-1 px-1 py-0.5 text-xs"
            data-testid="create-event-from-chapter-title"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || createEvent.isPending}
            className="bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-fg disabled:opacity-50"
            data-testid="create-event-from-chapter-submit"
          >
            Create
          </button>
        </form>
      ) : null}

      {linksQ.isLoading ? (
        <p className="px-1 text-xs text-fg-muted">Loading…</p>
      ) : linkedEvents.length === 0 ? (
        <p
          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
          data-testid="no-events-linked-warning"
        >
          ⚠ No events linked. This chapter is hidden from the timeline. Add at least one event.
        </p>
      ) : (
        <ul className="space-y-1" data-testid="linked-events-list">
          {linkedEvents.map(({ event }, i) => (
            <li
              key={event.id}
              className="flex items-center gap-1 rounded border border-border bg-bg-subtle/50 px-1 py-1 text-xs"
              data-testid="linked-event-row"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => onMove(i, 'up')}
                  disabled={i === 0}
                  className="px-1 text-[10px] text-fg-muted hover:text-fg disabled:opacity-30"
                  data-testid="linked-event-move-up"
                  title="Move earlier in narrative"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onMove(i, 'down')}
                  disabled={i === linkedEvents.length - 1}
                  className="px-1 text-[10px] text-fg-muted hover:text-fg disabled:opacity-30"
                  data-testid="linked-event-move-down"
                  title="Move later in narrative"
                >
                  ▼
                </button>
              </div>
              <Link
                to="/worlds/$worldId/events/$eventId"
                params={{ worldId, eventId: event.id }}
                className="flex-1 truncate hover:underline"
                data-testid="linked-event-link"
                title={event.title}
              >
                📅 {event.title}
              </Link>
              <button
                type="button"
                onClick={() => onUnlink(event.id, event.title)}
                className="text-[10px] text-fg-muted hover:text-red-400"
                data-testid="linked-event-unlink"
                title="Unlink (keeps the event)"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
