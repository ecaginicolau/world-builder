import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useWorld } from '@/lib/queries/worlds';
import { useSession } from '@/features/auth/session';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import { useCreateEntity, useEntities } from '@/lib/queries/entities';
import { useEntityVersionsByWorld } from '@/lib/queries/entityVersions';
import { useChaptersByWorld } from '@/lib/queries/chapters';
import { useEvents } from '@/lib/queries/events';
import { useChapterEventsByWorld } from '@/lib/queries/chapterEvents';
import { buildChapterChronoMap } from '@/features/timeline/chronoDerive';
import {
  CURRENT_RANK_SENTINEL,
  buildRankPickerItems,
  formatFieldValue,
  rankPickerLabel,
  resolveSnapshotMapAtRank,
} from './versioning';
import type { Entity, EntityType, EntityVersion, FieldDef, Snapshot } from './types';
import { EntityTypesEditorModal } from './EntityTypesEditorModal';

type SortKey = 'name' | 'updated' | 'appearance';

export function EntitiesScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/entities' });
  const session = useSession();
  const worldQ = useWorld(worldId);
  const typesQ = useEntityTypes(worldId);
  const entitiesQ = useEntities(worldId);
  const versionsQ = useEntityVersionsByWorld(worldId);
  const chaptersQ = useChaptersByWorld(worldId);
  const eventsQ = useEvents(worldId);
  const chapterEventsQ = useChapterEventsByWorld(worldId);
  const createEntity = useCreateEntity();

  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityTypeId, setNewEntityTypeId] = useState<string>('');
  const [typesModalOpen, setTypesModalOpen] = useState(false);

  const [searchRaw, setSearchRaw] = useState('');
  const [search, setSearch] = useState('');
  const [rankCursor, setRankCursor] = useState<string>(CURRENT_RANK_SENTINEL);
  const [hideDead, setHideDead] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');
  const [typeTab, setTypeTab] = useState<string>('all');

  // Debounce search 150ms.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchRaw), 150);
    return () => clearTimeout(id);
  }, [searchRaw]);

  async function onAddEntity(e: FormEvent) {
    e.preventDefault();
    if (!newEntityName.trim() || !newEntityTypeId || session.status !== 'authed') return;
    await createEntity.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      entityTypeId: newEntityTypeId,
      name: newEntityName.trim(),
    });
    setNewEntityName('');
  }

  const typesById = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.id, t])),
    [typesQ.data],
  );

  const versionsByEntity = useMemo(() => {
    const map = new Map<string, EntityVersion[]>();
    for (const v of versionsQ.data ?? []) {
      const arr = map.get(v.entity_id) ?? [];
      arr.push(v);
      map.set(v.entity_id, arr);
    }
    return map;
  }, [versionsQ.data]);

  const chapterChrono = useMemo(
    () => buildChapterChronoMap(chapterEventsQ.data ?? [], eventsQ.data ?? []),
    [chapterEventsQ.data, eventsQ.data],
  );
  const rankItems = useMemo(
    () => buildRankPickerItems(chaptersQ.data ?? [], eventsQ.data ?? [], chapterChrono),
    [chaptersQ.data, eventsQ.data, chapterChrono],
  );

  const decoratedEntities = useMemo(() => {
    const list = entitiesQ.data ?? [];
    return list.map((e) => {
      const versions = versionsByEntity.get(e.id) ?? [];
      const type = typesById.get(e.entity_type_id);
      const fields = type?.fields ?? [];
      const snapshot = resolveSnapshotMapAtRank(versions, rankCursor, fields);
      const lastUpdated = versions.reduce<string>(
        (acc, v) => (v.created_at > acc ? v.created_at : acc),
        '',
      );
      const firstRank = versions.reduce<string | null>(
        (acc, v) =>
          acc === null || v.valid_from_rank < acc ? v.valid_from_rank : acc,
        null,
      );
      return { entity: e, versions, snapshot, hasVersions: versions.length > 0, lastUpdated, firstRank };
    });
  }, [entitiesQ.data, versionsByEntity, rankCursor, typesById]);

  const beforeTypeFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decoratedEntities.filter(({ entity, snapshot }) => {
      if (q) {
        const haystack = [entity.name, ...(entity.aliases ?? [])]
          .join('\n')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (hideDead && rankCursor !== CURRENT_RANK_SENTINEL) {
        const type = typesById.get(entity.entity_type_id);
        const aliveField = type?.fields?.find(
          (f) => f.name === 'alive' && f.kind === 'bool',
        );
        if (aliveField) {
          const alive = snapshot.alive;
          if (alive === false) return false;
        }
      }
      return true;
    });
  }, [decoratedEntities, search, hideDead, rankCursor, typesById]);

  const countsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of beforeTypeFilter) {
      counts.set(
        row.entity.entity_type_id,
        (counts.get(row.entity.entity_type_id) ?? 0) + 1,
      );
    }
    return counts;
  }, [beforeTypeFilter]);

  const filtered = useMemo(
    () =>
      typeTab === 'all'
        ? beforeTypeFilter
        : beforeTypeFilter.filter((row) => row.entity.entity_type_id === typeTab),
    [beforeTypeFilter, typeTab],
  );

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    if (sort === 'name') {
      arr.sort((a, b) => a.entity.name.localeCompare(b.entity.name));
    } else if (sort === 'updated') {
      arr.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
    } else if (sort === 'appearance') {
      arr.sort((a, b) => {
        if (a.firstRank === null && b.firstRank === null) return 0;
        if (a.firstRank === null) return 1;
        if (b.firstRank === null) return -1;
        return a.firstRank < b.firstRank ? -1 : a.firstRank > b.firstRank ? 1 : 0;
      });
    }
    return arr;
  }, [filtered, sort]);

  const groupedByType = useMemo(() => {
    const map = new Map<string, typeof sorted>();
    for (const row of sorted) {
      const list = (map.get(row.entity.entity_type_id) ?? []) as typeof sorted;
      list.push(row);
      map.set(row.entity.entity_type_id, list);
    }
    return map;
  }, [sorted]);

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 overflow-y-auto px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            to="/worlds/$worldId"
            params={{ worldId }}
            className="text-sm text-fg-muted hover:text-fg"
            data-testid="back-to-world"
          >
            ← {worldQ.data?.name ?? 'World'}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Entities</h1>
        </div>
        <button
          type="button"
          onClick={() => setTypesModalOpen(true)}
          className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
          data-testid="open-types-modal"
        >
          ⚙ Types
        </button>
      </header>

      <section className="space-y-3" data-testid="entities-section">
        {typesQ.data && typesQ.data.length > 0 ? (
          <form onSubmit={onAddEntity} className="flex flex-wrap gap-2" data-testid="create-entity-form">
            <input
              value={newEntityName}
              onChange={(e) => setNewEntityName(e.target.value)}
              placeholder="Entity name"
              className="flex-1 px-3 py-2 text-sm"
              data-testid="create-entity-name"
            />
            <select
              value={newEntityTypeId}
              onChange={(e) => setNewEntityTypeId(e.target.value)}
              className="bg-bg-subtle px-3 py-2 text-sm"
              data-testid="create-entity-type"
            >
              <option value="">Type…</option>
              {typesQ.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={createEntity.isPending || !newEntityName.trim() || !newEntityTypeId}
              className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
              data-testid="create-entity-submit"
            >
              Add
            </button>
          </form>
        ) : (
          <p className="text-sm text-fg-muted">
            No types yet — open <button
              type="button"
              onClick={() => setTypesModalOpen(true)}
              className="underline hover:text-fg"
            >
              ⚙ Types
            </button> to add one first.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="entities-toolbar">
          <input
            type="search"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Search name or alias…"
            className="flex-1 min-w-[160px] px-2 py-1 text-xs"
            data-testid="entities-search"
          />
          <label className="flex items-center gap-1 text-fg-muted">
            <span>View as of</span>
            <select
              value={rankCursor}
              onChange={(e) => setRankCursor(e.target.value)}
              className="bg-bg-subtle px-2 py-1 text-xs"
              data-testid="entities-rank-picker"
            >
              <option value={CURRENT_RANK_SENTINEL}>— current —</option>
              {rankItems.map((it) => (
                <option key={it.rank} value={it.rank}>
                  {rankPickerLabel(it)}
                </option>
              ))}
            </select>
          </label>
          {rankCursor !== CURRENT_RANK_SENTINEL ? (
            <label className="flex items-center gap-1 text-fg-muted">
              <input
                type="checkbox"
                checked={hideDead}
                onChange={(e) => setHideDead(e.target.checked)}
                data-testid="entities-hide-dead"
              />
              Hide dead
            </label>
          ) : null}
          <label className="flex items-center gap-1 text-fg-muted">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-bg-subtle px-2 py-1 text-xs"
              data-testid="entities-sort"
            >
              <option value="name">Name</option>
              <option value="updated">Last update</option>
              <option value="appearance">First appearance</option>
            </select>
          </label>
        </div>

        {(typesQ.data ?? []).length > 0 ? (
          <div
            className="-mx-1 flex flex-wrap items-center gap-1 border-b border-border pb-1"
            data-testid="entities-type-tabs"
          >
            <TypeTab
              active={typeTab === 'all'}
              onClick={() => setTypeTab('all')}
              label="All"
              count={beforeTypeFilter.length}
              color={null}
              testid="type-tab-all"
            />
            {(typesQ.data ?? []).map((t) => {
              const c = resolveColor(t.color, t.name);
              return (
                <TypeTab
                  key={t.id}
                  active={typeTab === t.id}
                  onClick={() => setTypeTab(t.id)}
                  label={t.name}
                  count={countsByType.get(t.id) ?? 0}
                  color={c}
                  testid="type-tab"
                />
              );
            })}
          </div>
        ) : null}

        {entitiesQ.error ? (
          <p className="text-sm text-red-400" data-testid="entities-error">
            {entitiesQ.error.message}
          </p>
        ) : null}
        {createEntity.error ? (
          <p className="text-sm text-red-400" data-testid="entities-error">
            {createEntity.error.message}
          </p>
        ) : null}

        {entitiesQ.isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-fg-muted" data-testid="entities-empty">
            {(entitiesQ.data ?? []).length === 0
              ? 'No entities yet.'
              : 'No entities match the current filter.'}
          </p>
        ) : (
          <div className="space-y-4" data-testid="entities-list">
            {Array.from(groupedByType.entries()).map(([typeId, items]) => {
              const type = typesById.get(typeId);
              const color = type ? resolveColor(type.color, type.name) : null;
              return (
                <div key={typeId}>
                  {typeTab === 'all' ? (
                    <div
                      className="mb-1 text-xs uppercase tracking-wide"
                      style={color ? { color } : undefined}
                    >
                      {type?.name ?? '(unknown type)'}
                    </div>
                  ) : null}
                  <ul className="space-y-1">
                    {items.map((row) => (
                      <EntityRow
                        key={row.entity.id}
                        worldId={worldId}
                        entity={row.entity}
                        type={type}
                        snapshot={row.snapshot}
                        hasState={row.hasVersions}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <EntityTypesEditorModal
        worldId={worldId}
        open={typesModalOpen}
        onClose={() => setTypesModalOpen(false)}
      />
    </main>
  );
}

interface EntityRowProps {
  worldId: string;
  entity: Entity;
  type: EntityType | undefined;
  snapshot: Snapshot;
  hasState: boolean;
}

function EntityRow({ worldId, entity, type, snapshot, hasState }: EntityRowProps) {
  const previewFields = pickPreviewFields(type?.fields ?? []);
  return (
    <li data-testid="entity-row">
      <Link
        to="/worlds/$worldId/entities/$entityId"
        params={{ worldId, entityId: entity.id }}
        className="flex flex-col gap-1 rounded-md border border-border bg-bg-panel px-3 py-2 text-sm hover:bg-bg-subtle"
        data-testid="entity-link"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex-1">{entity.name}</span>
          {(entity.aliases?.length ?? 0) > 0 ? (
            <span className="text-xs text-fg-muted">
              aka {entity.aliases.join(', ')}
            </span>
          ) : null}
        </div>
        {previewFields.length > 0 ? (
          <div
            className="flex flex-wrap gap-x-3 text-xs text-fg-muted"
            data-testid="entity-preview"
          >
            {previewFields.map((f) => {
              const display = formatFieldValue(snapshot[f.name] ?? null);
              return (
                <span key={f.name}>
                  <span className="opacity-70">{f.name}:</span>{' '}
                  <span className={display ? '' : 'italic opacity-60'}>
                    {display ? truncate(display, 60) : hasState ? '—' : '(no version)'}
                  </span>
                </span>
              );
            })}
          </div>
        ) : null}
      </Link>
    </li>
  );
}

interface TypeTabProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color: string | null;
  testid: string;
}

function TypeTab({ active, onClick, label, count, color, testid }: TypeTabProps) {
  const style = active && color
    ? { backgroundColor: chipBgFromHex(color), borderColor: chipBorderFromHex(color), color }
    : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-md border px-2 py-1 text-xs transition-colors ' +
        (active
          ? 'border-border bg-bg-subtle text-fg'
          : 'border-transparent text-fg-muted hover:bg-bg-subtle hover:text-fg')
      }
      style={style}
      data-testid={testid}
      data-active={active ? 'true' : 'false'}
    >
      {label}
      <span className="ml-1 text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function pickPreviewFields(fields: FieldDef[]): FieldDef[] {
  const usable = fields.filter(
    (f) => (f.kind === 'string' || f.kind === 'text') && f.name !== 'alive',
  );
  return usable.slice(0, 2);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
