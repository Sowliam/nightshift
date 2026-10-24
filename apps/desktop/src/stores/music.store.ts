import { create } from 'zustand';
import { MusicSessionDto, ServerBotDto, ConfigureBotInput } from '@nightshift/shared';
import { api } from '../lib/api';

interface MusicState {
  session: MusicSessionDto | null;
  botInfo: ServerBotDto | null;
  isLoading: boolean;
  error: string | null;
  isQueueOpen: boolean;

  setQueueOpen: (open: boolean) => void;
  loadSession: (serverId: string) => Promise<void>;
  loadBot: (serverId: string) => Promise<void>;
  play: (serverId: string, query: string, channelId?: string) => Promise<boolean>;
  pause: (serverId: string) => Promise<boolean>;
  resume: (serverId: string) => Promise<boolean>;
  skip: (serverId: string) => Promise<boolean>;
  stop: (serverId: string) => Promise<boolean>;
  setVolume: (serverId: string, volume: number) => Promise<boolean>;
  removeTrack: (serverId: string, position: number) => Promise<boolean>;
  clearQueue: (serverId: string) => Promise<boolean>;
  updateSettings: (serverId: string, settings: Partial<ConfigureBotInput>) => Promise<boolean>;
  startPolling: (serverId: string) => () => void;
}

export const useMusicStore = create<MusicState>((set, get) => {
  return {
    session: null,
    botInfo: null,
    isLoading: false,
    error: null,
    isQueueOpen: false,

    setQueueOpen: (open: boolean) => set({ isQueueOpen: open }),

    loadSession: async (serverId: string) => {
      try {
        const session = await api.getMusicSession(serverId);
        set({ session, error: null });
      } catch (err: any) {
        // Silently keep last session or set null if not found
      }
    },

    loadBot: async (serverId: string) => {
      try {
        const bot = await api.getBotSettings(serverId);
        set({ botInfo: bot, error: null });
      } catch (err: any) {
        set({ error: err.message });
      }
    },

    play: async (serverId: string, query: string, channelId?: string) => {
      set({ isLoading: true, error: null });
      try {
        const res = await api.playMusic(serverId, query, channelId);
        if (res.session) {
          set({ session: res.session, isLoading: false });
        } else {
          await get().loadSession(serverId);
          set({ isLoading: false });
        }
        return true;
      } catch (err: any) {
        set({ error: err.message, isLoading: false });
        return false;
      }
    },

    pause: async (serverId: string) => {
      try {
        const res = await api.pauseMusic(serverId);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    resume: async (serverId: string) => {
      try {
        const res = await api.resumeMusic(serverId);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    skip: async (serverId: string) => {
      try {
        const res = await api.skipMusic(serverId);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    stop: async (serverId: string) => {
      try {
        const res = await api.stopMusic(serverId);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    setVolume: async (serverId: string, volume: number) => {
      // Optimistic update
      const current = get().session;
      if (current) {
        set({ session: { ...current, volume } });
      }
      try {
        const res = await api.setMusicVolume(serverId, volume);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    removeTrack: async (serverId: string, position: number) => {
      try {
        const res = await api.removeQueueTrack(serverId, position);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    clearQueue: async (serverId: string) => {
      try {
        const res = await api.clearMusicQueue(serverId);
        if (res.session) set({ session: res.session });
        return true;
      } catch (err: any) {
        set({ error: err.message });
        return false;
      }
    },

    updateSettings: async (serverId: string, settings: Partial<ConfigureBotInput>) => {
      set({ isLoading: true });
      try {
        const bot = await api.updateBotSettings(serverId, settings);
        set({ botInfo: bot, isLoading: false });
        return true;
      } catch (err: any) {
        set({ error: err.message, isLoading: false });
        return false;
      }
    },

    startPolling: (serverId: string) => {
      // Immediate load
      get().loadSession(serverId);
      get().loadBot(serverId);

      const interval = setInterval(() => {
        get().loadSession(serverId);
      }, 2500);

      return () => clearInterval(interval);
    },
  };
});
