import { create } from 'zustand';
import { UserDto } from '@nightshift/shared';
import { api } from '../lib/api';

interface AuthState {
  user: UserDto | null;
  isLoading: boolean;
  error: string | null;
  initAuth: () => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  updateDisplayName: (displayName: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  error: null,

  initAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await api.getCurrentUser();
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  register: async (username: string, displayName: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.registerUser(username, displayName, password);
      set({ user: res.user, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Registration failed', isLoading: false });
      return false;
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.loginUser(username, password);
      set({ user: res.user, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Login failed', isLoading: false });
      return false;
    }
  },

  updateDisplayName: async (displayName: string) => {
    const { user } = get();
    if (!user) return false;

    try {
      const updated = await api.updateProfile(displayName);
      set({ user: updated });
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to update name' });
      return false;
    }
  },

  logout: () => {
    api.setToken(null);
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
