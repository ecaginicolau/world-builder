import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/features/auth/session';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import { useChapter, useUpdateChapter } from '@/lib/queries/chapters';
import { useEvents, useCreateEvent } from '@/lib/queries/events';
import {
  useChapterEvents,
  useChapterEventsByWorld,
  useLinkChapterEvent,
} from '@/lib/queries/chapterEvents';
import { useLinkEventEntity } from '@/lib/queries/eventParticipants';
import { useWorld } from '@/lib/queries/worlds';
import { useUserSettings } from '@/lib/queries/userSettings';
import {
  useCreateEntityVersion,
  ensureInitVersion,
  entityVersionsKeys,
} from '@/lib/queries/entityVersions';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logRun } from '@/lib/queries/runs';
import { nextRankAfter } from '@/lib/ranks';
import {
  CURRENT_RANK_SENTINEL,
  formatFieldValue,
  resolveSnapshotMapAtRank,
} from '@/features/entities/versioning';
import { buildChapterChronoMap } from '@/features/timeline/chronoDerive';
import {
  getCanonProposer,
  type CanonEntityCard,
  type EventProposal,
} from '@/lib/llm/proposeCanon';
import { htmlToPlainText } from '@/lib/html';
import type { Entity, EntityVersion, FieldDef } from '@/features/entities/types';

interface Props {
  open: boolean;
  onClose: () => void;
  worldId: string;
  chapterId: string;
  /** The current chapter text used as the source of analysis. */
  chapterText: string;
}

type DecisionStatus = 'pending' | 'accepted' | 'skipped' | 'failed';

interface EventDecision {
  status: DecisionStatus;
  error?: string;
}

export function ProposeUpdatesModal({
  open,
  onClose,
  worldId,
  chapterId,
  chapterText,
}: Props) {
  const session = useSession();
  const qc = useQueryClient();
  const worldQ = useWorld(worldId);
  const chapterQ = useChapter(chapterId);
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const participantsQ = useChapterParticipants(chapterId);
  const eventsQ = useEvents(worldId);
  const linkedEventsQ = useChapterEvents(chapterId);
  const allChapterEventsQ = useChapterEventsByWorld(worldId);
  const settingsQ = useUserSettings();
  const createEvent = useCreateEvent();
  const linkChapterEvent = useLinkChapterEvent();
  const linkEventEntity = useLinkEventEntity();
  const createVersion = useCreateEntityVersion();
  const updateChapter = useUpdateChapter();

  const chapterChrono = useMemo(
    () => buildChapterChronoMap(allChapterEventsQ.data ?? [], eventsQ.data ?? []),
    [allChapterEventsQ.data, eventsQ.data],
  );

  const [phase, setPhase] = useState<'idle' | 'loading' | 'review' | 'error'>('idle');
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [decisions, setDecisions] = useState<Record<number, EventDecision>>({});
  const [diffAccepted, setDiffAccepted] = useState<Record<number, boolean[]>>({});
  const [error, setError] = useState<string | null>(null);

  const linkedEntities = useMemo<Entity[]>(() => {
    const ids = new Set((participantsQ.data ?? []).map((p) => p.entity_id));
    return (entitiesQ.data ?? []).filter((e) => ids.has(e.id));
  }, [participantsQ.data, entitiesQ.data]);

  const typesById = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.id, t])),
    [typesQ.data],
  );
  const entitiesById = useMemo(
    () => new Map((entitiesQ.data ?? []).map((e) => [e.id, e])),
    [entitiesQ.data],
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setProposals([]);
      setDecisions({});
      setDiffAccepted({});
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function runProposals() {
    if (session.status !== 'authed') return;
    if (!chapterQ.data) return;
    setPhase('loading');
    setError(null);
    try {
      // Resolve entity cards at the chapter's derived chrono (or current state).
      const currentChrono = chapterChrono.get(chapterId) ?? CURRENT_RANK_SENTINEL;
      const cards: CanonEntityCard[] = [];
      for (const e of linkedEntities) {
        const t = typesById.get(e.entity_type_id);
        const fields: FieldDef[] = t?.fields ?? [];
        const { data: versions, error: vErr } = await supabase
          .from('entity_versions')
          .select('*')
          .eq('entity_id', e.id);
        if (vErr) throw vErr;
        const snap = resolveSnapshotMapAtRank(
          (versions ?? []) as EntityVersion[],
          currentChrono,
          fields,
        );
        const currentSnapshot: Record<string, string> = {};
        for (const f of fields) {
          currentSnapshot[f.name] = formatFieldValue(snap[f.name] ?? null);
        }
        cards.push({
          id: e.id,
          name: e.name,
          type: t?.name ?? 'Unknown',
          fields,
          currentSnapshot,
        });
      }
      // Build "already in canon" — title + description of currently linked events.
      const existingEvents = (linkedEventsQ.data ?? [])
        .map((ce) => (eventsQ.data ?? []).find((ev) => ev.id === ce.event_id))
        .filter((ev): ev is NonNullable<typeof ev> => !!ev)
        .map((ev) => ({ title: ev.title, description: ev.description }));

      const propose = getCanonProposer();
      const startedAt = Date.now();
      const result = await propose({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        chapterTitle: chapterQ.data.title ?? undefined,
        chapterText: htmlToPlainText(chapterText),
        entityCards: cards,
        existingEvents,
        tier: settingsQ.data?.proposalsTier,
      });
      void logRun({
        ownerId: session.session.user.id,
        worldId,
        kind: 'propose_updates',
        parentKind: 'chapter',
        parentId: chapterId,
        provider: result.provider,
        model: result.model,
        status: 'success',
        durationMs: Date.now() - startedAt,
        inputSummary: { entityCount: cards.length, eventsProposed: result.events.length },
      });
      // Initialise per-event diff toggles (all accepted by default).
      const initDiffs: Record<number, boolean[]> = {};
      for (let i = 0; i < result.events.length; i++) {
        initDiffs[i] = result.events[i].entityDiffs.map(() => true);
      }
      setProposals(result.events);
      setDecisions({});
      setDiffAccepted(initDiffs);
      setPhase('review');
      // Mark "last analyzed" so the badge clears.
      void updateChapter.mutateAsync({ id: chapterId, lastAnalyzedAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  async function acceptEvent(idx: number) {
    if (session.status !== 'authed') return;
    if (!chapterQ.data) return;
    const proposal = proposals[idx];
    if (!proposal) return;
    const acceptedDiffs = diffAccepted[idx] ?? proposal.entityDiffs.map(() => true);
    setDecisions((d) => ({ ...d, [idx]: { status: 'pending' } }));
    try {
      // 1. Insert the event at end of world chrono.
      const allEventRanks = (eventsQ.data ?? []).map((ev) => ({ rank: ev.chronological_rank }));
      const eventChronoRank = nextRankAfter(allEventRanks);
      const event = await createEvent.mutateAsync({
        worldId,
        ownerId: session.session.user.id,
        title: proposal.title,
        chronologicalRank: eventChronoRank,
        description: proposal.description.trim() || null,
      });
      // 2. Link the event to this chapter (narrative_rank = end of current chain).
      const narrativeRank = nextRankAfter(
        (linkedEventsQ.data ?? []).map((ce) => ({ rank: ce.narrative_rank })),
      );
      await linkChapterEvent.mutateAsync({
        chapterId,
        eventId: event.id,
        worldId,
        ownerId: session.session.user.id,
        narrativeRank,
      });
      // 3. For each accepted entity diff: ensure init version exists, then
      //    create a delta version anchored at this event. The version's
      //    snapshot stores ONLY the fields the LLM proposed to change — older
      //    fields keep flowing through the timeline via per-field resolution.
      for (let i = 0; i < proposal.entityDiffs.length; i++) {
        if (!acceptedDiffs[i]) continue;
        const diff = proposal.entityDiffs[i];
        const entity = entitiesById.get(diff.entityId);
        if (!entity) continue;
        // Link this entity to the new event as a participant if not already.
        await linkEventEntity.mutateAsync({
          eventId: event.id,
          entityId: entity.id,
          worldId,
          ownerId: session.session.user.id,
          pinnedManually: false,
        });
        const { data: vs, error: vErr } = await supabase
          .from('entity_versions')
          .select('*')
          .eq('entity_id', entity.id);
        if (vErr) throw vErr;
        await ensureInitVersion({
          entityId: entity.id,
          worldId,
          ownerId: session.session.user.id,
          existingVersions: (vs ?? []) as EntityVersion[],
        });
        await createVersion.mutateAsync({
          entityId: entity.id,
          worldId,
          ownerId: session.session.user.id,
          validFromRank: eventChronoRank,
          snapshot: diff.fieldChanges,
          sourceEventId: event.id,
          noteExcerpt: diff.justification,
        });
        void qc.invalidateQueries({ queryKey: entityVersionsKeys.byEntity(entity.id) });
      }
      setDecisions((d) => ({ ...d, [idx]: { status: 'accepted' } }));
    } catch (err) {
      setDecisions((d) => ({
        ...d,
        [idx]: { status: 'failed', error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  function skipEvent(idx: number) {
    setDecisions((d) => ({ ...d, [idx]: { status: 'skipped' } }));
  }

  function toggleDiff(eventIdx: number, diffIdx: number) {
    setDiffAccepted((m) => {
      const cur = (m[eventIdx] ?? proposals[eventIdx]?.entityDiffs.map(() => true) ?? []).slice();
      cur[diffIdx] = !cur[diffIdx];
      return { ...m, [eventIdx]: cur };
    });
  }

  async function acceptAll() {
    for (let i = 0; i < proposals.length; i++) {
      if (decisions[i]?.status === 'accepted' || decisions[i]?.status === 'skipped') continue;
      await acceptEvent(i);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="propose-modal"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-md border border-border bg-bg-panel p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Propose canon from chapter</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-fg-muted hover:text-fg"
            data-testid="propose-close"
          >
            ✕
          </button>
        </header>
        <p className="text-xs text-fg-muted">
          Reads the chapter prose and proposes canonical events. Each event becomes a row on the
          timeline, gets linked to this chapter, and can carry entity updates that anchor on it.
          Linked entities in scope: {linkedEntities.length}.
        </p>

        {phase === 'idle' ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void runProposals()}
              className="self-end bg-accent px-3 py-1 text-sm font-medium text-accent-fg"
              data-testid="propose-run"
            >
              Run analysis
            </button>
          </div>
        ) : null}

        {phase === 'loading' ? (
          <div
            className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm"
            data-testid="propose-loading"
            aria-live="polite"
          >
            <Spinner /> Analyzing chapter… (this may take 5–30s)
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="space-y-2">
            <p className="text-sm text-red-400" data-testid="propose-error">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void runProposals()}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
            >
              Retry
            </button>
          </div>
        ) : null}

        {phase === 'review' ? (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-fg-muted">
                {proposals.length} event{proposals.length === 1 ? '' : 's'} proposed
              </span>
              {proposals.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void acceptAll()}
                  className="bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg"
                  data-testid="propose-accept-all"
                >
                  Accept all
                </button>
              ) : null}
            </div>
            <ul
              className="min-h-0 flex-1 space-y-2 overflow-y-auto"
              data-testid="proposals-list"
            >
              {proposals.length === 0 ? (
                <li className="text-sm text-fg-muted">
                  No new events proposed — the chapter doesn't change canon (or only re-tells events already linked).
                </li>
              ) : (
                proposals.map((p, idx) => (
                  <EventProposalCard
                    key={idx}
                    proposal={p}
                    decision={decisions[idx]}
                    diffAccepted={diffAccepted[idx] ?? p.entityDiffs.map(() => true)}
                    entitiesById={entitiesById}
                    onAccept={() => void acceptEvent(idx)}
                    onSkip={() => skipEvent(idx)}
                    onToggleDiff={(di) => toggleDiff(idx, di)}
                  />
                ))
              )}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface EventProposalCardProps {
  proposal: EventProposal;
  decision?: EventDecision;
  diffAccepted: boolean[];
  entitiesById: Map<string, Entity>;
  onAccept: () => void;
  onSkip: () => void;
  onToggleDiff: (diffIdx: number) => void;
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function EventProposalCard({
  proposal,
  decision,
  diffAccepted,
  entitiesById,
  onAccept,
  onSkip,
  onToggleDiff,
}: EventProposalCardProps) {
  const status = decision?.status ?? 'open';
  return (
    <li
      className="rounded-md border border-border bg-bg-subtle/40 px-3 py-2 text-sm"
      data-testid="event-proposal-card"
      data-status={status}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">📅 {proposal.title}</span>
        </div>
        {status === 'accepted' ? (
          <span className="text-xs text-emerald-400">accepted</span>
        ) : status === 'skipped' ? (
          <span className="text-xs text-fg-muted">skipped</span>
        ) : status === 'failed' ? (
          <span className="text-xs text-red-400">{decision?.error}</span>
        ) : null}
      </div>
      {proposal.description ? (
        <p className="mt-1 text-xs text-fg-muted">{proposal.description}</p>
      ) : null}
      {proposal.entityDiffs.length > 0 ? (
        <ul className="mt-2 space-y-1 border-l border-border pl-2 text-xs" data-testid="event-diff-list">
          {proposal.entityDiffs.map((d, di) => {
            const e = entitiesById.get(d.entityId);
            const accepted = diffAccepted[di] ?? true;
            return (
              <li key={di} className="flex items-start gap-1.5" data-testid="event-diff-row">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={() => onToggleDiff(di)}
                  disabled={status === 'accepted' || status === 'pending'}
                  className="mt-0.5 h-3 w-3"
                  data-testid="event-diff-toggle"
                />
                <div className="flex-1">
                  <span className="text-fg-muted">{e ? e.name : <span className="text-red-400">unknown entity</span>}</span>
                  {' '}
                  {Object.entries(d.fieldChanges).map(([k, v], i) => (
                    <span key={i} className="text-fg-muted">
                      {' · '}
                      <span className="text-fg">{k}</span>: → <span className="text-fg">{String(v)}</span>
                    </span>
                  ))}
                  <p className="text-fg-muted italic">{d.justification}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {status === 'open' || status === 'failed' ? (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="bg-bg-subtle px-2 py-0.5 text-xs hover:bg-bg"
            data-testid="event-proposal-skip"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg"
            data-testid="event-proposal-accept"
          >
            Accept event
          </button>
        </div>
      ) : status === 'pending' ? (
        <p className="mt-2 text-right text-xs text-fg-muted">applying…</p>
      ) : null}
    </li>
  );
}
