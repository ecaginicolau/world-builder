import { useMemo, useState } from 'react';
import { useChaptersByWorld, usePrefaceByBook } from '@/lib/queries/chapters';
import { usePartsByBook } from '@/lib/queries/parts';
import { fetchVersionsByIds } from '@/lib/queries/chapterVersions';
import {
  publicUrlFor,
  useReplaceIllustrationAsset,
} from '@/lib/queries/illustrations';
import { supabase } from '@/lib/supabase';
import { extractIllustrationIds } from '@/lib/illustrationHydration';
import { useAlert, useConfirm } from '@/lib/useConfirm';
import type { EntityIllustration } from '@/features/entities/types';

interface Props {
  bookId: string;
  worldId: string;
}

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'ready'; illustrations: EntityIllustration[] }
  | { kind: 'error'; message: string };

type ApplyState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number; current: string }
  | { kind: 'done'; ok: number; failed: { id: string; reason: string }[] };

export function BrightenIllustrationsPanel({ bookId, worldId }: Props) {
  const partsQ = usePartsByBook(bookId);
  const prefaceQ = usePrefaceByBook(bookId);
  const worldChaptersQ = useChaptersByWorld(worldId);
  const replaceMut = useReplaceIllustrationAsset();
  const confirm = useConfirm();
  const alertDlg = useAlert();

  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
  const [apply, setApply] = useState<ApplyState>({ kind: 'idle' });
  const [brightness, setBrightness] = useState<number>(130);
  const [contrast, setContrast] = useState<number>(110);

  const filterCss = `brightness(${brightness / 100}) contrast(${contrast / 100})`;

  async function onScan() {
    setScan({ kind: 'scanning' });
    setApply({ kind: 'idle' });
    try {
      const parts = partsQ.data ?? [];
      const allChapters = worldChaptersQ.data ?? [];
      const preface = prefaceQ.data ?? null;
      const partIds = new Set(parts.map((p) => p.id));

      // Collect final version IDs for the book's chapters + preface.
      const bookChapters = allChapters.filter(
        (c) =>
          (c.part_id && partIds.has(c.part_id)) ||
          (c.is_preface && c.book_id === bookId),
      );
      const versionIds = bookChapters
        .map((c) => c.final_version_id)
        .filter((x): x is string => !!x);
      const versions = await fetchVersionsByIds(versionIds);
      const textByVersion = new Map(versions.map((v) => [v.id, v.text]));

      const illustrationIds = new Set<string>();
      for (const c of bookChapters) {
        if (c.opening_illustration_id) illustrationIds.add(c.opening_illustration_id);
        if (c.chapter_header)
          for (const id of extractIllustrationIds(c.chapter_header)) illustrationIds.add(id);
        if (c.chapter_footer)
          for (const id of extractIllustrationIds(c.chapter_footer)) illustrationIds.add(id);
        const text = c.final_version_id ? textByVersion.get(c.final_version_id) : null;
        if (text) for (const id of extractIllustrationIds(text)) illustrationIds.add(id);
      }
      // Sanity touch for unused-warning on preface (already covered via bookChapters).
      void preface;

      if (illustrationIds.size === 0) {
        setScan({ kind: 'ready', illustrations: [] });
        return;
      }

      const { data, error } = await supabase
        .from('entity_illustrations')
        .select('*')
        .in('id', Array.from(illustrationIds));
      if (error) throw error;
      setScan({
        kind: 'ready',
        illustrations: (data ?? []) as EntityIllustration[],
      });
    } catch (err) {
      setScan({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Scan failed',
      });
    }
  }

  const sample = useMemo<EntityIllustration | null>(() => {
    if (scan.kind !== 'ready' || scan.illustrations.length === 0) return null;
    return scan.illustrations[0];
  }, [scan]);

  async function onApply() {
    if (scan.kind !== 'ready' || scan.illustrations.length === 0) return;
    const ok = await confirm({
      title: `Re-process ${scan.illustrations.length} illustration${scan.illustrations.length > 1 ? 's' : ''}?`,
      message: `Brightness ${brightness}% · Contrast ${contrast}%. Each illustration's stored file will be replaced with a brightened version. Links in chapters stay intact. This cannot be undone — keep your originals if you want to revert.`,
      confirmLabel: 'Apply to all',
    });
    if (!ok) return;

    const list = scan.illustrations;
    const failed: { id: string; reason: string }[] = [];
    setApply({ kind: 'running', done: 0, total: list.length, current: list[0].id });
    for (let i = 0; i < list.length; i++) {
      const ill = list[i];
      setApply({ kind: 'running', done: i, total: list.length, current: ill.id });
      try {
        const blob = await downloadOriginal(ill.storage_path);
        const out = await processImage(blob, brightness, contrast, ill.mime_type);
        await replaceMut.mutateAsync({
          illustration: ill,
          file: out,
          mimeType: out.type,
        });
      } catch (err) {
        failed.push({
          id: ill.id,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    setApply({ kind: 'done', ok: list.length - failed.length, failed });
    if (failed.length > 0) {
      await alertDlg({
        title: `Done with ${failed.length} failure${failed.length > 1 ? 's' : ''}`,
        message: `${list.length - failed.length} of ${list.length} succeeded. Failures: ${failed
          .map((f) => f.id)
          .join(', ')}`,
      });
    }
  }

  return (
    <section
      className="rounded-md border border-border bg-bg-panel"
      data-testid="brighten-illustrations-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Brighten illustrations</span>
        <span className="text-xs text-fg-muted">
          Bulk-adjust the printed brightness/contrast of every illustration used in this book.
        </span>
      </header>

      <div className="space-y-3 p-3 text-sm">
        {scan.kind === 'idle' ? (
          <button
            type="button"
            onClick={() => void onScan()}
            className="bg-bg-subtle px-3 py-1.5 text-sm hover:bg-bg-panel"
            data-testid="brighten-scan"
          >
            Scan illustrations used in this book
          </button>
        ) : null}

        {scan.kind === 'scanning' ? (
          <p className="text-fg-muted">Scanning…</p>
        ) : null}

        {scan.kind === 'error' ? (
          <p className="text-red-400" data-testid="brighten-error">
            {scan.message}
          </p>
        ) : null}

        {scan.kind === 'ready' ? (
          <>
            <p className="text-fg-muted" data-testid="brighten-count">
              {scan.illustrations.length === 0
                ? 'No illustrations referenced by this book.'
                : `${scan.illustrations.length} illustration${
                    scan.illustrations.length > 1 ? 's' : ''
                  } used by this book. Replacing the asset will affect every place the same illustration appears.`}
            </p>

            {scan.illustrations.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <div className="flex justify-between text-xs text-fg-muted">
                      <span>Brightness</span>
                      <span>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={1}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full"
                      data-testid="brighten-brightness"
                    />
                  </label>
                  <label className="block space-y-1">
                    <div className="flex justify-between text-xs text-fg-muted">
                      <span>Contrast</span>
                      <span>{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={1}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full"
                      data-testid="brighten-contrast"
                    />
                  </label>
                </div>

                {sample ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <figure className="flex flex-col items-center gap-1">
                      <figcaption className="text-[10px] uppercase tracking-wider text-fg-muted">
                        Before
                      </figcaption>
                      <img
                        src={publicUrlFor(sample.storage_path, sample.updated_at)}
                        alt=""
                        className="max-h-48 w-full rounded border border-border object-contain"
                      />
                    </figure>
                    <figure className="flex flex-col items-center gap-1">
                      <figcaption className="text-[10px] uppercase tracking-wider text-fg-muted">
                        After (preview)
                      </figcaption>
                      <img
                        src={publicUrlFor(sample.storage_path, sample.updated_at)}
                        alt=""
                        className="max-h-48 w-full rounded border border-border object-contain"
                        style={{ filter: filterCss }}
                        data-testid="brighten-preview"
                      />
                    </figure>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void onApply()}
                    disabled={apply.kind === 'running'}
                    className="bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
                    data-testid="brighten-apply"
                  >
                    {apply.kind === 'running'
                      ? `Applying ${apply.done + 1}/${apply.total}…`
                      : `Apply to ${scan.illustrations.length} illustration${
                          scan.illustrations.length > 1 ? 's' : ''
                        }`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onScan()}
                    disabled={apply.kind === 'running'}
                    className="text-xs text-fg-muted hover:text-fg disabled:opacity-50"
                    data-testid="brighten-rescan"
                  >
                    Rescan
                  </button>
                  {apply.kind === 'done' ? (
                    <span className="text-xs text-fg-muted" data-testid="brighten-result">
                      Done — {apply.ok} succeeded
                      {apply.failed.length > 0 ? `, ${apply.failed.length} failed` : ''}.
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

async function downloadOriginal(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from('illustrations')
    .download(storagePath);
  if (error) throw error;
  if (!data) throw new Error('Empty download');
  return data;
}

async function processImage(
  srcBlob: Blob,
  brightness: number,
  contrast: number,
  originalMime: string,
): Promise<Blob> {
  const url = URL.createObjectURL(srcBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context unavailable');
    ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100})`;
    ctx.drawImage(img, 0, 0);
    // Keep PNG transparency if the source was PNG; otherwise JPEG at 0.92 for size.
    const outMime = originalMime === 'image/png' ? 'image/png' : 'image/jpeg';
    const quality = outMime === 'image/jpeg' ? 0.92 : undefined;
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        outMime,
        quality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
