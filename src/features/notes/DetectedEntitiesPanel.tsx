import { useEffect, useMemo, useRef, useState } from 'react';
import { useEntities, useCreateEntity } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { logNotePromotion } from '@/lib/queries/notePromotions';
import { useSession } from '@/features/auth/session';
import type { EntityCandidate } from '@/lib/llm/extract';
import type { LinkSource } from './linkSources';

interface Props {
  /** Used as the source_excerpt anchor for note_promotions logging. */
  noteIdForPromotionLog?: string;
  worldId: string;
  candidates: EntityCandidate[];
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: string;
  /** Wires tag/untag for the active parent (note or chapter). */
  source: LinkSource;
}

export function DetectedEntitiesPanel({
  noteIdForPromotionLog,
  worldId,
  candidates,
  status,
  error,
  source,
}: Props) {
  const session = useSession();
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const createEntity = useCreateEntity();
  const [pickedTypeByName, setPickedTypeByName] = useState<Record<string, string>>({});

  const taggedIds = useMemo(
    () => new Set(source.links.map((l) => l.entityId)),
    [source.links],
  );
  const typeIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of typesQ.data ?? []) m.set(t.name.toLowerCase(), t.id);
    return m;
  }, [typesQ.data]);

  // Silent auto-tag: any matched candidate not already tagged → tag it.
  // For notes we mark pinnedManually=false (AUTO badge); chapters ignore it.
  //
  // Refs are used so the effect only re-fires when `candidates` change (i.e.
  // a new extraction came in). If we depended on `source` or `taggedIds`,
  // every untag would trigger a re-render → re-fire the effect → re-tag the
  // very entity the user just untagged → infinite loop.
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const taggedIdsRef = useRef(taggedIds);
  taggedIdsRef.current = taggedIds;

  useEffect(() => {
    if (session.status !== 'authed') return;
    if (status !== 'success') return;
    if (sourceRef.current.isLoading) return;
    for (const c of candidates) {
      if (!c.matchedEntityId) continue;
      if (taggedIdsRef.current.has(c.matchedEntityId)) continue;
      sourceRef.current.tag(c.matchedEntityId, { pinnedManually: false });
    }
  }, [candidates, status, session]);

  async function onCreateAndTag(c: EntityCandidate) {
    if (session.status !== 'authed') return;
    const ownerId = session.session.user.id;
    const pickedTypeId = pickedTypeByName[c.name];
    const fallbackTypeId = typeIdByName.get(c.type.toLowerCase());
    const entityTypeId = pickedTypeId ?? fallbackTypeId;
    if (!entityTypeId) {
      window.alert(
        `Type "${c.type}" doesn't exist yet. Pick another type from the dropdown or create it in the Entities screen.`,
      );
      return;
    }
    const entity = await createEntity.mutateAsync({
      worldId,
      ownerId,
      entityTypeId,
      name: c.name,
    });
    source.tag(entity.id);
    if (noteIdForPromotionLog) {
      void logNotePromotion({
        noteId: noteIdForPromotionLog,
        ownerId,
        targetKind: 'entity',
        targetId: entity.id,
        sourceExcerpt: c.name,
      });
    }
  }

  const existingByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entitiesQ.data ?? []) m.set(e.name.toLowerCase(), e.id);
    return m;
  }, [entitiesQ.data]);
  const newCandidates = candidates.filter((c) => {
    if (c.matchedEntityId && (entitiesQ.data ?? []).some((e) => e.id === c.matchedEntityId)) {
      return false;
    }
    if (existingByName.has(c.name.toLowerCase())) return false;
    return true;
  });
  const matchedCount = candidates.length - newCandidates.length;

  if (status === 'idle' && candidates.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="detected-entities-panel"
    >
      <header className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-medium">
          Detected entities
          {status === 'pending' ? ' · scanning…' : ''}
          {status === 'success' && candidates.length > 0
            ? ` · ${matchedCount} matched, ${newCandidates.length} new`
            : ''}
        </div>
      </header>
      {status === 'error' ? (
        <p className="px-3 pb-2 text-xs text-red-400" data-testid="detected-error">
          {error ?? 'extraction failed'}
        </p>
      ) : null}
      {newCandidates.length > 0 ? (
        <ul className="space-y-1 px-3 pb-3" data-testid="detected-list">
          {newCandidates.map((c) => {
            const fallbackTypeId = typeIdByName.get(c.type.toLowerCase());
            const pickedTypeId = pickedTypeByName[c.name] ?? fallbackTypeId ?? '';
            const typeMissing = !fallbackTypeId && !pickedTypeByName[c.name];
            return (
              <li
                key={c.name}
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="detected-row"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-fg-muted">suggested: {c.type}</span>
                {typeMissing ? (
                  <select
                    value={pickedTypeId}
                    onChange={(e) =>
                      setPickedTypeByName((m) => ({ ...m, [c.name]: e.target.value }))
                    }
                    className="bg-bg-subtle px-2 py-1 text-xs"
                    data-testid="detected-type-pick"
                  >
                    <option value="">Pick type…</option>
                    {(typesQ.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => onCreateAndTag(c)}
                  disabled={createEntity.isPending}
                  className="bg-accent px-2 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
                  data-testid="detected-create"
                >
                  Create + tag
                </button>
              </li>
            );
          })}
        </ul>
      ) : status === 'success' && candidates.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-fg-muted">No candidates found.</p>
      ) : null}
    </section>
  );
}
