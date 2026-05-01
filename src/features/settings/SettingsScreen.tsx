import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useUpdateWorld, useWorld } from '@/lib/queries/worlds';
import { useUpdateUserSettings, useUserSettings } from '@/lib/queries/userSettings';
import type { ModelTier } from '@/lib/llm';

const DEFAULT_DEBOUNCE = 5000;
const TIERS: { value: ModelTier; label: string }[] = [
  { value: 'cheapest', label: 'Fast (cheapest)' },
  { value: 'medium', label: 'Balanced (medium)' },
  { value: 'best', label: 'Best (slowest, most expensive)' },
];

export function SettingsScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/settings' });
  const worldQ = useWorld(worldId);
  const updateWorld = useUpdateWorld();
  const settingsQ = useUserSettings();
  const updateSettings = useUpdateUserSettings();

  const [debounce, setDebounce] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<'global' | 'world' | 'tiers' | null>(null);

  useEffect(() => {
    const v = settingsQ.data?.prefs.autoExtractDebounceMs ?? DEFAULT_DEBOUNCE;
    setDebounce(String(v));
  }, [settingsQ.data?.prefs.autoExtractDebounceMs]);

  useEffect(() => {
    if (customPrompt === null && worldQ.data) {
      setCustomPrompt(worldQ.data.custom_prompt ?? '');
    }
  }, [customPrompt, worldQ.data]);

  function showSaved(which: 'global' | 'world' | 'tiers') {
    setSavedFlash(which);
    setTimeout(() => setSavedFlash((s) => (s === which ? null : s)), 1500);
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
    field: 'upscaleTier' | 'proposalsTier' | 'extractTier',
    value: ModelTier,
  ) {
    await updateSettings.mutateAsync({ [field]: value });
    showSaved('tiers');
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        </div>
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
