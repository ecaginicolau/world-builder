import { useEffect } from 'react';
import { useDialogStore } from '@/lib/useConfirm';

export function ConfirmDialog() {
  const request = useDialogStore((s) => s.request);
  const close = useDialogStore((s) => s.close);

  useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  if (!request) return null;

  const isAlert = request.kind === 'alert';
  const danger = !isAlert && request.danger === true;
  const okLabel = isAlert
    ? request.okLabel ?? 'OK'
    : request.confirmLabel ?? (danger ? 'Delete' : 'Confirm');
  const cancelLabel = !isAlert ? request.cancelLabel ?? 'Cancel' : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 px-4"
      role="dialog"
      aria-modal="true"
      data-testid="confirm-dialog"
      onClick={() => close(false)}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-md border border-border bg-bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold" data-testid="confirm-title">
          {request.title}
        </h3>
        {request.message ? (
          <p className="whitespace-pre-wrap text-sm text-fg-muted" data-testid="confirm-message">
            {request.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          {cancelLabel ? (
            <button
              type="button"
              onClick={() => close(false)}
              className="bg-bg-subtle px-3 py-1 text-sm hover:bg-bg"
              data-testid="confirm-cancel"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => close(true)}
            autoFocus
            className={
              'px-3 py-1 text-sm font-medium ' +
              (danger
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-accent text-accent-fg')
            }
            data-testid="confirm-ok"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
