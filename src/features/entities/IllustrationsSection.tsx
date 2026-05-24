import { useRef, useState, type ChangeEvent } from 'react';
import {
  publicUrlFor,
  useDeleteIllustration,
  useEntityIllustrations,
  useReorderIllustrations,
  useReplaceIllustrationAsset,
  useUpdateIllustration,
  useUploadIllustration,
} from '@/lib/queries/illustrations';
import { useSession } from '@/features/auth/session';
import { useAlert, useConfirm } from '@/lib/useConfirm';
import type { EntityIllustration } from './types';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT_MIME = 'image/jpeg,image/png,image/webp,image/gif,image/avif';

interface Props {
  entityId: string;
  worldId: string;
}

export function IllustrationsSection({ entityId, worldId }: Props) {
  const session = useSession();
  const illustrationsQ = useEntityIllustrations(entityId);
  const upload = useUploadIllustration();
  const fileRef = useRef<HTMLInputElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const alertDlg = useAlert();

  const illustrations = illustrationsQ.data ?? [];
  const openIllustration = openId
    ? illustrations.find((i) => i.id === openId) ?? null
    : null;

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (session.status !== 'authed') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      await alertDlg({
        title: 'File too large',
        message: `Max 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }
    try {
      await upload.mutateAsync({
        file,
        entityId,
        worldId,
        ownerId: session.session.user.id,
      });
    } catch (err) {
      await alertDlg({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return (
    <section className="space-y-2" data-testid="illustrations-section">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-muted">
          Illustrations{' '}
          <span className="text-xs">
            ({illustrations.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="bg-bg-subtle px-2 py-1 text-xs hover:bg-bg-panel disabled:opacity-50"
          data-testid="illustration-add"
        >
          {upload.isPending ? 'Uploading…' : '+ Add image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_MIME}
          className="hidden"
          onChange={onFileChange}
          data-testid="illustration-file-input"
        />
      </div>

      {illustrations.length === 0 ? (
        <p className="rounded-md border border-border bg-bg-panel px-3 py-4 text-sm text-fg-muted">
          No illustrations yet. Click <em>+ Add image</em> to upload one.
        </p>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
          data-testid="illustration-grid"
        >
          {illustrations.map((ill) => (
            <button
              key={ill.id}
              type="button"
              onClick={() => setOpenId(ill.id)}
              className="group flex flex-col gap-1 overflow-hidden rounded-md border border-border bg-bg-panel text-left hover:border-accent/60"
              data-testid="illustration-thumb"
              data-illustration-id={ill.id}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-bg">
                <img
                  src={publicUrlFor(ill.storage_path, ill.updated_at)}
                  alt={ill.alt_text ?? ill.caption ?? ''}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              {ill.caption ? (
                <p className="line-clamp-2 px-2 pb-2 text-xs text-fg-muted">
                  {ill.caption}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {openIllustration ? (
        <IllustrationDetailModal
          illustration={openIllustration}
          allIllustrations={illustrations}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  );
}

interface DetailModalProps {
  illustration: EntityIllustration;
  allIllustrations: EntityIllustration[];
  onClose: () => void;
}

function IllustrationDetailModal({
  illustration,
  allIllustrations,
  onClose,
}: DetailModalProps) {
  const updateMut = useUpdateIllustration();
  const deleteMut = useDeleteIllustration();
  const reorderMut = useReorderIllustrations();
  const replaceMut = useReplaceIllustrationAsset();
  const confirm = useConfirm();
  const alertDlg = useAlert();
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState<string>(illustration.caption ?? '');
  const [altText, setAltText] = useState<string>(illustration.alt_text ?? '');

  async function onReplaceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      await alertDlg({
        title: 'File too large',
        message: `Max 10 MB. This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
      });
      return;
    }
    try {
      await replaceMut.mutateAsync({ illustration, file });
    } catch (err) {
      await alertDlg({
        title: 'Replace failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  const idx = allIllustrations.findIndex((i) => i.id === illustration.id);
  const canMoveUp = idx > 0;
  const canMoveDown = idx >= 0 && idx < allIllustrations.length - 1;

  function commitCaption() {
    const trimmed = caption.trim();
    const stored = (illustration.caption ?? '').trim();
    if (trimmed === stored) return;
    updateMut.mutate({ id: illustration.id, caption: trimmed || null });
  }

  function commitAlt() {
    const trimmed = altText.trim();
    const stored = (illustration.alt_text ?? '').trim();
    if (trimmed === stored) return;
    updateMut.mutate({ id: illustration.id, altText: trimmed || null });
  }

  function move(direction: -1 | 1) {
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= allIllustrations.length) return;
    const next = [...allIllustrations];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    reorderMut.mutate({
      entityId: illustration.entity_id,
      worldId: illustration.world_id,
      orderedIds: next.map((i) => i.id),
    });
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete illustration?',
      message:
        'This removes the image from the entity. Chapters that embed it will show a placeholder.',
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await deleteMut.mutateAsync({
      id: illustration.id,
      entityId: illustration.entity_id,
      worldId: illustration.world_id,
      storagePath: illustration.storage_path,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="illustration-modal"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-md border border-border bg-bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg-muted">Illustration</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg"
            aria-label="Close"
            data-testid="illustration-modal-close"
          >
            ×
          </button>
        </div>
        <div className="flex justify-center bg-bg p-2">
          <img
            src={publicUrlFor(illustration.storage_path, illustration.updated_at)}
            alt={illustration.alt_text ?? illustration.caption ?? ''}
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
        <div className="grid gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Caption</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={commitCaption}
              rows={2}
              className="w-full px-2 py-1 text-sm"
              placeholder="Optional, displayed below the image"
              data-testid="illustration-caption"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-fg-muted">Alt text</span>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              onBlur={commitAlt}
              className="w-full px-2 py-1 text-sm"
              placeholder="For screen readers"
              data-testid="illustration-alt"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={!canMoveUp || reorderMut.isPending}
              className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-40"
              data-testid="illustration-move-up"
              title="Move earlier"
            >
              ← Earlier
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              disabled={!canMoveDown || reorderMut.isPending}
              className="bg-bg-subtle px-2 py-1 hover:bg-bg-panel disabled:opacity-40"
              data-testid="illustration-move-down"
              title="Move later"
            >
              Later →
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-muted">
              {illustration.width && illustration.height
                ? `${illustration.width}×${illustration.height}`
                : ''}
              {illustration.byte_size
                ? ` · ${(illustration.byte_size / 1024).toFixed(0)} KB`
                : ''}
            </span>
            <button
              type="button"
              onClick={() => replaceFileRef.current?.click()}
              disabled={replaceMut.isPending}
              className="text-fg-muted hover:text-fg hover:underline disabled:opacity-50"
              data-testid="illustration-replace"
              title="Upload a new image to replace this one. Keeps the link in chapters."
            >
              {replaceMut.isPending ? 'Replacing…' : 'Replace…'}
            </button>
            <input
              ref={replaceFileRef}
              type="file"
              accept={ACCEPT_MIME}
              className="hidden"
              onChange={onReplaceFileChange}
              data-testid="illustration-replace-input"
            />
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteMut.isPending}
              className="text-red-400 hover:underline disabled:opacity-50"
              data-testid="illustration-delete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
