import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useSession } from '@/features/auth/session';
import { useAlert, useConfirm } from '@/lib/useConfirm';
import {
  useCreateEntityType,
  useDeleteEntityType,
  useEntityTypes,
} from '@/lib/queries/entityTypes';
import { useEntities } from '@/lib/queries/entities';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import type { EntityType } from './types';

interface Props {
  worldId: string;
  open: boolean;
  onClose: () => void;
}

export function EntityTypesEditorModal({ worldId, open, onClose }: Props) {
  const session = useSession();
  const typesQ = useEntityTypes(worldId);
  const entitiesQ = useEntities(worldId);
  const createType = useCreateEntityType();
  const deleteType = useDeleteEntityType();
  const confirm = useConfirm();
  const alert = useAlert();

  const [newTypeName, setNewTypeName] = useState('');

  if (!open) return null;

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

  async function onDeleteType(t: EntityType) {
    const used = entitiesQ.data?.some((e) => e.entity_type_id === t.id);
    if (used) {
      await alert({
        title: `Can't delete type "${t.name}"`,
        message: 'Entities of this type still exist. Delete them first.',
      });
      return;
    }
    const ok = await confirm({ title: `Delete type "${t.name}"?`, danger: true });
    if (!ok) return;
    deleteType.mutate({ id: t.id, worldId });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4"
      data-testid="entity-types-modal"
    >
      <div className="w-full max-w-lg space-y-4 rounded-md border border-border bg-bg-panel p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Entity types</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-fg-muted hover:text-fg"
            aria-label="Close"
            data-testid="entity-types-modal-close"
          >
            ×
          </button>
        </header>
        <p className="text-xs text-fg-muted">
          Types group entities (e.g. Character, Location) and define their fields.
        </p>

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
            {typesQ.data.map((t) => {
              const color = resolveColor(t.color, t.name);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm"
                  style={{
                    backgroundColor: chipBgFromHex(color),
                    borderColor: chipBorderFromHex(color),
                  }}
                  data-testid="type-chip"
                >
                  <Link
                    to="/worlds/$worldId/entity-types/$typeId"
                    params={{ worldId, typeId: t.id }}
                    onClick={onClose}
                    className="hover:underline"
                    data-testid="type-link"
                  >
                    {t.name}
                  </Link>
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
              );
            })}
          </ul>
        ) : typesQ.data ? (
          <p className="text-sm text-fg-muted" data-testid="types-empty">
            No types yet. Add one to start creating entities.
          </p>
        ) : null}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            data-testid="entity-types-modal-done"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
