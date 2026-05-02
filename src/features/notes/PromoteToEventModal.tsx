import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEvents, useCreateEvent } from '@/lib/queries/events';
import { logNotePromotion } from '@/lib/queries/notePromotions';
import { useSession } from '@/features/auth/session';
import { nextRankAfter } from '@/lib/ranks';
import { htmlToPlainText } from '@/lib/html';

interface Props {
  open: boolean;
  onClose: () => void;
  worldId: string;
  noteId: string;
  noteTitle?: string;
  noteContent: string;
}

export function PromoteToEventModal({
  open,
  onClose,
  worldId,
  noteId,
  noteTitle,
  noteContent,
}: Props) {
  const session = useSession();
  const eventsQ = useEvents(worldId);
  const createEvent = useCreateEvent();
  const navigate = useNavigate();

  const [title, setTitle] = useState<string>(noteTitle ?? '');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(noteTitle ?? '');
    setTagsInput('');
    setError(null);
  }, [open, noteTitle]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Pick a title for the event.');
      return;
    }
    try {
      const allRanks = (eventsQ.data ?? []).map((ev) => ({ rank: ev.chronological_rank }));
      const rank = nextRankAfter(allRanks);
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const description = htmlToPlainText(noteContent).trim() || null;
      const event = await createEvent.mutateAsync({
        worldId,
        ownerId: session.session.user.id,
        title: trimmed,
        chronologicalRank: rank,
        description,
        tags,
        sourceNoteId: noteId,
      });
      void logNotePromotion({
        noteId,
        ownerId: session.session.user.id,
        targetKind: 'event',
        targetId: event.id,
      });
      onClose();
      void navigate({ to: '/worlds/$worldId/timeline', params: { worldId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="promote-event-modal"
    >
      <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-bg-panel p-4">
        <h2 className="text-lg font-semibold">Promote to event</h2>
        <p className="text-xs text-fg-muted">
          Adds a marker on the timeline. The note's text becomes the event description.
        </p>
        <form onSubmit={onSubmit} className="space-y-3" data-testid="promote-event-form">
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Event title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="La Grande Bataille"
              className="w-full px-3 py-2 text-sm"
              data-testid="promote-event-title"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Tags (comma-separated, optional)</span>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="war, off-screen"
              className="w-full px-3 py-2 text-sm"
              data-testid="promote-event-tags"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-400" data-testid="promote-event-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              data-testid="promote-event-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createEvent.isPending || !title.trim()}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="promote-event-submit"
            >
              {createEvent.isPending ? 'Promoting…' : 'Promote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
