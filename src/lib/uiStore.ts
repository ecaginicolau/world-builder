import { create } from 'zustand';

interface UiState {
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  quickCaptureOpen: boolean;
  setQuickCaptureOpen: (open: boolean) => void;
  lastWorldId: string | null;
  setLastWorldId: (id: string | null) => void;
  monitoringOpen: boolean;
  setMonitoringOpen: (open: boolean) => void;
}

const LAST_WORLD_KEY = 'wb:lastWorldId';

export const useUiStore = create<UiState>((set) => ({
  chatPanelOpen: true,
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  quickCaptureOpen: false,
  setQuickCaptureOpen: (open) => set({ quickCaptureOpen: open }),
  lastWorldId:
    typeof window === 'undefined' ? null : window.localStorage.getItem(LAST_WORLD_KEY),
  setLastWorldId: (id) => {
    if (typeof window !== 'undefined') {
      if (id) window.localStorage.setItem(LAST_WORLD_KEY, id);
      else window.localStorage.removeItem(LAST_WORLD_KEY);
    }
    set({ lastWorldId: id });
  },
  monitoringOpen: false,
  setMonitoringOpen: (open) => set({ monitoringOpen: open }),
}));
