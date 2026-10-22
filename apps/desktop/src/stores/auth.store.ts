import { create } from 'zustand';
import { UserDto } from '@nightshift/shared';
import { api } from '../lib/api';

interface AuthState {
  user: UserDto | null;
  deviceId: string;
  isLoading: boolean;
  error: string | null;
  initAuth: () => Promise<void>;
  register: (displayName: string) => Promise<boolean>;
  updateDisplayName: (displayName: string) => Promise<boolean>;
  logout: () => void;
}

function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'nightshift_device_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = 'ns_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  deviceId: getOrCreateDeviceId(),
  isLoading: true,
  error: null,

  initAuth: async () => {
    set({ isLoading: true, error: null });
    const { deviceId } = get();

    try {
      const existingUser = await api.getCurrentUser(deviceId);
      if (existingUser) {
        set({ user: existingUser, isLoading: false });
      } else {
        set({ user: null, isLoading: false });
      }
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  register: async (displayName: string) => {
    set({ isLoading: true, error: null });
    const { deviceId } = get();

    try {
      const user = await api.registerUser(displayName, deviceId);
      set({ user, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to register', isLoading: false });
      return false;
    }
  },

  updateDisplayName: async (displayName: string) => {
    const { deviceId, user } = get();
    if (!user) return false;

    try {
      const updated = await api.updateProfile(displayName, deviceId);
      set({ user: updated });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to update name' });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('nightshift_device_id');
    const newDeviceId = getOrCreateDeviceId();
    set({ user: null, deviceId: newDeviceId });
  },
}));
