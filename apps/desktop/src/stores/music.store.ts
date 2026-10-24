import { create } from 'zustand';
import { useSoundboardStore } from './soundboard.store';
import { SoundboardItem } from '../services/soundboard.storage';

export interface MusicTrack {
  id: string;
  title: string;
  artist?: string;
  duration: number; // in seconds
  thumbnailUrl?: string;
  isFavorite?: boolean;
}

export interface QueueItem {
  id: string;
  soundId: string;
  name: string;
  duration: number;
  addedAt: number;
}

interface MusicStoreState {
  isQueueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  // Proxy methods for backwards compatibility & clean music API
  getQueue: () => SoundboardItem[];
  getCurrentTrack: () => SoundboardItem | null;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

export const useMusicStore = create<MusicStoreState>((set) => ({
  isQueueOpen: false,
  setQueueOpen: (open: boolean) => {
    set({ isQueueOpen: open });
    useSoundboardStore.getState().setQueueOpen(open);
  },
  getQueue: () => {
    const sb = useSoundboardStore.getState();
    return sb.queue
      .map((id) => sb.sounds.find((s) => s.id === id))
      .filter((s): s is SoundboardItem => !!s);
  },
  getCurrentTrack: () => {
    const sb = useSoundboardStore.getState();
    const currentId = sb.queue[sb.currentQueueIndex] || sb.activePlayingIds[0];
    return currentId ? sb.sounds.find((s) => s.id === currentId) || null : null;
  },
  playNext: async () => {
    await useSoundboardStore.getState().playNext();
  },
  playPrevious: async () => {
    await useSoundboardStore.getState().playPrevious();
  },
  toggleShuffle: () => {
    useSoundboardStore.getState().toggleShuffle();
  },
  toggleRepeat: () => {
    useSoundboardStore.getState().toggleRepeat();
  },
}));
