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
  buildRankPickerItems,
  diffSnapshots,
  formatFieldValue,
  rankPickerLabel,
  resolveStateAtRank,
  versionLabelForRank,
} from './versioning';
import { NewVersionModal } from './NewVersionModal';
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
  const [rankCursor, setRankCursor] = useState<string>(CURRENT_RANK_SENTINEL);
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

  const stateAtCursor = useMemo(
    () => resolveStateAtRank(sortedVersions, rankCursor),
    [sortedVersions, rankCursor],
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
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6">
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

      <section className="space-y-3" data-testid="state-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-fg-muted">Show state as of:</span>
            <select
              value={rankCursor}
              onChange={(e) => setRankCursor(e.target.value)}
              className="bg-bg-subtle px-2 py-1 text-sm"
              data-testid="rank-cursor"
            >
              <option value={CURRENT_RANK_SENTINEL}>— current —</option>
              {rankItems.map((item) => (
                <option key={item.rank} value={item.rank}>
                  {rankPickerLabel(item)}
                </option>
              ))}
            </select>
          </div>
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
          </p>
        ) : (
          <p className="text-xs text-fg-muted" data-testid="state-empty">
            No version applies at this point. Create one to start tracking state.
          </p>
        )}
      </section>

      <section className="space-y-2" data-testid="versions-section">
        <h2 className="text-sm font-semibold text-fg-muted">
          Versions ({sortedVersions.length})
        </h2>
        {sortedVersions.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No versions yet. The first "New version" creates an implicit v0 + your version.
          </p>
        ) : (
          <ul className="space-y-1">
            {sortedVersions.map((v, idx) => {
              const prev = idx > 0 ? sortedVersions[idx - 1].snapshot : {};
              const changed = diffSnapshots(prev as Snapshot, v.snapshot);
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
                </li>
              );
            })}
          </ul>
        )}
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
        defaultRank={rankCursor === CURRENT_RANK_SENTINEL ? null : rankCursor}
      />
    </main>
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
