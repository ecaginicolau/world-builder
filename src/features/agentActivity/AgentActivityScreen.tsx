import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
  useAgentActionsPage,
  useAgentSessions,
  type AgentActionFilter,
  type AgentActionRangeKey,
  type AgentActionRow,
  type TargetKind,
} from '@/lib/queries/agentActions';

const PAGE_SIZE = 50;

const TARGET_KINDS: (Exclude<TargetKind, null> | 'all')[] = [
  'all',
  'note',
  'entity',
  'event',
  'chapter',
  'book',
  'part',
  'link',
];

const RANGES: { key: AgentActionRangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

function shortSession(id: string): string {
  return id.slice(0, 8);
}

function summarizePayload(row: AgentActionRow): string {
  const p = row.payload ?? {};
  const parts: string[] = [];
  for (const k of ['title', 'name', 'entity_name', 'first_event_title', 'field']) {
    const v = (p as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) {
      parts.push(`${k}=${v.length > 40 ? v.slice(0, 40) + '…' : v}`);
      break;
    }
  }
  if (parts.length === 0 && Object.keys(p).length > 0) {
    return Object.keys(p).slice(0, 3).join(', ');
  }
  return parts.join(' · ');
}

export function AgentActivityScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/agent-activity' });
  const [session, setSession] = useState<string | 'all'>('all');
  const [targetKind, setTargetKind] = useState<
    Exclude<TargetKind, null> | 'all'
  >('all');
  const [range, setRange] = useState<AgentActionRangeKey>('30d');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter = useMemo<AgentActionFilter>(
    () => ({ session, targetKind, range }),
    [session, targetKind, range],
  );
  const sessionsQ = useAgentSessions(worldId);
  const actionsQ = useAgentActionsPage(worldId, filter, page, PAGE_SIZE);

  const totalCount = actionsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function changeFilter<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setPage(0);
  }

  return (
    <main className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-6 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent activity</h1>
          <p className="text-sm text-fg-muted">
            All writes performed by MCP agents in this world. Reads are not logged.
          </p>
        </div>
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-from-agent-activity"
        >
          ← World
        </Link>
      </header>

      <section className="flex flex-wrap items-center gap-3 rounded border border-border bg-bg-subtle/30 p-3 text-xs">
        <label className="flex items-center gap-1">
          <span className="text-fg-muted">Session</span>
          <select
            value={session}
            onChange={(e) => changeFilter(setSession, e.target.value)}
            className="bg-bg-subtle px-2 py-0.5"
            data-testid="agent-activity-filter-session"
          >
            <option value="all">all</option>
            {(sessionsQ.data ?? []).map((s) => (
              <option key={s.agent_session_id} value={s.agent_session_id}>
                {shortSession(s.agent_session_id)} ({s.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="text-fg-muted">Target</span>
          <select
            value={targetKind}
            onChange={(e) =>
              changeFilter(
                setTargetKind,
                e.target.value as Exclude<TargetKind, null> | 'all',
              )
            }
            className="bg-bg-subtle px-2 py-0.5"
            data-testid="agent-activity-filter-target"
          >
            {TARGET_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <span className="text-fg-muted">Range</span>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => changeFilter(setRange, r.key)}
                className={
                  'px-2 py-0.5 ' +
                  (range === r.key
                    ? 'bg-accent text-accent-fg'
                    : 'bg-bg-subtle hover:bg-bg-panel')
                }
                data-testid={`agent-activity-range-${r.key}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto text-fg-muted" data-testid="agent-activity-totals">
          {actionsQ.isLoading
            ? 'Loading…'
            : `${totalCount} matching`}
        </div>
      </section>

      {actionsQ.error ? (
        <p className="text-sm text-red-400">{actionsQ.error.message}</p>
      ) : null}

      <div className="overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-bg-subtle text-fg-muted">
            <tr>
              <th className="px-2 py-1 text-left">When</th>
              <th className="px-2 py-1 text-left">Session</th>
              <th className="px-2 py-1 text-left">Action</th>
              <th className="px-2 py-1 text-left">Target</th>
              <th className="px-2 py-1 text-left">Summary</th>
            </tr>
          </thead>
          <tbody>
            {(actionsQ.data?.rows ?? []).map((r) => (
              <ActionRow
                key={r.id}
                row={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              />
            ))}
            {!actionsQ.isLoading && (actionsQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-3 text-center italic text-fg-muted"
                >
                  No agent activity yet. Run an MCP-driven write to populate.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-muted" data-testid="agent-activity-page-indicator">
          Page {page + 1} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-50"
            data-testid="agent-activity-prev"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-50"
            data-testid="agent-activity-next"
          >
            Next →
          </button>
        </div>
      </div>
    </main>
  );
}

function ActionRow({
  row,
  expanded,
  onToggle,
}: {
  row: AgentActionRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-border hover:bg-bg-subtle/50"
        onClick={onToggle}
        data-testid="agent-activity-row"
      >
        <td className="px-2 py-1">{new Date(row.created_at).toLocaleString()}</td>
        <td className="px-2 py-1 font-mono">{shortSession(row.agent_session_id)}</td>
        <td className="px-2 py-1 font-mono">{row.action_kind}</td>
        <td className="px-2 py-1">{row.target_kind ?? '—'}</td>
        <td className="px-2 py-1 text-fg-muted">{summarizePayload(row)}</td>
      </tr>
      {expanded ? (
        <tr
          className="border-t border-border bg-bg-subtle/50"
          data-testid="agent-activity-row-expanded"
        >
          <td colSpan={5} className="px-3 py-2">
            <div className="mb-2 text-[10px] text-fg-muted">
              session: <span className="font-mono">{row.agent_session_id}</span>
              {row.target_id ? (
                <>
                  {' · '}target: <span className="font-mono">{row.target_id}</span>
                </>
              ) : null}
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-[10px] text-fg-muted">
              {JSON.stringify(row.payload ?? {}, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}
