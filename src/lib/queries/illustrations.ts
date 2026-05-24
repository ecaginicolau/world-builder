import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EntityIllustration } from '@/features/entities/types';

export const illustrationsKeys = {
  byEntity: (entityId: string) => ['illustrations', 'byEntity', entityId] as const,
  byWorld: (worldId: string) => ['illustrations', 'byWorld', worldId] as const,
  byIds: (ids: string[]) =>
    ['illustrations', 'byIds', [...ids].sort().join(',')] as const,
  detail: (id: string) => ['illustration', 'detail', id] as const,
};

export const ILLUSTRATIONS_BUCKET = 'illustrations';

export function publicUrlFor(storagePath: string, version?: string | null): string {
  const base = supabase.storage.from(ILLUSTRATIONS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
  if (!version) return base;
  // Cache-bust when the row has been updated (e.g. asset replaced). Storage
  // serves with cacheControl: 31536000, so the URL alone wouldn't refresh.
  const v = Date.parse(version);
  if (Number.isNaN(v)) return base;
  return `${base}${base.includes('?') ? '&' : '?'}v=${v}`;
}

export function useEntityIllustrations(entityId: string) {
  return useQuery<EntityIllustration[], Error>({
    queryKey: illustrationsKeys.byEntity(entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_illustrations')
        .select('*')
        .eq('entity_id', entityId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityIllustration[];
    },
    enabled: !!entityId,
  });
}

export function useWorldIllustrations(worldId: string) {
  return useQuery<EntityIllustration[], Error>({
    queryKey: illustrationsKeys.byWorld(worldId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entity_illustrations')
        .select('*')
        .eq('world_id', worldId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as EntityIllustration[];
    },
    enabled: !!worldId,
  });
}

export function useIllustration(id: string | null | undefined) {
  return useQuery<EntityIllustration | null, Error>({
    queryKey: illustrationsKeys.detail(id ?? ''),
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('entity_illustrations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EntityIllustration | null;
    },
    enabled: !!id,
  });
}

export function useIllustrationsByIds(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery<EntityIllustration[], Error>({
    queryKey: illustrationsKeys.byIds(sorted),
    queryFn: async () => {
      if (sorted.length === 0) return [];
      const { data, error } = await supabase
        .from('entity_illustrations')
        .select('*')
        .in('id', sorted);
      if (error) throw error;
      return (data ?? []) as EntityIllustration[];
    },
    enabled: sorted.length > 0,
  });
}

interface ImageDimensions {
  width: number;
  height: number;
}

async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function extensionForMime(mime: string, fallback = 'bin'): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/avif') return 'avif';
  return fallback;
}

export function useUploadIllustration() {
  const qc = useQueryClient();
  return useMutation<
    EntityIllustration,
    Error,
    {
      file: File;
      entityId: string;
      worldId: string;
      ownerId: string;
      caption?: string | null;
      altText?: string | null;
    }
  >({
    mutationFn: async ({ file, entityId, worldId, ownerId, caption, altText }) => {
      const dimensions = await readImageDimensions(file);
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ext = extensionForMime(file.type, file.name.split('.').pop() ?? 'bin');
      const storagePath = `${worldId}/${entityId}/${id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(ILLUSTRATIONS_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
          cacheControl: '31536000',
        });
      if (uploadErr) throw uploadErr;
      const { data, error } = await supabase
        .from('entity_illustrations')
        .insert({
          entity_id: entityId,
          world_id: worldId,
          owner_id: ownerId,
          storage_path: storagePath,
          caption: caption ?? null,
          alt_text: altText ?? null,
          mime_type: file.type || 'application/octet-stream',
          byte_size: file.size,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          display_order: 0,
        })
        .select('*')
        .single();
      if (error) {
        // Best-effort cleanup: row insert failed, drop the orphan blob.
        await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([storagePath]);
        throw error;
      }
      return data as EntityIllustration;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byEntity(row.entity_id) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byWorld(row.world_id) });
    },
  });
}

/**
 * Replace the binary asset behind an existing illustration row, preserving
 * the row id (so chapter references via `data-illustration-id="…"` and
 * `chapters.opening_illustration_id` keep resolving).
 *
 * Strategy: upload the new file at the same `storage_path` with upsert,
 * then update the row's metadata (mime/size/dimensions). The row's
 * `updated_at` is bumped by the trigger and used as a cache-buster on
 * `publicUrlFor`.
 */
export function useReplaceIllustrationAsset() {
  const qc = useQueryClient();
  return useMutation<
    EntityIllustration,
    Error,
    { illustration: EntityIllustration; file: File | Blob; mimeType?: string }
  >({
    mutationFn: async ({ illustration, file, mimeType }) => {
      const contentType =
        mimeType || (file instanceof File ? file.type : '') || illustration.mime_type;
      const dimensions =
        file instanceof File ? await readImageDimensions(file) : null;
      const byteSize = file instanceof Blob ? file.size : null;
      const { error: uploadErr } = await supabase.storage
        .from(ILLUSTRATIONS_BUCKET)
        .upload(illustration.storage_path, file, {
          contentType: contentType || 'application/octet-stream',
          upsert: true,
          cacheControl: '31536000',
        });
      if (uploadErr) throw uploadErr;
      const patch: Record<string, unknown> = {
        mime_type: contentType || 'application/octet-stream',
      };
      if (byteSize !== null) patch.byte_size = byteSize;
      if (dimensions) {
        patch.width = dimensions.width;
        patch.height = dimensions.height;
      }
      const { data, error } = await supabase
        .from('entity_illustrations')
        .update(patch)
        .eq('id', illustration.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityIllustration;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byEntity(row.entity_id) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byWorld(row.world_id) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.detail(row.id) });
    },
  });
}

export function useUpdateIllustration() {
  const qc = useQueryClient();
  return useMutation<
    EntityIllustration,
    Error,
    {
      id: string;
      caption?: string | null;
      altText?: string | null;
      displayOrder?: number;
    }
  >({
    mutationFn: async ({ id, caption, altText, displayOrder }) => {
      const patch: Record<string, unknown> = {};
      if (caption !== undefined) patch.caption = caption;
      if (altText !== undefined) patch.alt_text = altText;
      if (displayOrder !== undefined) patch.display_order = displayOrder;
      const { data, error } = await supabase
        .from('entity_illustrations')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as EntityIllustration;
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byEntity(row.entity_id) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byWorld(row.world_id) });
    },
  });
}

export function useDeleteIllustration() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; entityId: string; worldId: string },
    Error,
    { id: string; entityId: string; worldId: string; storagePath: string }
  >({
    mutationFn: async ({ id, entityId, worldId, storagePath }) => {
      // Delete the row first; if the row delete fails (e.g. RLS), we keep the
      // blob — easier than the reverse (deleted blob, row left behind).
      const { error } = await supabase.from('entity_illustrations').delete().eq('id', id);
      if (error) throw error;
      // Best-effort blob cleanup. If it errors (e.g. already gone), ignore.
      await supabase.storage.from(ILLUSTRATIONS_BUCKET).remove([storagePath]);
      return { id, entityId, worldId };
    },
    onSuccess: ({ entityId, worldId }) => {
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byEntity(entityId) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byWorld(worldId) });
    },
  });
}

export function useReorderIllustrations() {
  const qc = useQueryClient();
  return useMutation<
    void,
    Error,
    { entityId: string; worldId: string; orderedIds: string[] }
  >({
    mutationFn: async ({ orderedIds }) => {
      // Sequential updates — small N (<10 expected). Could batch via rpc later.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await supabase
          .from('entity_illustrations')
          .update({ display_order: i })
          .eq('id', orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: (_, { entityId, worldId }) => {
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byEntity(entityId) });
      void qc.invalidateQueries({ queryKey: illustrationsKeys.byWorld(worldId) });
    },
  });
}
