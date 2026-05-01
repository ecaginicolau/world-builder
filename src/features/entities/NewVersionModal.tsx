import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth/session';
import { useCreateEntityVersion, ensureInitVersion } from '@/lib/queries/entityVersions';
import {
  CURRENT_RANK_SENTINEL,
  coerceFieldValue,
  formatFieldValue,
  rankPickerLabel,
  type TimelineRankItem,
} from './versioning';
import type { EntityVersion, FieldDef, Snapshot } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  entityId: string;
  worldId: string;
  fields: FieldDef[];
  currentSnapshot: Snapshot;
  rankItems: TimelineRankItem[];
  existingVersions: EntityVersion[];
  defaultRank: string | null;
  /** When the version is being created from a note promotion. */
  sourceNoteId?: string;
  /** Excerpt to attach for audit. */
  noteExcerpt?: string;
  onCreated?: (version: EntityVersion) => void;
}

export function NewVersionModal({
  open,
  onClose,
  entityId,
  worldId,
  fields,
  currentSnapshot,
  rankItems,
  existingVersions,
  defaultRank,
  sourceNoteId,
  noteExcerpt,
  onCreated,
}: Props) {
  const session = useSession();
  const createVersion = useCreateEntityVersion();

  const [rank, setRank] = useState<string>('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      out[f.name] = formatFieldValue(currentSnapshot[f.name] ?? null);
    }
    return out;
  }, [fields, currentSnapshot]);

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
    setError(null);
    if (defaultRank && defaultRank !== CURRENT_RANK_SENTINEL) {
      setRank(defaultRank);
    } else if (rankItems.length > 0) {
      setRank(rankItems[rankItems.length - 1].rank);
    } else {
      setRank('');
    }
  }, [open, initial, defaultRank, rankItems]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    if (!rank) {
      setError('Pick a rank — add a chapter or event first if the timeline is empty.');
      return;
    }
    try {
      await ensureInitVersion({
        entityId,
        worldId,
        ownerId: session.session.user.id,
        existingVersions,
      });
      const snapshot: Snapshot = {};
      for (const f of fields) {
        snapshot[f.name] = coerceFieldValue(f.kind, draft[f.name] ?? '');
      }
      const created = await createVersion.mutateAsync({
        entityId,
        worldId,
        ownerId: session.session.user.id,
        validFromRank: rank,
        snapshot,
        sourceNoteId: sourceNoteId ?? null,
        noteExcerpt: noteExcerpt ?? null,
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="new-version-modal"
    >
      <div className="w-full max-w-lg space-y-3 rounded-md border border-border bg-bg-panel p-4">
        <h2 className="text-lg font-semibold">New version</h2>
        <p className="text-xs text-fg-muted">
          Versions are append-only. Pick a rank in the timeline; the snapshot replaces the
          state from that point on.
        </p>
        <form onSubmit={onSubmit} className="space-y-3" data-testid="new-version-form">
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">At rank</span>
            <select
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              className="w-full bg-bg-subtle px-2 py-1 text-sm"
              data-testid="new-version-rank"
            >
              {rankItems.length === 0 ? (
                <option value="">— no chapters or events yet —</option>
              ) : null}
              {rankItems.map((item) => (
                <option key={item.rank} value={item.rank}>
                  {rankPickerLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {fields.length === 0 ? (
            <p className="text-xs text-fg-muted">
              No fields on this type yet — the version will have an empty snapshot.
            </p>
          ) : (
            <div className="space-y-2">
              {fields.map((f) => (
                <FieldInput
                  key={f.name}
                  field={f}
                  value={draft[f.name] ?? ''}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
                />
              ))}
            </div>
          )}
          {error ? (
            <p className="text-sm text-red-400" data-testid="new-version-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              data-testid="new-version-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createVersion.isPending}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="new-version-submit"
            >
              {createVersion.isPending ? 'Saving…' : 'Save version'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.kind === 'text') {
    return (
      <label className="block space-y-1">
        <span className="text-xs text-fg-muted">
          {field.name}
          {field.required ? ' *' : ''}
        </span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-2 py-1 text-sm"
          data-testid="field-input"
        />
      </label>
    );
  }
  if (field.kind === 'bool') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value === 'true' || value === '1'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          data-testid="field-input"
        />
        <span>{field.name}</span>
      </label>
    );
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs text-fg-muted">
        {field.name}
        {field.required ? ' *' : ''}
      </span>
      <input
        type={field.kind === 'int' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-sm"
        data-testid="field-input"
      />
    </label>
  );
}
