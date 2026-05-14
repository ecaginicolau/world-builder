import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useRunsPage, type RunStatus, type RunKind, type RangeKey, type RunRow } from '@/lib/queries/runs';

const PAGE_SIZE = 50;
const KINDS: (RunKind | 'all')[] = ['all', 'chat', 'auto_extract', 'upscale', 'propose_updates', 'summarize', 'back_cover'];
const STATUSES: (RunStatus | 'all')[] = ['all', 'success', 'error', 'cancelled'];
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
];

export function RunsScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/runs' });
  const [kind, setKind] = useState<RunKind | 'all'>('all');
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter = useMemo(() => ({ kind, status, range }), [kind, status, range]);
  const runsQ = useRunsPage(worldId, filter, page, PAGE_SIZE);

  const totals = useMemo(() => computeTotals(runsQ.data?.rows ?? []), [runsQ.data?.rows]);
  const totalCount = runsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function changeFilter<T>(setter: (v: T) => void, v: T) {
    setter(v);
    setPage(0);
  }

  return (
    <main className="mx-auto flex h-full max-w-5xl flex-col gap-4 overflow-y-auto px-6 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
          <p className="text-sm text-fg-muted">All LLM calls in this world.</p>
        </div>
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-from-runs"
        >
          ← World
        </Link>
      </header>

      <section className="flex flex-wrap items-center gap-3 rounded border border-border bg-bg-subtle/30 p-3 text-xs">
        <FilterSelect label="Kind" value={kind} onChange={(v) => changeFilter(setKind, v)} options={KINDS} testid="runs-filter-kind" />
        <FilterSelect label="Status" value={status} onChange={(v) => changeFilter(setStatus, v)} options={STATUSES} testid="runs-filter-status" />
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
                  (range === r.key ? 'bg-accent text-accent-fg' : 'bg-bg-subtle hover:bg-bg-panel')
                }
                data-testid={`runs-range-${r.key}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-fg-muted" data-testid="runs-totals">
          {runsQ.isLoading ? 'Loading…' : (
            <>
              page total: {totals.count} · tokens (in/out): {totals.prompt}/{totals.completion}
              {' · '}{totalCount} matching across all pages
            </>
          )}
        </div>
      </section>

      {runsQ.error ? (
        <p className="text-sm text-red-400">{runsQ.error.message}</p>
      ) : null}

      <div className="overflow-auto rounded border border-border">
        <table className="w-full text-xs">
          <thead className="bg-bg-subtle text-fg-muted">
            <tr>
              <th className="px-2 py-1 text-left">When</th>
              <th className="px-2 py-1 text-left">Kind</th>
              <th className="px-2 py-1 text-left">Model</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-right">Duration</th>
              <th className="px-2 py-1 text-right">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {(runsQ.data?.rows ?? []).map((r) => (
              <RunRowDisplay
                key={r.id}
                row={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
              />
            ))}
            {!runsQ.isLoading && (runsQ.data?.rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center italic text-fg-muted">
                  No runs match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-muted" data-testid="runs-page-indicator">
          Page {page + 1} / {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-50"
            data-testid="runs-prev"
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-50"
            data-testid="runs-next"
          >
            Next →
          </button>
        </div>
      </div>
    </main>
  );
}

function computeTotals(rows: RunRow[]): { count: number; prompt: number; completion: number } {
  let p = 0, c = 0;
  for (const r of rows) {
    p += r.usage?.prompt_tokens ?? 0;
    c += r.usage?.completion_tokens ?? 0;
  }
  return { count: rows.length, prompt: p, completion: c };
}

function RunRowDisplay({
  row, expanded, onToggle,
}: { row: RunRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="cursor-pointer border-t border-border hover:bg-bg-subtle/50"
        onClick={onToggle}
        data-testid="runs-row"
      >
        <td className="px-2 py-1">{new Date(row.created_at).toLocaleString()}</td>
        <td className="px-2 py-1 font-mono">{row.kind}</td>
        <td className="px-2 py-1">{row.model}</td>
        <td className={
          'px-2 py-1 ' +
          (row.status === 'success' ? 'text-emerald-300' : row.status === 'error' ? 'text-red-300' : 'text-fg-muted')
        }>
          {row.status}
        </td>
        <td className="px-2 py-1 text-right">{row.duration_ms ? `${row.duration_ms}ms` : '—'}</td>
        <td className="px-2 py-1 text-right">
          {row.usage ? `${row.usage.prompt_tokens ?? 0}/${row.usage.completion_tokens ?? 0}` : '—'}
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-border bg-bg-subtle/50" data-testid="runs-row-expanded">
          <td colSpan={6} className="px-3 py-2">
            {row.error_message ? (
              <div className="mb-2">
                <span className="font-mono text-red-300">{row.error_message}</span>
              </div>
            ) : null}
            <pre className="overflow-x-auto whitespace-pre-wrap text-[10px] text-fg-muted">
              {JSON.stringify(row.input_summary ?? {}, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FilterSelect<T extends string>({
  label, value, onChange, options, testid,
}: { label: string; value: T; onChange: (v: T) => void; options: T[]; testid: string }) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-bg-subtle px-2 py-0.5"
        data-testid={testid}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
