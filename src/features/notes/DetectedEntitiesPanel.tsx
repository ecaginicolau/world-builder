import { useEffect, useMemo, useState } from 'react';
import { useEntities, useCreateEntity } from '@/lib/queries/entities';
import { useEntityTypes } from '@/lib/queries/entityTypes';
import { useNoteEntities, useTagEntity } from '@/lib/queries/noteEntities';
import { logNotePromotion } from '@/lib/queries/notePromotions';
import { useSession } from '@/features/auth/session';
import type { EntityCandidate } from '@/lib/llm/extract';

interface Props {
  noteId: string;
  worldId: string;
  candidates: EntityCandidate[];
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: string;
}

export function DetectedEntitiesPanel({
  noteId,
  worldId,
  candidates,
  status,
  error,
}: Props) {
  const session = useSession();
  const entitiesQ = useEntities(worldId);
  const typesQ = useEntityTypes(worldId);
  const linksQ = useNoteEntities(noteId);
  const tag = useTagEntity();
  const createEntity = useCreateEntity();
  const [pickedTypeByName, setPickedTypeByName] = useState<Record<string, string>>({});

  const taggedIds = useMemo(
    () => new Set((linksQ.data ?? []).map((l) => l.entity_id)),
    [linksQ.data],
  );
  const typeIdByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of typesQ.data ?? []) m.set(t.name.toLowerCase(), t.id);
    return m;
  }, [typesQ.data]);

  // Silent auto-tag: any matched candidate not already tagged → tag it (pinned_manually=false).
  useEffect(() => {
    if (session.status !== 'authed') return;
    if (status !== 'success') return;
    if (!linksQ.data) return;
    for (const c of candidates) {
      if (!c.matchedEntityId) continue;
      if (taggedIds.has(c.matchedEntityId)) continue;
      tag.mutate({
        noteId,
        entityId: c.matchedEntityId,
        ownerId: session.session.user.id,
        pinnedManually: false,
      });
    }
  }, [candidates, status, linksQ.data, taggedIds, session, noteId, tag]);

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
    await tag.mutateAsync({ noteId, entityId: entity.id, ownerId });
    void logNotePromotion({
      noteId,
      ownerId,
      targetKind: 'entity',
      targetId: entity.id,
      sourceExcerpt: c.name,
    });
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
