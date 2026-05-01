import { useState, type FormEvent } from 'react';
import type { ChapterVersion } from './types';

interface Props {
  versions: ChapterVersion[];
  selectedId: string | null;
  finalId: string | null;
  onSelect: (id: string) => void;
  onSetFinal: (id: string) => void;
  onUpscale: (userPrompt: string, includePcc: boolean) => Promise<void>;
  upscalePending: boolean;
  upscaleError?: string | null;
  /** True when the editor has unsaved manual edits — Save button shown at top. */
  dirty: boolean;
  onSaveManualEdit: () => Promise<void>;
  saveManualPending: boolean;
  /** Number of slots in world.previous_chapter_context (0 = feature disabled). */
  pccSlotCount: number;
  /** Disable everything write-side (used when chapter is published). */
  readOnly?: boolean;
}

export function VersionsPanel({
  versions,
  selectedId,
  finalId,
  onSelect,
  onSetFinal,
  onUpscale,
  upscalePending,
  upscaleError,
  dirty,
  onSaveManualEdit,
  saveManualPending,
  pccSlotCount,
  readOnly = false,
}: Props) {
  const [prompt, setPrompt] = useState('');
  const [includePcc, setIncludePcc] = useState(true);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || upscalePending || readOnly) return;
    await onUpscale(prompt.trim(), includePcc && pccSlotCount > 0);
    setPrompt('');
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col rounded-md border border-border bg-bg-panel">
      <header className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Versions ({versions.length})
      </header>

      {dirty && !readOnly ? (
        <div className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs">
          <div className="mb-1 text-amber-200">Unsaved manual edits in the editor.</div>
          <button
            type="button"
            onClick={() => void onSaveManualEdit()}
            disabled={saveManualPending}
            className="bg-accent px-2 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
            data-testid="save-manual-edit"
          >
            {saveManualPending ? 'Saving…' : 'Save as new version'}
          </button>
        </div>
      ) : null}

      <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="versions-list">
        {versions.map((v, idx) => {
          const isSelected = v.id === selectedId;
          const isFinal = v.id === finalId;
          return (
            <li
              key={v.id}
              className={
                'flex items-start gap-2 border-b border-border px-3 py-2 text-sm cursor-pointer ' +
                (isSelected ? 'bg-bg-subtle' : 'hover:bg-bg-subtle/50')
              }
              onClick={() => onSelect(v.id)}
              data-testid="version-row"
              data-version-id={v.id}
            >
              <input
                type="radio"
                checked={isFinal}
                disabled={readOnly}
                onChange={() => onSetFinal(v.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Mark as final"
                className="mt-1 disabled:opacity-50"
                data-testid="version-final-radio"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    v{idx} — {labelForOrigin(v)}
                  </span>
                  <span className="shrink-0 text-xs text-fg-muted">
                    {new Date(v.created_at).toLocaleDateString()}
                  </span>
                </div>
                {v.user_prompt ? (
                  <div className="truncate text-xs italic text-fg-muted" title={v.user_prompt}>
                    “{v.user_prompt}”
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 border-t border-border p-2"
        data-testid="upscale-form"
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={readOnly
            ? 'Unpublish this chapter to upscale.'
            : 'Describe the upscale… e.g. ‘ajoute des descriptions du décor, c’est la nuit’'}
          rows={3}
          cols={1}
          disabled={upscalePending || readOnly}
          className="w-full px-2 py-1 text-sm disabled:opacity-50"
          data-testid="upscale-prompt"
        />
        {pccSlotCount > 0 ? (
          <label className="flex items-center gap-2 text-xs text-fg-muted" data-testid="upscale-pcc-toggle">
            <input
              type="checkbox"
              checked={includePcc}
              onChange={(e) => setIncludePcc(e.target.checked)}
              disabled={upscalePending || readOnly}
            />
            Include previous {pccSlotCount} chapter{pccSlotCount > 1 ? 's' : ''} as context
          </label>
        ) : null}
        {upscaleError ? (
          <p className="text-xs text-red-400" data-testid="upscale-error">
            {upscaleError}
          </p>
        ) : null}
        {upscalePending ? (
          <div
            className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent-fg"
            data-testid="upscale-pending"
            aria-live="polite"
          >
            <Spinner /> Upscaling… (this may take 5–30s)
          </div>
        ) : null}
        <button
          type="submit"
          disabled={upscalePending || !prompt.trim() || readOnly}
          className="self-end bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="upscale-send"
        >
          {upscalePending ? (
            <span className="flex items-center gap-1">
              <Spinner /> Upscaling…
            </span>
          ) : (
            'Upscale'
          )}
        </button>
      </form>
    </div>
  );
}

function labelForOrigin(v: ChapterVersion): string {
  switch (v.origin) {
    case 'draft':
      return 'Draft';
    case 'upscale':
      return 'Upscale';
    case 'manual_edit':
      return 'Manual edit';
  }
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}
