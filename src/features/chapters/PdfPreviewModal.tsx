import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Callback that produces the PDF blob asynchronously. Invoked exactly
   * once when the modal mounts — even if the parent re-renders and passes a
   * new function reference, we don't restart the build (otherwise an
   * unrelated parent re-render would cancel an in-flight build and start a
   * new one, which can race and surface a stale blob). The reference is held
   * via ref so the latest closure is used, but never re-invoked. */
  buildBlob: () => Promise<Blob>;
  onClose: () => void;
  title?: string;
}

/**
 * Full-screen modal that renders a generated PDF inline via an `<iframe>`
 * pointing at the blob URL. Lets authors iterate on layout (page breaks,
 * illustrations, margins, fonts…) without round-tripping through Adobe
 * Reader. The browser's built-in PDF viewer is plenty for typography review.
 *
 * The blob is built asynchronously on mount; the URL is revoked on unmount.
 */
export function PdfPreviewModal({ buildBlob, onClose, title = 'PDF preview' }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Hold the latest buildBlob callback in a ref so we don't depend on its
  // identity in the effect below. The effect runs exactly once per mount.
  const buildBlobRef = useRef(buildBlob);
  buildBlobRef.current = buildBlob;

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    const t0 = performance.now();
    buildBlobRef
      .current()
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
        setElapsedMs(Math.round(performance.now() - t0));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // Mount-only: parent re-renders should NOT restart the build. The modal's
    // identity is the user's intent ("preview this thing now"); we render
    // whatever was current when the modal opened.
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4"
      onClick={onClose}
      data-testid="pdf-preview-modal"
    >
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {elapsedMs !== null ? (
              <span className="text-[10px] text-fg-muted">
                rendered in {elapsedMs}ms
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {url ? (
              <a
                href={url}
                download={`${title.replace(/[^A-Za-z0-9\s\-_.]/g, '_').trim()}.pdf`}
                className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-fg-muted hover:text-fg"
                data-testid="pdf-preview-download"
              >
                Download
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="text-fg-muted hover:text-fg"
              aria-label="Close"
              data-testid="pdf-preview-close"
            >
              ×
            </button>
          </div>
        </header>
        <div className="relative flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-400">
              <pre className="whitespace-pre-wrap">{error}</pre>
            </div>
          ) : url ? (
            <iframe
              src={url}
              className="h-full w-full bg-neutral-900"
              title={title}
              data-testid="pdf-preview-iframe"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-fg-muted">
              Generating PDF…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
