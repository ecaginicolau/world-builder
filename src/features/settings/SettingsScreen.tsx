import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useUpdateWorld, useWorld } from '@/lib/queries/worlds';
import { useUpdateUserSettings, useUserSettings } from '@/lib/queries/userSettings';
import type { ModelTier } from '@/lib/llm';
import type { ContextLevel } from '@/features/worlds/types';
import { DEFAULT_PCC } from '@/features/worlds/types';

const DEFAULT_DEBOUNCE = 5000;
const DEFAULT_LOCAL_ENDPOINT = 'http://localhost:11434/v1';
const TIERS: { value: ModelTier; label: string }[] = [
  { value: 'cheapest', label: 'Fast (cheapest)' },
  { value: 'medium', label: 'Balanced (medium)' },
  { value: 'best', label: 'Best (slowest, most expensive)' },
];

type LocalModelField =
  | 'extractLocalModel'
  | 'proposalsLocalModel'
  | 'upscaleLocalModel'
  | 'summariesLocalModel';

const LOCAL_MODEL_FIELDS: { field: LocalModelField; label: string; testid: string }[] = [
  { field: 'extractLocalModel', label: 'Auto-extract', testid: 'local-model-extract' },
  { field: 'proposalsLocalModel', label: 'Proposals', testid: 'local-model-proposals' },
  { field: 'upscaleLocalModel', label: 'Upscale', testid: 'local-model-upscale' },
  { field: 'summariesLocalModel', label: 'Summaries', testid: 'local-model-summaries' },
];

export function SettingsScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/settings' });
  const worldQ = useWorld(worldId);
  const updateWorld = useUpdateWorld();
  const settingsQ = useUserSettings();
  const updateSettings = useUpdateUserSettings();

  const [debounce, setDebounce] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<
    'global' | 'world' | 'tiers' | 'pcc' | 'local-llm' | null
  >(null);
  const [endpointDraft, setEndpointDraft] = useState<string | null>(null);
  const [modelDrafts, setModelDrafts] = useState<Record<LocalModelField, string | null>>({
    extractLocalModel: null,
    proposalsLocalModel: null,
    upscaleLocalModel: null,
    summariesLocalModel: null,
  });

  useEffect(() => {
    const v = settingsQ.data?.prefs.autoExtractDebounceMs ?? DEFAULT_DEBOUNCE;
    setDebounce(String(v));
  }, [settingsQ.data?.prefs.autoExtractDebounceMs]);

  useEffect(() => {
    if (customPrompt === null && worldQ.data) {
      setCustomPrompt(worldQ.data.custom_prompt ?? '');
    }
  }, [customPrompt, worldQ.data]);

  function showSaved(which: 'global' | 'world' | 'tiers' | 'pcc' | 'local-llm') {
    setSavedFlash(which);
    setTimeout(() => setSavedFlash((s) => (s === which ? null : s)), 1500);
  }

  async function onPccChange(next: ContextLevel[]) {
    await updateWorld.mutateAsync({ id: worldId, previousChapterContext: next });
    showSaved('pcc');
  }

  async function onSaveDebounce(e: FormEvent) {
    e.preventDefault();
    const ms = Number(debounce);
    if (!Number.isFinite(ms) || ms < 500 || ms > 30000) return;
    await updateSettings.mutateAsync({ prefsPatch: { autoExtractDebounceMs: ms } });
    showSaved('global');
  }

  async function onSaveCustomPrompt(e: FormEvent) {
    e.preventDefault();
    if (customPrompt === null) return;
    await updateWorld.mutateAsync({
      id: worldId,
      custom_prompt: customPrompt.trim() || null,
    });
    showSaved('world');
  }

  async function onTierChange(
    field: 'upscaleTier' | 'proposalsTier' | 'extractTier' | 'summarizeTier',
    value: ModelTier,
  ) {
    await updateSettings.mutateAsync({ [field]: value });
    showSaved('tiers');
  }

  async function onToggleLocalLlm(enabled: boolean) {
    await updateSettings.mutateAsync({ localLlmEnabled: enabled });
    showSaved('local-llm');
  }

  async function commitEndpoint(value: string) {
    const trimmed = value.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if ((settingsQ.data?.localLlmEndpoint ?? null) === next) return;
    await updateSettings.mutateAsync({ localLlmEndpoint: next });
    showSaved('local-llm');
  }

  async function commitLocalModel(field: LocalModelField, value: string) {
    const trimmed = value.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if ((settingsQ.data?.[field] ?? null) === next) return;
    await updateSettings.mutateAsync({ [field]: next });
    showSaved('local-llm');
  }

  return (
    <main className="mx-auto flex h-full max-w-2xl flex-col gap-8 overflow-y-auto px-6 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-fg-muted">
          {worldQ.data ? worldQ.data.name : 'Loading…'} · per-user and per-world preferences
        </p>
      </header>

      <section className="space-y-3" data-testid="settings-tiers">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            LLM tiers per task
          </h2>
          {savedFlash === 'tiers' ? (
            <span className="text-xs text-emerald-400" data-testid="tiers-saved">
              Saved
            </span>
          ) : null}
        </div>
        <p className="text-xs text-fg-muted">
          Pick the model size for each automated task. Saved as you change.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TierField
            label="Upscale"
            value={settingsQ.data?.upscaleTier ?? 'best'}
            onChange={(v) => onTierChange('upscaleTier', v)}
            testid="tier-upscale"
          />
          <TierField
            label="Proposals"
            value={settingsQ.data?.proposalsTier ?? 'medium'}
            onChange={(v) => onTierChange('proposalsTier', v)}
            testid="tier-proposals"
          />
          <TierField
            label="Auto-extract"
            value={settingsQ.data?.extractTier ?? 'cheapest'}
            onChange={(v) => onTierChange('extractTier', v)}
            testid="tier-extract"
          />
          <TierField
            label="Summarize"
            value={settingsQ.data?.summarizeTier ?? 'cheapest'}
            onChange={(v) => onTierChange('summarizeTier', v)}
            testid="tier-summarize"
          />
        </div>
      </section>

      <section className="space-y-3" data-testid="settings-local-llm">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Local LLM
          </h2>
          {savedFlash === 'local-llm' ? (
            <span className="text-xs text-emerald-400" data-testid="local-llm-saved">
              Saved
            </span>
          ) : null}
        </div>
        <p className="text-xs text-fg-muted">
          Route the four LLM tasks (auto-extract, proposals, upscale, summaries) to a local
          OpenAI-compatible endpoint (Ollama, LM Studio, llama.cpp <code>--api</code>) instead
          of the cloud. When the toggle is off, the per-task models below are kept but unused;
          everything falls back to the LLM tiers above. Tasks with an empty model also fall
          back even when the toggle is on.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settingsQ.data?.localLlmEnabled ?? false}
            onChange={(e) => onToggleLocalLlm(e.target.checked)}
            data-testid="local-llm-enabled"
          />
          <span className="text-sm">Enable local LLM</span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-fg-muted">Endpoint URL (OpenAI-compatible)</span>
          <input
            type="text"
            value={endpointDraft ?? settingsQ.data?.localLlmEndpoint ?? ''}
            onChange={(e) => setEndpointDraft(e.target.value)}
            onBlur={() => {
              const v = endpointDraft;
              if (v !== null) {
                void commitEndpoint(v);
                setEndpointDraft(null);
              }
            }}
            placeholder={DEFAULT_LOCAL_ENDPOINT}
            spellCheck={false}
            className="w-full px-3 py-2 font-mono text-sm"
            data-testid="local-llm-endpoint"
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOCAL_MODEL_FIELDS.map(({ field, label, testid }) => (
            <label key={field} className="block space-y-1">
              <span className="text-xs text-fg-muted">{label}</span>
              <input
                type="text"
                value={modelDrafts[field] ?? settingsQ.data?.[field] ?? ''}
                onChange={(e) =>
                  setModelDrafts((m) => ({ ...m, [field]: e.target.value }))
                }
                onBlur={() => {
                  const v = modelDrafts[field];
                  if (v !== null) {
                    void commitLocalModel(field, v);
                    setModelDrafts((m) => ({ ...m, [field]: null }));
                  }
                }}
                placeholder="qwen2.5:14b"
                spellCheck={false}
                className="w-full bg-bg-subtle px-2 py-1 font-mono text-sm"
                data-testid={testid}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Setup hint: install Ollama, run{' '}
          <code className="font-mono">OLLAMA_ORIGINS=* ollama serve</code> (CORS for browser
          calls), then <code className="font-mono">ollama pull qwen2.5:14b</code>. See{' '}
          <span className="font-mono">docs/demo/local-llm-setup.md</span> for the full
          walkthrough.
        </p>
      </section>

      <section className="space-y-3" data-testid="settings-pcc">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Previous-chapter context (PCC)
          </h2>
          {savedFlash === 'pcc' ? (
            <span className="text-xs text-emerald-400" data-testid="pcc-saved">
              Saved
            </span>
          ) : null}
        </div>
        <p className="text-xs text-fg-muted">
          When upscaling a chapter or chatting in a chapter, you can include the previous
          chapters in the prompt. The list below configures how — left to right = most recent
          to oldest. Each slot is one chapter at a given level: <code>raw</code> (full text)
          or <code>S/M/L</code> summary. Defaults to <code>raw → L → M → S → S → S</code>.
        </p>
        <PccEditor
          value={worldQ.data?.previous_chapter_context ?? DEFAULT_PCC}
          onChange={onPccChange}
          disabled={updateWorld.isPending || !worldQ.data}
        />
      </section>

      <section className="space-y-3" data-testid="settings-global">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Global</h2>
        <form onSubmit={onSaveDebounce} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm">Auto-extract debounce (ms)</span>
            <p className="text-xs text-fg-muted">
              How long to wait after you stop typing before scanning the note for entities.
              Min 500, max 30000. Default 5000.
            </p>
            <input
              type="number"
              min={500}
              max={30000}
              step={500}
              value={debounce}
              onChange={(e) => setDebounce(e.target.value)}
              className="w-32 px-3 py-2 text-sm"
              data-testid="setting-debounce"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={updateSettings.isPending}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="save-global"
            >
              {updateSettings.isPending ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'global' ? (
              <span className="text-xs text-emerald-400" data-testid="global-saved">
                Saved
              </span>
            ) : null}
            {updateSettings.error ? (
              <span className="text-xs text-red-400">{updateSettings.error.message}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="space-y-3" data-testid="settings-world">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Per-world (active: {worldQ.data?.name ?? '…'})
        </h2>
        <form onSubmit={onSaveCustomPrompt} className="space-y-2">
          <label className="block space-y-1">
            <span className="text-sm">Custom prompt addition</span>
            <p className="text-xs text-fg-muted">
              Appended to the system prompt of every chat in this world. Use it for tone, style
              instructions, or anything that shapes <em>how</em> the LLM responds (vs World Memory
              which lists the <em>facts</em>).
            </p>
            <textarea
              value={customPrompt ?? ''}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={6}
              placeholder="e.g. Always answer in French. Be terse, no preamble. When suggesting names, prefer two syllables."
              className="w-full px-3 py-2 text-sm"
              data-testid="setting-custom-prompt"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={updateWorld.isPending}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="save-world"
            >
              {updateWorld.isPending ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'world' ? (
              <span className="text-xs text-emerald-400" data-testid="world-saved">
                Saved
              </span>
            ) : null}
            {updateWorld.error ? (
              <span className="text-xs text-red-400">{updateWorld.error.message}</span>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}

function TierField({
  label,
  value,
  onChange,
  testid,
}: {
  label: string;
  value: ModelTier;
  onChange: (v: ModelTier) => void;
  testid: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ModelTier)}
        className="w-full bg-bg-subtle px-2 py-1 text-sm"
        data-testid={testid}
      >
        {TIERS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const PCC_LEVELS: ContextLevel[] = ['raw', 'L', 'M', 'S'];

function levelStyle(level: ContextLevel): string {
  switch (level) {
    case 'raw': return 'bg-purple-500/20 border-purple-500/40 text-purple-200';
    case 'L':   return 'bg-blue-500/20 border-blue-500/40 text-blue-200';
    case 'M':   return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
    case 'S':   return 'bg-amber-500/20 border-amber-500/40 text-amber-200';
  }
}

function PccEditor({
  value,
  onChange,
  disabled,
}: {
  value: ContextLevel[];
  onChange: (next: ContextLevel[]) => void;
  disabled: boolean;
}) {
  function append(level: ContextLevel) {
    onChange([...value, level]);
  }
  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...value];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange(next);
  }
  function reset() {
    onChange(DEFAULT_PCC);
  }
  return (
    <div className="space-y-3" data-testid="pcc-editor">
      <div className="flex flex-wrap items-center gap-2 rounded border border-fg-subtle/30 bg-bg-subtle/40 p-3">
        {value.length === 0 ? (
          <span className="text-xs italic text-fg-muted">
            Empty — no previous chapters will be included
          </span>
        ) : (
          value.map((level, idx) => (
            <div
              key={`${idx}-${level}`}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-mono ${levelStyle(level)}`}
              data-testid={`pcc-chip-${idx}`}
            >
              <span className="opacity-50">#{idx + 1}</span>
              <span className="font-bold">{level}</span>
              <button
                type="button"
                disabled={disabled || idx === 0}
                onClick={() => move(idx, -1)}
                className="ml-1 text-fg-muted hover:text-fg disabled:opacity-30"
                aria-label="Move left"
                data-testid={`pcc-chip-${idx}-up`}
              >
                ←
              </button>
              <button
                type="button"
                disabled={disabled || idx === value.length - 1}
                onClick={() => move(idx, 1)}
                className="text-fg-muted hover:text-fg disabled:opacity-30"
                aria-label="Move right"
                data-testid={`pcc-chip-${idx}-down`}
              >
                →
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(idx)}
                className="ml-1 text-fg-muted hover:text-red-400"
                aria-label="Remove"
                data-testid={`pcc-chip-${idx}-remove`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-fg-muted">Add slot:</span>
        {PCC_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => append(level)}
            className={`rounded border px-2 py-0.5 text-xs font-mono hover:opacity-80 disabled:opacity-50 ${levelStyle(level)}`}
            data-testid={`pcc-add-${level}`}
          >
            + {level}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={reset}
          className="ml-auto rounded border border-fg-subtle/30 px-2 py-0.5 text-xs hover:bg-bg-subtle disabled:opacity-50"
          data-testid="pcc-reset"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
