import { useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useWorld } from '@/lib/queries/worlds';
import { useSession } from '@/features/auth/session';
import {
  useCreateEntityType,
  useDeleteEntityType,
  useEntityTypes,
} from '@/lib/queries/entityTypes';
import {
  useCreateEntity,
  useDeleteEntity,
  useEntities,
  useUpdateEntity,
} from '@/lib/queries/entities';
import type { Entity, EntityType } from './types';

export function EntitiesScreen() {
  const { worldId } = useParams({ from: '/worlds/$worldId/entities' });
  const session = useSession();
  const worldQ = useWorld(worldId);
  const typesQ = useEntityTypes(worldId);
  const entitiesQ = useEntities(worldId);
  const createType = useCreateEntityType();
  const deleteType = useDeleteEntityType();
  const createEntity = useCreateEntity();
  const updateEntity = useUpdateEntity();
  const deleteEntity = useDeleteEntity();

  const [newTypeName, setNewTypeName] = useState('');
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityTypeId, setNewEntityTypeId] = useState<string>('');
  const [editing, setEditing] = useState<{ id: string; name: string; entity_type_id: string } | null>(
    null,
  );

  async function onAddType(e: FormEvent) {
    e.preventDefault();
    if (!newTypeName.trim() || session.status !== 'authed') return;
    await createType.mutateAsync({
      worldId,
      ownerId: session.session.user.id,
      name: newTypeName.trim(),
    });
    setNewTypeName('');
  }

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

  function onDeleteType(t: EntityType) {
    const used = entitiesQ.data?.some((e) => e.entity_type_id === t.id);
    if (used) {
      window.alert(
        `Cannot delete type "${t.name}" — entities of this type still exist. Delete them first.`,
      );
      return;
    }
    if (!window.confirm(`Delete type "${t.name}"?`)) return;
    deleteType.mutate({ id: t.id, worldId });
  }

  function onDeleteEntity(e: Entity) {
    if (!window.confirm(`Delete entity "${e.name}"?`)) return;
    deleteEntity.mutate({ id: e.id, worldId });
  }

  function onSaveEdit() {
    if (!editing) return;
    updateEntity.mutate(
      {
        id: editing.id,
        worldId,
        name: editing.name,
        entityTypeId: editing.entity_type_id,
      },
      { onSuccess: () => setEditing(null) },
    );
  }

  const typesById = new Map((typesQ.data ?? []).map((t) => [t.id, t]));
  const entitiesByType = new Map<string, Entity[]>();
  for (const e of entitiesQ.data ?? []) {
    const list = entitiesByType.get(e.entity_type_id) ?? [];
    list.push(e);
    entitiesByType.set(e.entity_type_id, list);
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <Link
          to="/worlds/$worldId"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-world"
        >
          ← {worldQ.data?.name ?? 'World'}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Entities</h1>
      </header>

      <section className="space-y-3" data-testid="types-section">
        <h2 className="text-sm font-semibold text-fg-muted">Entity types</h2>
        <form onSubmit={onAddType} className="flex gap-2" data-testid="create-type-form">
          <input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder="e.g. Character, Location, Faction…"
            className="flex-1 px-3 py-2 text-sm"
            data-testid="create-type-name"
          />
          <button
            type="submit"
            disabled={createType.isPending || !newTypeName.trim()}
            className="bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
            data-testid="create-type-submit"
          >
            Add
          </button>
        </form>
        {typesQ.error ? (
          <p className="text-sm text-red-400" data-testid="types-error">
            {typesQ.error.message}
          </p>
        ) : null}
        {createType.error ? (
          <p className="text-sm text-red-400" data-testid="types-error">
            {createType.error.message}
          </p>
        ) : null}
        {typesQ.isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : typesQ.data && typesQ.data.length > 0 ? (
          <ul className="flex flex-wrap gap-2" data-testid="types-list">
            {typesQ.data.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-md border border-border bg-bg-panel px-3 py-1 text-sm"
                data-testid="type-chip"
              >
                <span>{t.name}</span>
                <button
                  type="button"
                  onClick={() => onDeleteType(t)}
                  className="text-xs text-fg-muted hover:text-red-400"
                  aria-label={`Delete type ${t.name}`}
                  data-testid="type-delete"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : typesQ.data ? (
          <p className="text-sm text-fg-muted" data-testid="types-empty">
            No types yet. Add one to start creating entities.
          </p>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="entities-section">
        <h2 className="text-sm font-semibold text-fg-muted">Entities</h2>
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
          <p className="text-sm text-fg-muted">Add a type above first.</p>
        )}
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
        ) : entitiesQ.data && entitiesQ.data.length === 0 ? (
          <p className="text-sm text-fg-muted" data-testid="entities-empty">
            No entities yet.
          </p>
        ) : entitiesQ.data ? (
          <div className="space-y-4" data-testid="entities-list">
            {Array.from(entitiesByType.entries()).map(([typeId, items]) => {
              const type = typesById.get(typeId);
              return (
                <div key={typeId}>
                  <div className="mb-1 text-xs uppercase tracking-wide text-fg-muted">
                    {type?.name ?? '(unknown type)'}
                  </div>
                  <ul className="space-y-1">
                    {items.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-panel px-3 py-2 text-sm"
                        data-testid="entity-row"
                      >
                        {editing?.id === e.id ? (
                          <>
                            <input
                              value={editing.name}
                              onChange={(ev) =>
                                setEditing({ ...editing, name: ev.target.value })
                              }
                              className="flex-1 px-2 py-1 text-sm"
                              data-testid="entity-edit-name"
                            />
                            <select
                              value={editing.entity_type_id}
                              onChange={(ev) =>
                                setEditing({ ...editing, entity_type_id: ev.target.value })
                              }
                              className="bg-bg-subtle px-2 py-1 text-sm"
                              data-testid="entity-edit-type"
                            >
                              {typesQ.data?.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={onSaveEdit}
                              className="bg-accent px-2 py-1 text-xs font-medium text-accent-fg"
                              data-testid="entity-save"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="text-xs text-fg-muted hover:text-fg"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1">{e.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setEditing({
                                  id: e.id,
                                  name: e.name,
                                  entity_type_id: e.entity_type_id,
                                })
                              }
                              className="text-xs text-fg-muted hover:text-fg"
                              data-testid="entity-edit"
                            >
                              edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteEntity(e)}
                              className="text-xs text-fg-muted hover:text-red-400"
                              data-testid="entity-delete"
                            >
                              delete
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
