import { useCallback, useMemo } from 'react';
import { useSession } from '@/features/auth/session';
import {
  useNoteEntities,
  useTagEntity,
  useUntagEntity,
} from '@/lib/queries/noteEntities';
import {
  useChapterParticipants,
  useLinkChapterEntity,
  useUnlinkChapterEntity,
} from '@/lib/queries/chapterParticipants';

/**
 * Generic shape of a "linked entity" link, used by LinkedEntitiesPanel and
 * DetectedEntitiesPanel. `pinnedManually` is optional — only notes track it
 * (used to display the AUTO badge on auto-tagged entities). Chapters don't.
 */
export interface EntityLink {
  entityId: string;
  pinnedManually?: boolean;
}

export interface LinkSource {
  links: EntityLink[];
  isLoading: boolean;
  error: Error | null;
  /** Called when the UI wants to add a link manually (or auto, see pinnedManually). */
  tag: (entityId: string, opts?: { pinnedManually?: boolean }) => void;
  untag: (entityId: string) => void;
  /** True if `pinnedManually` is meaningful for this source (notes only). */
  trackAutoBadge: boolean;
}

export function useNoteLinkSource(noteId: string): LinkSource {
  const session = useSession();
  const linksQ = useNoteEntities(noteId);
  const tagM = useTagEntity();
  const untagM = useUntagEntity();

  const ownerId = session.status === 'authed' ? session.session.user.id : null;
  const links = useMemo(
    () =>
      (linksQ.data ?? []).map((l) => ({
        entityId: l.entity_id,
        pinnedManually: l.pinned_manually,
      })),
    [linksQ.data],
  );
  const tag = useCallback(
    (entityId: string, opts?: { pinnedManually?: boolean }) => {
      if (!ownerId) return;
      tagM.mutate({
        noteId,
        entityId,
        ownerId,
        pinnedManually: opts?.pinnedManually ?? true,
      });
    },
    [noteId, ownerId, tagM],
  );
  const untag = useCallback(
    (entityId: string) => untagM.mutate({ noteId, entityId }),
    [noteId, untagM],
  );

  return useMemo<LinkSource>(
    () => ({
      links,
      isLoading: linksQ.isLoading,
      error: linksQ.error ?? null,
      tag,
      untag,
      trackAutoBadge: true,
    }),
    [links, linksQ.isLoading, linksQ.error, tag, untag],
  );
}

export function useChapterLinkSource(chapterId: string): LinkSource {
  const session = useSession();
  const linksQ = useChapterParticipants(chapterId);
  const linkM = useLinkChapterEntity();
  const unlinkM = useUnlinkChapterEntity();

  const ownerId = session.status === 'authed' ? session.session.user.id : null;
  const links = useMemo(
    () => (linksQ.data ?? []).map((l) => ({ entityId: l.entity_id })),
    [linksQ.data],
  );
  const tag = useCallback(
    (entityId: string) => {
      if (!ownerId) return;
      linkM.mutate({ chapterId, entityId, ownerId });
    },
    [chapterId, ownerId, linkM],
  );
  const untag = useCallback(
    (entityId: string) => unlinkM.mutate({ chapterId, entityId }),
    [chapterId, unlinkM],
  );

  return useMemo<LinkSource>(
    () => ({
      links,
      isLoading: linksQ.isLoading,
      error: linksQ.error ?? null,
      tag,
      untag,
      trackAutoBadge: false,
    }),
    [links, linksQ.isLoading, linksQ.error, tag, untag],
  );
}
