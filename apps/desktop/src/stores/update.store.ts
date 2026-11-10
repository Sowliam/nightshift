import { create } from 'zustand';

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error' | 'dev';

export interface UpdateStatus {
  state: UpdatePhase;
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
}

interface UpdateStore {
  status: UpdateStatus;
  apply: (status: UpdateStatus) => void;
  check: () => Promise<void>;
  install: () => Promise<void>;
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  status: { state: 'idle' },
  apply: (status) => set({ status }),
  check: async () => {
    set({ status: { state: 'checking' } });
    try {
      await window.nightshift?.checkForUpdate?.();
    } catch {
      set({ status: { state: 'error', message: 'Could not check for an update.' } });
    }
  },
  install: async () => {
    await window.nightshift?.installUpdate?.();
  },
}));

export function bindUpdateStatus() {
  return window.nightshift?.onUpdateStatus?.((status) => {
    useUpdateStore.getState().apply(status);
  });
}
