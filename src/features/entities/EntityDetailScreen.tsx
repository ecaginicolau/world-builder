import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useEntity, useUpdateEntity, useDeleteEntity } from '@/lib/queries/entities';
import { useEntityType, useEntityTypes } from '@/lib/queries/entityTypes';
import { useEvents } from '@/lib/queries/events';
import {
  useEntityVersions,
  useUpsertEntityField,
  useResetEntityField,
} from '@/lib/queries/entityVersions';
import { useSession } from '@/features/auth/session';
import { useNavigate } from '@tanstack/react-router';
import { useConfirm } from '@/lib/useConfirm';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import {
  anchorId,
  anchorLabel,
  buildAnchors,
  buildEventRailItems,
  coerceFieldValue,
  formatFieldValue,
  resolveSnapshotAtAnchor,
  type FieldResolution,
  type TimelineAnchor,
} from './versioning';
import { INIT_RANK } from '@/lib/ranks';
import type { EntityVersion, FieldDef, FieldValue } from './types';

export function EntityDetailScreen() {
  const { worldId, entityId } = useParams({ from: '/worlds/$worldId/entities/$entityId' });
  const navigate = useNavigate();
  const session = useSession();
  const entityQ = useEntity(entityId);
  const typesQ = useEntityTypes(worldId);
  const typeQ = useEntityType(entityQ.data?.entity_type_id ?? '');
  const eventsQ = useEvents(worldId);
  const versionsQ = useEntityVersions(entityId);
  const updateEntity = useUpdateEntity();
  const deleteEntity = useDeleteEntity();
  const upsertField = useUpsertEntityField();
  const resetField = useResetEntityField();
  const confirm = useConfirm();

  const [name, setName] = useState<string>('');
  const [aliasInput, setAliasInput] = useState('');
  // Cursor = null → fall back to "the latest available anchor" (current state).
  // User clicks an anchor → cursor pinned. Re-mounting on a different entity
  // resets to null so the default kicks in again.
  const [cursorId, setCursorId] = useState<string | null>(null);

  useEffect(() => {
    if (entityQ.data) setName(entityQ.data.name);
  }, [entityQ.data]);

  // Entity rail = events only. Chapter anchors aren't editable surfaces post-(d).
  const railItems = useMemo(() => buildEventRailItems(eventsQ.data ?? []), [eventsQ.data]);

  const sortedVersions = useMemo<EntityVersion[]>(
    () => (versionsQ.data ?? []).slice().sort((a, b) => (a.valid_from_rank < b.valid_from_rank ? -1 : 1)),
    [versionsQ.data],
  );

  const anchors = useMemo(() => buildAnchors(railItems), [railItems]);

  const effectiveCursorId =
    cursorId ?? (anchors.length > 0 ? anchorId(anchors[anchors.length - 1]) : '@init');

  const currentAnchor = useMemo<TimelineAnchor>(
    () => anchors.find((a) => anchorId(a) === effectiveCursorId) ?? { kind: 'init' as const },
    [anchors, effectiveCursorId],
  );

  if (entityQ.isLoading || !entityQ.data) {
    return (
      <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
        <p className="text-fg-muted">Loading entity…</p>
      </main>
    );
  }
  const entity = entityQ.data;
  const type = typeQ.data;
  const color = type ? resolveColor(type.color, type.name) : '#a1a1aa';
  const fields: FieldDef[] = type?.fields ?? [];

  const resolved = resolveSnapshotAtAnchor(currentAnchor, railItems, sortedVersions, fields);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed === entity.name || trimmed === '') return;
    updateEntity.mutate({ id: entity.id, worldId, name: trimmed });
  }

  function commitType(typeIdNew: string) {
    if (typeIdNew === entity.entity_type_id) return;
    updateEntity.mutate({ id: entity.id, worldId, entityTypeId: typeIdNew });
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (!trimmed) return;
    if ((entity.aliases ?? []).includes(trimmed)) {
      setAliasInput('');
      return;
    }
    updateEntity.mutate(
      { id: entity.id, worldId, aliases: [...(entity.aliases ?? []), trimmed] },
      { onSuccess: () => setAliasInput('') },
    );
  }

  function removeAlias(a: string) {
    updateEntity.mutate({
      id: entity.id,
      worldId,
      aliases: (entity.aliases ?? []).filter((x) => x !== a),
    });
  }

  function onSetField(fieldName: string, value: FieldValue) {
    if (session.status !== 'authed') return;
    const eventId =
      currentAnchor.kind === 'init' ? null : currentAnchor.item.id;
    const validFromRank =
      currentAnchor.kind === 'init' ? INIT_RANK : currentAnchor.item.rank;
    upsertField.mutate({
      entityId,
      worldId,
      ownerId: session.session.user.id,
      eventId,
      fieldName,
      value,
      validFromRank,
    });
  }

  function onResetField(fieldName: string) {
    const eventId =
      currentAnchor.kind === 'init' ? null : currentAnchor.item.id;
    resetField.mutate({ entityId, worldId, eventId, fieldName });
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete entity "${entity.name}"?`,
      message: 'All its versions will be removed too. This cannot be undone.',
      danger: true,
    });
    if (!ok) return;
    await deleteEntity.mutateAsync({ id: entity.id, worldId });
    void navigate({ to: '/worlds/$worldId/entities', params: { worldId } });
  }

  return (
    <main className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto px-6 py-6">
      <header className="space-y-2">
        <Link
          to="/worlds/$worldId/entities"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-entities"
        >
          ← Entities
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            className="flex-1 bg-transparent text-2xl font-semibold tracking-tight focus:outline-none"
            data-testid="entity-name"
          />
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-fg-muted hover:text-red-400"
            data-testid="entity-delete"
          >
            Delete
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Type:</span>
          <select
            value={entity.entity_type_id}
            onChange={(e) => commitType(e.target.value)}
            className="bg-bg-subtle px-2 py-1 text-sm"
            data-testid="entity-type-select"
          >
            {(typesQ.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {type ? (
            <Link
              to="/worlds/$worldId/entity-types/$typeId"
              params={{ worldId, typeId: type.id }}
              className="rounded-md border px-2 py-0.5 text-xs hover:opacity-80"
              style={{
                backgroundColor: chipBgFromHex(color),
                borderColor: chipBorderFromHex(color),
              }}
              data-testid="entity-type-link"
            >
              edit type →
            </Link>
          ) : null}
        </div>
      </header>

      <section className="space-y-2" data-testid="aliases-section">
        <h2 className="text-sm font-semibold text-fg-muted">
          Aliases <span className="text-xs">(used by detection &amp; highlights)</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {(entity.aliases ?? []).map((a) => (
            <span
              key={a}
              className="flex items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs"
              data-testid="alias-chip"
            >
              {a}
              <button
                type="button"
                onClick={() => removeAlias(a)}
                className="text-fg-muted hover:text-red-400"
                aria-label={`Remove alias ${a}`}
                data-testid="alias-remove"
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAlias();
              }
            }}
            placeholder="Add alias…"
            className="px-2 py-1 text-xs"
            data-testid="alias-input"
          />
          <button
            type="button"
            onClick={addAlias}
            disabled={!aliasInput.trim()}
            className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg-panel disabled:opacity-50"
            data-testid="alias-add"
          >
            Add
          </button>
        </div>
      </section>

      <section
        className="grid gap-6 lg:grid-cols-[260px_1fr]"
        data-testid="state-section"
      >
        <TimelineRail
          anchors={anchors}
          cursorId={effectiveCursorId}
          onSelect={setCursorId}
          versions={sortedVersions}
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" data-testid="state-anchor-label">
              {anchorLabel(currentAnchor)}
            </h2>
            <span className="text-xs italic text-fg-muted" title="Edits to fields auto-save into the version anchored at this point.">
              Edits autosave at this anchor
            </span>
          </div>
          <FieldsEditor
            fields={fields}
            resolved={resolved}
            currentAnchor={currentAnchor}
            onSet={onSetField}
            onReset={onResetField}
          />
        </div>
      </section>
    </main>
  );
}

interface TimelineRailProps {
  anchors: TimelineAnchor[];
  cursorId: string;
  onSelect: (id: string) => void;
  versions: EntityVersion[];
}

function TimelineRail({ anchors, cursorId, onSelect, versions }: TimelineRailProps) {
  // Map anchor id → has a version anchored here.
  const anchorHasVersion = new Map<string, boolean>();
  for (const a of anchors) {
    if (a.kind === 'init') {
      anchorHasVersion.set('@init', versions.some((v) => v.source_event_id === null));
    } else {
      anchorHasVersion.set(a.item.rank, versions.some((v) => v.source_event_id === a.item.id));
    }
  }

  return (
    <aside
      className="lg:sticky lg:top-6 lg:self-start"
      data-testid="timeline-rail"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        Timeline ({versions.length} version{versions.length === 1 ? '' : 's'})
      </h2>
      <ol className="relative space-y-0.5 border-l border-border pl-3">
        {anchors.map((a) => {
          const id = anchorId(a);
          const isActive = id === cursorId;
          const hasVersion = anchorHasVersion.get(id) ?? false;
          return (
            <li key={id} className="relative">
              <span
                className={`absolute -left-[17px] top-2 h-2.5 w-2.5 rounded-full border ${
                  hasVersion
                    ? 'border-accent bg-accent'
                    : isActive
                    ? 'border-accent bg-bg'
                    : 'border-border bg-bg'
                }`}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={`block w-full rounded-md px-2 py-1 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-fg ring-1 ring-accent/40'
                    : 'text-fg-muted hover:bg-bg-subtle hover:text-fg'
                }`}
                data-testid="timeline-anchor"
                data-anchor-id={id}
                data-active={isActive ? 'true' : 'false'}
              >
                {anchorLabel(a)}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

interface FieldsEditorProps {
  fields: FieldDef[];
  resolved: Map<string, FieldResolution>;
  currentAnchor: TimelineAnchor;
  onSet: (fieldName: string, value: FieldValue) => void;
  onReset: (fieldName: string) => void;
}

function FieldsEditor({ fields, resolved, currentAnchor, onSet, onReset }: FieldsEditorProps) {
  if (fields.length === 0) {
    return (
      <p className="rounded-md border border-border bg-bg-panel px-3 py-2 text-sm text-fg-muted">
        No fields on this type yet.{' '}
        <span className="text-xs">(Edit the type to add some.)</span>
      </p>
    );
  }
  // Same-anchor source means the field is set explicitly here (vs inherited).
  const isExplicitHere = (r: FieldResolution): boolean => {
    if (!r.source) return false;
    if (currentAnchor.kind === 'init') return r.source.source_event_id === null;
    return r.source.source_event_id === currentAnchor.item.id;
  };
  return (
    <div className="space-y-2 rounded-md border border-border bg-bg-panel px-3 py-3">
      {fields.map((f) => {
        const r = resolved.get(f.name) ?? { value: null, source: null };
        return (
          <FieldRow
            key={f.name}
            field={f}
            resolution={r}
            inheritedFrom={isExplicitHere(r) ? null : describeSource(r.source)}
            onSet={(value) => onSet(f.name, value)}
            onReset={isExplicitHere(r) ? () => onReset(f.name) : undefined}
          />
        );
      })}
    </div>
  );
}

function describeSource(source: EntityVersion | null): string {
  if (!source) return 'never set';
  if (source.source_event_id === null) return 'inherited from initial';
  return 'inherited from earlier event';
}

interface FieldRowProps {
  field: FieldDef;
  resolution: FieldResolution;
  /** Null when explicitly set at the current anchor; non-null otherwise. */
  inheritedFrom: string | null;
  onSet: (value: FieldValue) => void;
  onReset?: () => void;
}

function FieldRow({ field, resolution, inheritedFrom, onSet, onReset }: FieldRowProps) {
  const inherited = inheritedFrom !== null;
  const stored = formatFieldValue(resolution.value);
  const [draft, setDraft] = useState<string>(stored);

  // Re-sync local input when the underlying resolved value changes (anchor
  // switch, autosave landed, etc.) — but skip when the user is mid-edit and
  // the values match.
  useEffect(() => {
    setDraft(stored);
  }, [stored]);

  function commit() {
    if (draft === stored) return;
    onSet(coerceFieldValue(field.kind, draft));
  }

  function commitBool(checked: boolean) {
    onSet(checked);
  }

  const labelStyle = inherited ? 'text-fg-muted italic' : '';
  const fieldHint = inherited ? (
    <span className="text-[10px] italic text-fg-muted" title={inheritedFrom ?? ''}>
      ({inheritedFrom})
    </span>
  ) : null;
  const resetButton = onReset ? (
    <button
      type="button"
      onClick={onReset}
      className="text-[10px] text-fg-muted hover:text-fg"
      title="Reset this field at this anchor → fall back to inheritance"
      data-testid="field-reset"
    >
      ↺
    </button>
  ) : null;

  if (field.kind === 'bool') {
    const checked = resolution.value === true;
    return (
      <label
        className="flex items-center gap-2 text-sm"
        data-testid="field-row"
        data-field-name={field.name}
        data-explicit={inherited ? 'false' : 'true'}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => commitBool(e.target.checked)}
          className={inherited ? 'opacity-60' : ''}
          data-testid="field-input"
        />
        <span className={labelStyle}>{field.name}</span>
        {fieldHint}
        {resetButton}
      </label>
    );
  }

  if (field.kind === 'text') {
    return (
      <label
        className="block space-y-1"
        data-testid="field-row"
        data-field-name={field.name}
        data-explicit={inherited ? 'false' : 'true'}
      >
        <span className={`flex items-center gap-2 text-xs ${labelStyle}`}>
          {field.name}
          {field.required ? <span className="text-red-400">*</span> : null}
          {fieldHint}
          {resetButton}
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
          className={`w-full px-2 py-1 text-sm ${inherited ? 'opacity-70' : ''}`}
          data-testid="field-input"
        />
      </label>
    );
  }

  return (
    <label
      className="block space-y-1"
      data-testid="field-row"
      data-field-name={field.name}
      data-explicit={inherited ? 'false' : 'true'}
    >
      <span className={`flex items-center gap-2 text-xs ${labelStyle}`}>
        {field.name}
        {field.required ? <span className="text-red-400">*</span> : null}
        {fieldHint}
        {resetButton}
      </span>
      <input
        type={field.kind === 'int' ? 'number' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className={`w-full px-2 py-1 text-sm ${inherited ? 'opacity-70' : ''}`}
        data-testid="field-input"
      />
    </label>
  );
}
