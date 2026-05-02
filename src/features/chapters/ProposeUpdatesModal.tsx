import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import { useChapter, useChaptersByWorld } from '@/lib/queries/chapters';
import { useEvents } from '@/lib/queries/events';
import { useWorld } from '@/lib/queries/worlds';
import { useUserSettings } from '@/lib/queries/userSettings';
import { useCreateEntityVersion, ensureInitVersion } from '@/lib/queries/entityVersions';
import { useQueryClient } from '@tanstack/react-query';
import { entityVersionsKeys } from '@/lib/queries/entityVersions';
import { supabase } from '@/lib/supabase';
import { logRun } from '@/lib/queries/runs';
import {
  buildRankPickerItems,
  rankAfterChapter,
  resolveStateAtRank,
  formatFieldValue,
} from '@/features/entities/versioning';
import { getProposer, type Proposal, type ProposalEntityCard } from '@/lib/llm/proposals';
import { htmlToPlainText } from '@/lib/html';
import type { Entity, EntityVersion, FieldDef, Snapshot } from '@/features/entities/types';

interface Props {
  open: boolean;
  onClose: () => void;
  worldId: string;
  chapterId: string;
  /** The current chapter text used as the source of analysis. */
  chapterText: string;
}

interface ProposalDecision {
  status: 'pending' | 'accepted' | 'skipped' | 'failed';
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
  const chaptersQ = useChaptersByWorld(worldId);
  const eventsQ = useEvents(worldId);
  const settingsQ = useUserSettings();
  const createVersion = useCreateEntityVersion();

  const timelineItems = useMemo(
    () => buildRankPickerItems(chaptersQ.data ?? [], eventsQ.data ?? []),
    [chaptersQ.data, eventsQ.data],
  );

  const [phase, setPhase] = useState<'idle' | 'loading' | 'review' | 'error'>('idle');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decisions, setDecisions] = useState<Record<number, ProposalDecision>>({});
  const [error, setError] = useState<string | null>(null);

  const linkedEntities = useMemo<Entity[]>(() => {
    const ids = new Set((participantsQ.data ?? []).map((p) => p.entity_id));
    return (entitiesQ.data ?? []).filter((e) => ids.has(e.id));
  }, [participantsQ.data, entitiesQ.data]);

  const typesById = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.id, t])),
    [typesQ.data],
  );

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setProposals([]);
      setDecisions({});
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
      // Fetch versions for each linked entity to resolve snapshot at the chapter rank.
      const cards: ProposalEntityCard[] = [];
      for (const e of linkedEntities) {
        const t = typesById.get(e.entity_type_id);
        const fields: FieldDef[] = t?.fields ?? [];
        const { data: versions, error: vErr } = await supabase
          .from('entity_versions')
          .select('*')
          .eq('entity_id', e.id)
          .order('valid_from_rank', { ascending: true });
        if (vErr) throw vErr;
        const snap = resolveStateAtRank(
          (versions ?? []) as EntityVersion[],
          chapterQ.data.chronological_rank,
        );
        const currentSnapshot: Record<string, string> = {};
        for (const f of fields) {
          currentSnapshot[f.name] = formatFieldValue(snap?.snapshot[f.name] ?? null);
        }
        cards.push({
          id: e.id,
          name: e.name,
          type: t?.name ?? 'Unknown',
          fields,
          currentSnapshot,
        });
      }
      const propose = getProposer();
      const startedAt = Date.now();
      const result = await propose({
        worldMemory: worldQ.data?.world_memory ?? worldQ.data?.description ?? undefined,
        worldCustomPrompt: worldQ.data?.custom_prompt ?? undefined,
        chapterTitle: chapterQ.data.title ?? undefined,
        chapterText: htmlToPlainText(chapterText),
        entityCards: cards,
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
        inputSummary: { entityCount: cards.length, count: result.proposals.length },
      });
      setProposals(result.proposals);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  async function acceptProposal(idx: number) {
    if (session.status !== 'authed') return;
    if (!chapterQ.data) return;
    const p = proposals[idx];
    setDecisions((d) => ({ ...d, [idx]: { status: 'pending' } }));
    try {
      // Read current snapshot at rank to merge with fieldChanges.
      const { data: versions, error: vErr } = await supabase
        .from('entity_versions')
        .select('*')
        .eq('entity_id', p.entityId)
        .order('valid_from_rank', { ascending: true });
      if (vErr) throw vErr;
      const all = (versions ?? []) as EntityVersion[];
      await ensureInitVersion({
        entityId: p.entityId,
        worldId,
        ownerId: session.session.user.id,
        existingVersions: all,
      });
      const current = resolveStateAtRank(all, chapterQ.data.chronological_rank);
      const merged: Snapshot = { ...(current?.snapshot ?? {}), ...p.fieldChanges };
      const newRank = rankAfterChapter(
        chapterQ.data.chronological_rank,
        timelineItems,
        all,
      );
      await createVersion.mutateAsync({
        entityId: p.entityId,
        worldId,
        ownerId: session.session.user.id,
        validFromRank: newRank,
        snapshot: merged,
        sourceChapterId: chapterId,
        noteExcerpt: p.justification,
      });
      void qc.invalidateQueries({ queryKey: entityVersionsKeys.byEntity(p.entityId) });
      setDecisions((d) => ({ ...d, [idx]: { status: 'accepted' } }));
    } catch (err) {
      setDecisions((d) => ({
        ...d,
        [idx]: { status: 'failed', error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  function skipProposal(idx: number) {
    setDecisions((d) => ({ ...d, [idx]: { status: 'skipped' } }));
  }

  async function acceptAll() {
    for (let i = 0; i < proposals.length; i++) {
      if (decisions[i]?.status === 'accepted' || decisions[i]?.status === 'skipped') continue;
      await acceptProposal(i);
    }
  }

  function skipAll() {
    setDecisions((d) => {
      const next = { ...d };
      for (let i = 0; i < proposals.length; i++) {
        if (next[i]?.status === 'accepted') continue;
        next[i] = { status: 'skipped' };
      }
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="propose-modal"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 rounded-md border border-border bg-bg-panel p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Propose entity updates</h2>
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
          Scans this chapter and proposes diffs on linked entities (
          {linkedEntities.length} in scope). Accepted proposals create a new entity_version at
          the chapter's chronological_rank.
        </p>

        {phase === 'idle' ? (
          <div className="flex flex-col gap-2">
            {linkedEntities.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No linked entities on this chapter — link some via the entities panel first.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void runProposals()}
              disabled={linkedEntities.length === 0}
              className="self-end bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
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
                {proposals.length} proposal{proposals.length === 1 ? '' : 's'}
              </span>
              {proposals.length > 0 ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void acceptAll()}
                    className="bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg"
                    data-testid="propose-accept-all"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={skipAll}
                    className="bg-bg-subtle px-2 py-0.5 text-xs hover:bg-bg"
                    data-testid="propose-skip-all"
                  >
                    Skip all
                  </button>
                </div>
              ) : null}
            </div>
            <ul
              className="min-h-0 flex-1 space-y-2 overflow-y-auto"
              data-testid="proposals-list"
            >
              {proposals.length === 0 ? (
                <li className="text-sm text-fg-muted">No proposals — nothing to update.</li>
              ) : (
                proposals.map((p, idx) => (
                  <ProposalCard
                    key={idx}
                    proposal={p}
                    entity={linkedEntities.find((e) => e.id === p.entityId)}
                    typeName={
                      typesById.get(
                        linkedEntities.find((e) => e.id === p.entityId)?.entity_type_id ?? '',
                      )?.name
                    }
                    decision={decisions[idx]}
                    worldId={worldId}
                    onAccept={() => void acceptProposal(idx)}
                    onSkip={() => skipProposal(idx)}
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

interface ProposalCardProps {
  proposal: Proposal;
  entity?: Entity;
  typeName?: string;
  decision?: ProposalDecision;
  worldId: string;
  onAccept: () => void;
  onSkip: () => void;
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

function ProposalCard({
  proposal,
  entity,
  typeName,
  decision,
  worldId,
  onAccept,
  onSkip,
}: ProposalCardProps) {
  const status = decision?.status ?? null;
  return (
    <li
      className="rounded-md border border-border bg-bg-subtle/40 px-3 py-2 text-sm"
      data-testid="proposal-card"
      data-status={status ?? 'open'}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          {entity ? (
            <Link
              to="/worlds/$worldId/entities/$entityId"
              params={{ worldId, entityId: entity.id }}
              className="font-medium hover:underline"
              data-testid="proposal-entity-link"
            >
              {entity.name}
            </Link>
          ) : (
            <span className="font-medium text-red-400">unknown entity</span>
          )}
          {typeName ? (
            <span className="ml-1 text-xs text-fg-muted">({typeName})</span>
          ) : null}
        </div>
        {status === 'accepted' ? (
          <span className="text-xs text-emerald-400">accepted</span>
        ) : status === 'skipped' ? (
          <span className="text-xs text-fg-muted">skipped</span>
        ) : status === 'pending' ? (
          <span className="text-xs text-fg-muted">applying…</span>
        ) : status === 'failed' ? (
          <span className="text-xs text-red-400">{decision?.error}</span>
        ) : null}
      </div>
      <ul className="mt-1 space-y-0.5 text-xs">
        {Object.entries(proposal.fieldChanges).map(([k, v]) => (
          <li key={k} className="text-fg-muted" data-testid="proposal-change">
            <span className="text-fg">{k}</span>: → <span className="text-fg">{String(v)}</span>
          </li>
        ))}
      </ul>
      {proposal.justification ? (
        <p className="mt-1 text-xs italic text-fg-muted">{proposal.justification}</p>
      ) : null}
      {status === null || status === 'failed' ? (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="bg-bg-subtle px-2 py-0.5 text-xs hover:bg-bg"
            data-testid="proposal-skip"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg"
            data-testid="proposal-accept"
          >
            Accept
          </button>
        </div>
      ) : null}
    </li>
  );
}
