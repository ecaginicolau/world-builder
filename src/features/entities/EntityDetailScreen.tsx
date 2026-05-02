import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useEntity, useUpdateEntity, useDeleteEntity } from '@/lib/queries/entities';
import { useEntityType, useEntityTypes } from '@/lib/queries/entityTypes';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useEvents } from '@/lib/queries/events';
import { useEntityVersions } from '@/lib/queries/entityVersions';
import { useNavigate } from '@tanstack/react-router';
import { useConfirm } from '@/lib/useConfirm';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import {
  CURRENT_RANK_SENTINEL,
  anchorId,
  anchorLabel,
  buildAnchors,
  buildRankPickerItems,
  diffSnapshots,
  formatFieldValue,
  resolveStateAtAnchor,
  versionLabelForRank,
  versionsByAnchor,
  type TimelineAnchor,
} from './versioning';
import { NewVersionModal } from './NewVersionModal';
import { INIT_RANK } from '@/lib/ranks';
import type { EntityVersion, FieldDef, Snapshot } from './types';

export function EntityDetailScreen() {
  const { worldId, entityId } = useParams({ from: '/worlds/$worldId/entities/$entityId' });
  const navigate = useNavigate();
  const entityQ = useEntity(entityId);
  const typesQ = useEntityTypes(worldId);
  const typeQ = useEntityType(entityQ.data?.entity_type_id ?? '');
  const chaptersQ = useChaptersByWorld(worldId);
  const eventsQ = useEvents(worldId);
  const versionsQ = useEntityVersions(entityId);
  const updateEntity = useUpdateEntity();
  const deleteEntity = useDeleteEntity();
  const confirm = useConfirm();

  const [name, setName] = useState<string>('');
  const [aliasInput, setAliasInput] = useState('');
  const [cursorId, setCursorId] = useState<string>(CURRENT_RANK_SENTINEL);
  const [newVersionOpen, setNewVersionOpen] = useState(false);

  useEffect(() => {
    if (entityQ.data) setName(entityQ.data.name);
  }, [entityQ.data]);

  const rankItems = useMemo(
    () => buildRankPickerItems(chaptersQ.data ?? [], eventsQ.data ?? []),
    [chaptersQ.data, eventsQ.data],
  );

  const sortedVersions = useMemo<EntityVersion[]>(
    () => (versionsQ.data ?? []).slice().sort((a, b) => (a.valid_from_rank < b.valid_from_rank ? -1 : 1)),
    [versionsQ.data],
  );

  const anchors = useMemo(() => buildAnchors(rankItems), [rankItems]);

  const versionsAt = useMemo(
    () => versionsByAnchor(rankItems, sortedVersions),
    [rankItems, sortedVersions],
  );

  const currentAnchor = useMemo<TimelineAnchor>(
    () => anchors.find((a) => anchorId(a) === cursorId) ?? { kind: 'current' },
    [anchors, cursorId],
  );

  const stateAtCursor = useMemo(
    () => resolveStateAtAnchor(currentAnchor, rankItems, sortedVersions),
    [currentAnchor, rankItems, sortedVersions],
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
          cursorId={cursorId}
          onSelect={setCursorId}
          versionsAt={versionsAt}
          totalVersions={sortedVersions.length}
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" data-testid="state-anchor-label">
              {anchorLabel(currentAnchor)}
            </h2>
            <button
              type="button"
              onClick={() => setNewVersionOpen(true)}
              className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg"
              data-testid="new-version"
            >
              + New version…
            </button>
          </div>
          <FieldsCard fields={fields} snapshot={stateAtCursor?.snapshot ?? {}} />
          {stateAtCursor ? (
            <p className="text-xs text-fg-muted" data-testid="state-source">
              From version {versionLabelForRank(stateAtCursor.valid_from_rank, rankItems)}
              {' · '}
              {new Date(stateAtCursor.created_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-xs text-fg-muted" data-testid="state-empty">
              No version applies at this point. Create one to start tracking state.
            </p>
          )}
          {currentAnchor.kind === 'after' || currentAnchor.kind === 'init' ? (
            <AnchorVersionList
              versions={versionsAt.get(anchorId(currentAnchor)) ?? []}
              allVersions={sortedVersions}
              rankItems={rankItems}
            />
          ) : null}
        </div>
      </section>

      <NewVersionModal
        open={newVersionOpen}
        onClose={() => setNewVersionOpen(false)}
        entityId={entityId}
        worldId={worldId}
        fields={fields}
        currentSnapshot={stateAtCursor?.snapshot ?? {}}
        rankItems={rankItems}
        existingVersions={sortedVersions}
        defaultRank={defaultRankFromAnchor(currentAnchor)}
      />
    </main>
  );
}

function defaultRankFromAnchor(a: TimelineAnchor): string | null {
  if (a.kind === 'init') return INIT_RANK;
  if (a.kind === 'after') return a.item.rank;
  return null;
}

interface TimelineRailProps {
  anchors: TimelineAnchor[];
  cursorId: string;
  onSelect: (id: string) => void;
  versionsAt: Map<string, EntityVersion[]>;
  totalVersions: number;
}

function TimelineRail({
  anchors,
  cursorId,
  onSelect,
  versionsAt,
  totalVersions,
}: TimelineRailProps) {
  return (
    <aside
      className="lg:sticky lg:top-6 lg:self-start"
      data-testid="timeline-rail"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        Timeline ({totalVersions} version{totalVersions === 1 ? '' : 's'})
      </h2>
      <ol className="relative space-y-0.5 border-l border-border pl-3">
        {anchors.map((a) => {
          const id = anchorId(a);
          const isActive = id === cursorId;
          const versions = versionsAt.get(id) ?? [];
          const hasVersion = versions.length > 0;
          const isCurrent = a.kind === 'current';
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
                <span className={isCurrent ? 'italic' : ''}>{anchorLabel(a)}</span>
                {hasVersion ? (
                  <span className="ml-1 text-[10px] text-fg-muted">
                    · {versions.length} update{versions.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function AnchorVersionList({
  versions,
  allVersions,
  rankItems,
}: {
  versions: EntityVersion[];
  allVersions: EntityVersion[];
  rankItems: ReturnType<typeof buildRankPickerItems>;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-xs text-fg-muted" data-testid="anchor-no-updates">
        No updates anchored here yet.
      </p>
    );
  }
  const indexInAll = (v: EntityVersion) =>
    allVersions.findIndex((x) => x.id === v.id);
  return (
    <ul className="space-y-1" data-testid="anchor-versions">
      {versions.map((v) => {
        const idx = indexInAll(v);
        const prev = idx > 0 ? (allVersions[idx - 1].snapshot as Snapshot) : ({} as Snapshot);
        const changed = diffSnapshots(prev, v.snapshot as Snapshot);
        return (
          <li
            key={v.id}
            className="flex flex-col gap-0.5 rounded-md border border-border bg-bg-panel px-3 py-2 text-sm"
            data-testid="version-row"
          >
            <div className="flex justify-between">
              <span>{versionLabelForRank(v.valid_from_rank, rankItems)}</span>
              <span className="text-xs text-fg-muted">
                {new Date(v.created_at).toLocaleDateString()}
              </span>
            </div>
            {changed.length > 0 ? (
              <div className="flex flex-wrap gap-1 text-xs text-fg-muted">
                {changed.map((k) => (
                  <span
                    key={k}
                    className="rounded-md bg-bg-subtle px-1.5 py-0.5"
                    data-testid="version-diff-chip"
                  >
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
            {v.note_excerpt ? (
              <p className="mt-0.5 line-clamp-2 text-xs italic text-fg-muted">
                {v.note_excerpt}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function FieldsCard({ fields, snapshot }: { fields: FieldDef[]; snapshot: Snapshot }) {
  if (fields.length === 0) {
    return (
      <p className="rounded-md border border-border bg-bg-panel px-3 py-2 text-sm text-fg-muted">
        No fields on this type yet.{' '}
        <span className="text-xs">(Edit the type to add some.)</span>
      </p>
    );
  }
  return (
    <dl className="grid gap-2 rounded-md border border-border bg-bg-panel px-3 py-2 text-sm sm:grid-cols-[140px_1fr]">
      {fields.map((f) => {
        const raw = snapshot[f.name];
        const display = formatFieldValue(raw ?? null);
        return (
          <div key={f.name} className="contents" data-testid="field-display">
            <dt className="text-xs text-fg-muted">{f.name}</dt>
            <dd className={display ? '' : 'text-fg-muted italic'}>
              {display || '(no value)'}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
