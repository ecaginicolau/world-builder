import { create } from 'zustand';

interface State {
  isOpen: boolean;
  worldId: string | null;
  open: (worldId: string) => void;
  close: () => void;
}

export const useGlobalSearch = create<State>((set) => ({
  isOpen: false,
  worldId: null,
  open: (worldId) => set({ isOpen: true, worldId }),
  close: () => set({ isOpen: false }),
}));
