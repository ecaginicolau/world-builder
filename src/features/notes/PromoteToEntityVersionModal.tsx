import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useEvents } from '@/lib/queries/events';
import { useEntityVersions, useCreateEntityVersion, ensureInitVersion } from '@/lib/queries/entityVersions';
import { logNotePromotion } from '@/lib/queries/notePromotions';
import { useSession } from '@/features/auth/session';
import { htmlToPlainText } from '@/lib/html';
import {
  buildRankPickerItems,
  coerceFieldValue,
  formatFieldValue,
  rankPickerLabel,
  resolveStateAtRank,
} from '@/features/entities/versioning';
import type { FieldDef, Snapshot } from '@/features/entities/types';

interface Props {
  open: boolean;
  onClose: () => void;
  worldId: string;
  noteId: string;
  noteContent: string;
}

export function PromoteToEntityVersionModal({
  open,
  onClose,
  worldId,
  noteId,
  noteContent,
}: Props) {
  const session = useSession();
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const chaptersQ = useChaptersByWorld(worldId);
  const eventsQ = useEvents(worldId);
  const navigate = useNavigate();
  const createVersion = useCreateEntityVersion();

  const [entityId, setEntityId] = useState<string>('');
  const [rank, setRank] = useState<string>('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const versionsQ = useEntityVersions(entityId);

  const rankItems = useMemo(
    () => buildRankPickerItems(chaptersQ.data ?? [], eventsQ.data ?? []),
    [chaptersQ.data, eventsQ.data],
  );

  const entity = (entitiesQ.data ?? []).find((e) => e.id === entityId);
  const type = entity
    ? (typesQ.data ?? []).find((t) => t.id === entity.entity_type_id)
    : undefined;
  const fields: FieldDef[] = useMemo(() => type?.fields ?? [], [type]);

  const baseSnapshot: Snapshot = useMemo(() => {
    if (!rank || !versionsQ.data) return {};
    const v = resolveStateAtRank(versionsQ.data, rank);
    return v?.snapshot ?? {};
  }, [rank, versionsQ.data]);

  useEffect(() => {
    if (!open) return;
    setEntityId('');
    setRank('');
    setDraft({});
    setError(null);
  }, [open]);

  // Pre-fill draft when entity or rank changes
  useEffect(() => {
    if (!entity) return;
    const out: Record<string, string> = {};
    for (const f of fields) {
      out[f.name] = formatFieldValue(baseSnapshot[f.name] ?? null);
    }
    setDraft(out);
  }, [entity, fields, baseSnapshot]);

  // Set default rank to last item once timeline loads
  useEffect(() => {
    if (!open || rank) return;
    if (rankItems.length > 0) setRank(rankItems[rankItems.length - 1].rank);
  }, [open, rank, rankItems]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (session.status !== 'authed') return;
    if (!entity) {
      setError('Pick an entity to promote into.');
      return;
    }
    if (!rank) {
      setError('Pick a rank — add a chapter or event first if the timeline is empty.');
      return;
    }
    try {
      await ensureInitVersion({
        entityId: entity.id,
        worldId,
        ownerId: session.session.user.id,
        existingVersions: versionsQ.data ?? [],
      });
      const snapshot: Snapshot = {};
      for (const f of fields) {
        snapshot[f.name] = coerceFieldValue(f.kind, draft[f.name] ?? '');
      }
      const excerpt = htmlToPlainText(noteContent).slice(0, 500) || null;
      const v = await createVersion.mutateAsync({
        entityId: entity.id,
        worldId,
        ownerId: session.session.user.id,
        validFromRank: rank,
        snapshot,
        sourceNoteId: noteId,
        noteExcerpt: excerpt,
      });
      void logNotePromotion({
        noteId,
        ownerId: session.session.user.id,
        targetKind: 'entity_version',
        targetId: v.id,
        sourceExcerpt: excerpt,
      });
      onClose();
      void navigate({
        to: '/worlds/$worldId/entities/$entityId',
        params: { worldId, entityId: entity.id },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="promote-version-modal"
    >
      <div className="w-full max-w-lg space-y-3 rounded-md border border-border bg-bg-panel p-4">
        <h2 className="text-lg font-semibold">Promote to entity version</h2>
        <p className="text-xs text-fg-muted">
          Create a new append-only snapshot of an entity at a chosen point in the timeline.
        </p>
        <form onSubmit={onSubmit} className="space-y-3" data-testid="promote-version-form">
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Entity</span>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full bg-bg-subtle px-2 py-1 text-sm"
              data-testid="promote-version-entity"
            >
              <option value="">— pick an entity —</option>
              {(entitiesQ.data ?? []).map((e) => {
                const t = (typesQ.data ?? []).find((x) => x.id === e.entity_type_id);
                return (
                  <option key={e.id} value={e.id}>
                    {e.name} {t ? `(${t.name})` : ''}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">At rank</span>
            <select
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              className="w-full bg-bg-subtle px-2 py-1 text-sm"
              data-testid="promote-version-rank"
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
          {entity && fields.length === 0 ? (
            <p className="text-xs text-fg-muted">
              The selected type has no fields — the version will be empty. Edit the type to
              add fields first.
            </p>
          ) : null}
          {entity && fields.length > 0 ? (
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
          ) : null}
          {error ? (
            <p className="text-sm text-red-400" data-testid="promote-version-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              data-testid="promote-version-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createVersion.isPending || !entity}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="promote-version-submit"
            >
              {createVersion.isPending ? 'Promoting…' : 'Promote'}
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
