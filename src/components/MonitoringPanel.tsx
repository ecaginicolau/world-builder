import { useMemo, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useRecentRuns, type RunRow } from '@/lib/queries/runs';
import { useMonitoringToggle } from './useMonitoringToggle';

const WORLD_ID_RE = /^\/worlds\/([0-9a-f-]{36})(?:\/|$)/i;

function statusColor(s: RunRow['status']): string {
  if (s === 'success') return 'text-emerald-400';
  if (s === 'error') return 'text-red-400';
  return 'text-fg-muted';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function MonitoringPanel() {
  const { open, setOpen } = useMonitoringToggle();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const worldId = useMemo(() => {
    const m = pathname.match(WORLD_ID_RE);
    return m ? m[1] : null;
  }, [pathname]);
  const runsQ = useRecentRuns(worldId, 20, open);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="border-t border-border bg-bg-panel"
      style={{ height: 240 }}
      data-testid="monitoring-panel"
    >
      <header className="flex h-8 items-center justify-between border-b border-border bg-bg-subtle pl-2 text-xs">
        <span>
          📊 Monitoring · last 20 runs
          {worldId ? '' : ' (pick a world to see runs)'}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-8 w-10 items-center justify-center text-base text-fg-muted hover:bg-bg-panel hover:text-fg"
          aria-label="Close monitoring panel"
          title="Close monitoring panel"
          data-testid="monitoring-close"
        >
          ×
        </button>
      </header>

      <div className="h-[calc(100%-2rem)] overflow-y-auto">
        {runsQ.isLoading ? (
          <p className="p-2 text-xs text-fg-muted">Loading…</p>
        ) : runsQ.error ? (
          <p className="p-2 text-xs text-red-400">{runsQ.error.message}</p>
        ) : !runsQ.data || runsQ.data.length === 0 ? (
          <p className="p-2 text-xs text-fg-muted">No runs yet for this world.</p>
        ) : (
          <table className="w-full table-fixed text-xs">
            <thead className="sticky top-0 bg-bg-panel text-fg-muted">
              <tr>
                <th className="w-24 px-2 py-1 text-left font-normal">time</th>
                <th className="w-24 px-2 py-1 text-left font-normal">kind</th>
                <th className="px-2 py-1 text-left font-normal">model</th>
                <th className="w-20 px-2 py-1 text-left font-normal">status</th>
                <th className="w-16 px-2 py-1 text-right font-normal">dur ms</th>
                <th className="w-24 px-2 py-1 text-right font-normal">tokens</th>
              </tr>
            </thead>
            <tbody>
              {runsQ.data.map((r) => {
                const expanded = expandedId === r.id;
                const tokens =
                  (r.usage?.prompt_tokens ?? 0) + (r.usage?.completion_tokens ?? 0);
                return (
                  <RunRowItem
                    key={r.id}
                    run={r}
                    tokens={tokens}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : r.id)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface RunRowItemProps {
  run: RunRow;
  tokens: number;
  expanded: boolean;
  onToggle: () => void;
}

function RunRowItem({ run, tokens, expanded, onToggle }: RunRowItemProps) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-border hover:bg-bg-subtle"
        onClick={onToggle}
        data-testid="run-row"
      >
        <td className="px-2 py-1">{formatTime(run.created_at)}</td>
        <td className="px-2 py-1">{run.kind}</td>
        <td className="px-2 py-1 truncate">{run.model}</td>
        <td className={'px-2 py-1 ' + statusColor(run.status)}>{run.status}</td>
        <td className="px-2 py-1 text-right">{run.duration_ms ?? '—'}</td>
        <td className="px-2 py-1 text-right">{tokens || '—'}</td>
      </tr>
      {expanded ? (
        <tr className="border-t border-border bg-bg-subtle/50">
          <td colSpan={6} className="px-2 py-2">
            {run.error_message ? (
              <div className="mb-2 text-xs text-red-400">
                <div className="text-fg-muted">error_message</div>
                <pre className="whitespace-pre-wrap break-words">{run.error_message}</pre>
              </div>
            ) : null}
            {run.input_summary ? (
              <div className="text-xs">
                <div className="text-fg-muted">input_summary</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
                  {JSON.stringify(run.input_summary, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="text-xs text-fg-muted">(no input_summary)</div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
