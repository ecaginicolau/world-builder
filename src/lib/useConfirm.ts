import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: string;
  okLabel?: string;
}

type Request =
  | ({ kind: 'confirm' } & ConfirmOptions)
  | ({ kind: 'alert' } & AlertOptions);

interface DialogStore {
  request: Request | null;
  resolve: ((v: boolean) => void) | null;
  open: (req: Request) => Promise<boolean>;
  close: (value: boolean) => void;
}

export const useDialogStore = create<DialogStore>((set, get) => ({
  request: null,
  resolve: null,
  open: (req) =>
    new Promise<boolean>((resolve) => {
      const existing = get().resolve;
      if (existing) existing(false);
      set({ request: req, resolve });
    }),
  close: (value) => {
    const r = get().resolve;
    if (r) r(value);
    set({ request: null, resolve: null });
  },
}));

/** Returns a function that opens a themed confirm dialog. Resolves to true on OK, false on Cancel. */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const open = useDialogStore((s) => s.open);
  return (opts) => open({ kind: 'confirm', ...opts });
}

/** Returns a function that opens a themed alert dialog (OK only). */
export function useAlert(): (opts: AlertOptions) => Promise<void> {
  const open = useDialogStore((s) => s.open);
  return async (opts) => {
    await open({ kind: 'alert', ...opts });
  };
}
