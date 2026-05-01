import { useMemo, useState } from 'react';
import { useEntities } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { chipBgFromHex, chipBorderFromHex, resolveColor } from '@/lib/entityColors';
import type { LinkSource } from './linkSources';

interface Props {
  worldId: string;
  source: LinkSource;
}

/**
 * Renders the linked entities for a parent (note or chapter) plus a picker to
 * add more. Parent-agnostic: data + handlers come from `source`. Use
 * `useNoteLinkSource(noteId)` or `useChapterLinkSource(chapterId)`.
 */
export function LinkedEntitiesPanel({ worldId, source }: Props) {
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const typesById = useMemo(
    () => new Map((typesQ.data ?? []).map((t) => [t.id, t])),
    [typesQ.data],
  );
  const entitiesById = useMemo(
    () => new Map((entitiesQ.data ?? []).map((e) => [e.id, e])),
    [entitiesQ.data],
  );

  const taggedIds = new Set(source.links.map((l) => l.entityId));
  const linkByEntityId = new Map(source.links.map((l) => [l.entityId, l]));
  const tagged = source.links
    .map((l) => entitiesById.get(l.entityId))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const filterLower = filter.toLowerCase().trim();
  const candidates = (entitiesQ.data ?? []).filter((e) => {
    if (taggedIds.has(e.id)) return false;
    if (!filterLower) return true;
    if (e.name.toLowerCase().includes(filterLower)) return true;
    const t = typesById.get(e.entity_type_id);
    if (t && t.name.toLowerCase().includes(filterLower)) return true;
    return false;
  });

  const aggregateError = source.error || entitiesQ.error || typesQ.error;

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="linked-entities-panel"
    >
      <header className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-medium">Linked entities ({tagged.length})</div>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg"
          data-testid="entity-picker-toggle"
        >
          {pickerOpen ? 'Close' : 'Add'}
        </button>
      </header>

      {aggregateError ? (
        <p className="px-3 pb-2 text-xs text-red-400" data-testid="linked-entities-error">
          {aggregateError.message}
        </p>
      ) : null}

      {tagged.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-3 pb-2" data-testid="tagged-entities">
          {tagged.map((e) => {
            const t = typesById.get(e.entity_type_id);
            const link = linkByEntityId.get(e.id);
            const isAuto = source.trackAutoBadge && link?.pinnedManually === false;
            const color = t ? resolveColor(t.color, t.name) : null;
            return (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-full border px-2 py-1 text-xs"
                style={
                  color
                    ? {
                        backgroundColor: chipBgFromHex(color),
                        borderColor: chipBorderFromHex(color),
                      }
                    : undefined
                }
                data-testid="tagged-entity"
                data-auto={isAuto ? 'true' : 'false'}
              >
                <span>{e.name}</span>
                {t ? <span className="text-fg-muted">· {t.name}</span> : null}
                {isAuto ? (
                  <span
                    className="rounded bg-bg px-1 text-[10px] uppercase tracking-wide text-fg-muted"
                    title="Auto-tagged from extraction"
                  >
                    auto
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => source.untag(e.id)}
                  className="text-fg-muted hover:text-red-400"
                  aria-label={`Remove ${e.name}`}
                  data-testid="entity-untag"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pickerOpen ? (
        <div className="space-y-2 border-t border-border p-3" data-testid="entity-picker">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search entities…"
            className="w-full px-3 py-1 text-sm"
            data-testid="entity-picker-filter"
            autoFocus
          />
          {candidates.length === 0 ? (
            <p className="text-xs text-fg-muted">
              {entitiesQ.data && entitiesQ.data.length === 0
                ? 'No entities in this world yet.'
                : 'No matches.'}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto" data-testid="entity-picker-list">
              {candidates.slice(0, 20).map((e) => {
                const t = typesById.get(e.entity_type_id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => source.tag(e.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-bg-subtle"
                      data-testid="entity-picker-item"
                    >
                      <span>{e.name}</span>
                      {t ? (
                        <span className="text-xs text-fg-muted">{t.name}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
