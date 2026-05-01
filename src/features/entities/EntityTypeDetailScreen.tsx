import { useEffect, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useEntityType, useUpdateEntityType } from '@/lib/queries/entityTypes';
import { useEntities } from '@/lib/queries/entities';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import type { FieldDef, FieldKind } from './types';

const KINDS: FieldKind[] = ['string', 'text', 'int', 'bool'];

export function EntityTypeDetailScreen() {
  const { worldId, typeId } = useParams({ from: '/worlds/$worldId/entity-types/$typeId' });
  const typeQ = useEntityType(typeId);
  const entitiesQ = useEntities(worldId);
  const updateType = useUpdateEntityType();

  const [name, setName] = useState<string>('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!typeQ.data) return;
    setName(typeQ.data.name);
    setFields(typeQ.data.fields ?? []);
    setDirty(false);
  }, [typeQ.data]);

  if (typeQ.isLoading || !typeQ.data) {
    return (
      <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
        <p className="text-fg-muted">Loading type…</p>
      </main>
    );
  }

  const t = typeQ.data;
  const color = resolveColor(t.color, t.name);
  const usageCount =
    entitiesQ.data?.filter((e) => e.entity_type_id === t.id).length ?? 0;

  function patchField(idx: number, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function addField() {
    const baseName = `field_${fields.length + 1}`;
    setFields((prev) => [...prev, { name: baseName, kind: 'string', required: false }]);
    setDirty(true);
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  function moveField(idx: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = prev.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    setDirty(true);
  }

  function onSave() {
    const trimmedName = name.trim();
    const cleanedFields = fields
      .map((f) => ({ ...f, name: f.name.trim() }))
      .filter((f) => f.name.length > 0);
    updateType.mutate(
      {
        id: t.id,
        worldId,
        name: trimmedName || t.name,
        fields: cleanedFields,
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  function onColor(value: string) {
    updateType.mutate({ id: t.id, worldId, color: value });
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-6 py-6">
      <header>
        <Link
          to="/worlds/$worldId/entities"
          params={{ worldId }}
          className="text-sm text-fg-muted hover:text-fg"
          data-testid="back-to-entities"
        >
          ← Entities
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => onColor(e.target.value)}
            className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0"
            aria-label="Type color"
            data-testid="type-detail-color"
          />
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="bg-transparent text-2xl font-semibold tracking-tight focus:outline-none"
            data-testid="type-detail-name"
          />
          <span
            className="rounded-md border px-2 py-0.5 text-xs"
            style={{ backgroundColor: chipBgFromHex(color), borderColor: chipBorderFromHex(color) }}
          >
            {usageCount} {usageCount === 1 ? 'entity' : 'entities'}
          </span>
        </div>
      </header>

      <section className="space-y-3" data-testid="fields-section">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg-muted">Fields</h2>
          <button
            type="button"
            onClick={addField}
            className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg-panel"
            data-testid="field-add"
          >
            + Add field
          </button>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-fg-muted" data-testid="fields-empty">
            No fields yet. Add one — they appear on every entity of this type.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="fields-list">
            {fields.map((f, idx) => (
              <li
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-panel px-3 py-2"
                data-testid="field-row"
              >
                <input
                  value={f.name}
                  onChange={(e) => patchField(idx, { name: e.target.value })}
                  placeholder="field_name"
                  className="flex-1 min-w-[140px] px-2 py-1 text-sm"
                  data-testid="field-name"
                />
                <select
                  value={f.kind}
                  onChange={(e) => patchField(idx, { kind: e.target.value as FieldKind })}
                  className="bg-bg-subtle px-2 py-1 text-sm"
                  data-testid="field-kind"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-fg-muted">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => patchField(idx, { required: e.target.checked })}
                    data-testid="field-required"
                  />
                  required
                </label>
                <button
                  type="button"
                  onClick={() => moveField(idx, -1)}
                  disabled={idx === 0}
                  className="text-xs text-fg-muted hover:text-fg disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveField(idx, 1)}
                  disabled={idx === fields.length - 1}
                  className="text-xs text-fg-muted hover:text-fg disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeField(idx)}
                  className="text-xs text-fg-muted hover:text-red-400"
                  aria-label={`Remove field ${f.name}`}
                  data-testid="field-remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {updateType.error ? (
          <p className="text-sm text-red-400" data-testid="type-update-error">
            {updateType.error.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || updateType.isPending}
            className="bg-accent px-3 py-1 text-sm font-medium text-accent-fg disabled:opacity-50"
            data-testid="type-save"
          >
            {updateType.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </main>
  );
}
