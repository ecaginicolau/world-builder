import { useMemo, useState } from 'react';
import {
  publicUrlFor,
  useWorldIllustrations,
} from '@/lib/queries/illustrations';
import { useEntities } from '@/lib/queries/entities';
import { useChapterParticipants } from '@/lib/queries/chapterParticipants';
import type { Entity } from '@/features/entities/types';

interface Props {
  worldId: string;
  chapterId: string;
  title?: string;
  onClose: () => void;
  onPick: (illustrationId: string, entityId: string) => void;
}

/**
 * Modal picker that groups all world illustrations by their entity, with
 * "in this chapter" participants surfaced first. Used both for inline
 * illustration insertion and full-page illustration page breaks.
 */
export function IllustrationPicker({
  worldId,
  chapterId,
  title = 'Pick an illustration',
  onClose,
  onPick,
}: Props) {
  const illustrationsQ = useWorldIllustrations(worldId);
  const entitiesQ = useEntities(worldId);
  const participantsQ = useChapterParticipants(chapterId);
  const [search, setSearch] = useState('');

  const entitiesById = useMemo(() => {
    const map = new Map<string, Entity>();
    for (const e of entitiesQ.data ?? []) map.set(e.id, e);
    return map;
  }, [entitiesQ.data]);

  const participantIds = useMemo(
    () => new Set((participantsQ.data ?? []).map((p) => p.entity_id)),
    [participantsQ.data],
  );

  const grouped = useMemo(() => {
    const filtered = (illustrationsQ.data ?? []).filter((ill) => {
      if (!search.trim()) return true;
      const entity = entitiesById.get(ill.entity_id);
      const haystack = [
        entity?.name ?? '',
        ill.caption ?? '',
        ill.alt_text ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
    const groups = new Map<
      string,
      { entity: Entity | null; illustrations: typeof filtered }
    >();
    for (const ill of filtered) {
      const entity = entitiesById.get(ill.entity_id) ?? null;
      const key = ill.entity_id;
      const existing = groups.get(key);
      if (existing) existing.illustrations.push(ill);
      else groups.set(key, { entity, illustrations: [ill] });
    }
    const arr = Array.from(groups.values());
    arr.sort((a, b) => {
      const aIn = a.entity && participantIds.has(a.entity.id) ? 0 : 1;
      const bIn = b.entity && participantIds.has(b.entity.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return (a.entity?.name ?? '').localeCompare(b.entity?.name ?? '');
    });
    return arr;
  }, [illustrationsQ.data, entitiesById, participantIds, search]);

  const isLoading = illustrationsQ.isLoading || entitiesQ.isLoading;
  const isEmpty =
    !isLoading && (illustrationsQ.data ?? []).length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="illustration-picker"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-md border border-border bg-bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg"
            aria-label="Close"
            data-testid="illustration-picker-close"
          >
            ×
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by entity name or caption…"
          className="w-full px-2 py-1 text-sm"
          data-testid="illustration-picker-search"
        />
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-fg-muted">Loading…</p>
          ) : isEmpty ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              No illustrations yet. Add some on an entity's detail page first.
            </p>
          ) : grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg-muted">
              No matches for "{search}".
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => {
                const isParticipant =
                  group.entity && participantIds.has(group.entity.id);
                return (
                  <section
                    key={group.entity?.id ?? 'orphan'}
                    data-testid="illustration-picker-group"
                    data-entity-id={group.entity?.id ?? ''}
                  >
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                      {group.entity?.name ?? 'Unknown entity'}
                      {isParticipant ? (
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-normal text-accent">
                          in this chapter
                        </span>
                      ) : null}
                    </h4>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {group.illustrations.map((ill) => (
                        <button
                          key={ill.id}
                          type="button"
                          onClick={() => onPick(ill.id, ill.entity_id)}
                          className="group flex flex-col gap-1 overflow-hidden rounded border border-border bg-bg text-left hover:border-accent/60"
                          data-testid="illustration-picker-pick"
                          data-illustration-id={ill.id}
                          title={ill.caption ?? ''}
                        >
                          <div className="aspect-[4/3] w-full overflow-hidden">
                            <img
                              src={publicUrlFor(ill.storage_path, ill.updated_at)}
                              alt={ill.alt_text ?? ill.caption ?? ''}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          </div>
                          {ill.caption ? (
                            <p className="line-clamp-1 px-1 pb-1 text-[10px] text-fg-muted">
                              {ill.caption}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
