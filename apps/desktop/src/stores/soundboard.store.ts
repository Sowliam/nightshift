import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SoundboardItem, soundboardStorage } from '../services/soundboard.storage';
import { soundboardAudioEngine } from '../services/soundboard-audio-engine';
import { seedDefaultSoundsIfEmpty } from '../services/soundboard-presets';

interface SoundboardState {
  sounds: SoundboardItem[];
  activePlayingIds: string[];
  masterVolume: number;
  localMonitorVolume: number;
  allowWhileMuted: boolean;
  selectedCategory: string;
  searchQuery: string;
  isSoundboardOpen: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSounds: () => Promise<void>;
  importSound: (file: File, customName?: string, category?: string) => Promise<boolean>;
  playSound: (id: string, localOnly?: boolean) => Promise<void>;
  stopSound: (id: string) => void;
  stopAll: () => void;
  updateSound: (id: string, updates: Partial<SoundboardItem>) => Promise<void>;
  deleteSound: (id: string) => Promise<void>;
  setMasterVolume: (vol: number) => void;
  setLocalMonitorVolume: (vol: number) => void;
  setAllowWhileMuted: (allow: boolean) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setSoundboardOpen: (open: boolean) => void;
}

export const useSoundboardStore = create<SoundboardState>()(
  persist(
    (set, get) => {
      // Wire audio engine listener to update activePlayingIds in store
      soundboardAudioEngine.subscribe(() => {
        set({ activePlayingIds: soundboardAudioEngine.getActivePlayingIds() });
      });

      return {
        sounds: [],
        activePlayingIds: [],
        masterVolume: 80,
        localMonitorVolume: 80,
        allowWhileMuted: false,
        selectedCategory: 'All',
        searchQuery: '',
        isSoundboardOpen: false,
        isLoading: false,
        error: null,

        loadSounds: async () => {
          set({ isLoading: true, error: null });
          try {
            await seedDefaultSoundsIfEmpty();
            const items = await soundboardStorage.getAllItems();
            // Sync saved volume settings with audio engine
            soundboardAudioEngine.setMasterVolume(get().masterVolume);
            soundboardAudioEngine.setLocalMonitorVolume(get().localMonitorVolume);
            soundboardAudioEngine.setAllowWhileMuted(get().allowWhileMuted);
            set({ sounds: items, isLoading: false });
          } catch (err: any) {
            console.error('Failed to load soundboard sounds:', err);
            set({ error: err.message || 'Failed to load sounds', isLoading: false });
          }
        },

        importSound: async (file: File, customName?: string, category = 'General') => {
          set({ isLoading: true, error: null });
          try {
            // Validate size (max 25MB)
            if (file.size > 25 * 1024 * 1024) {
              throw new Error('Audio file is too large (maximum 25MB).');
            }

            // Extract file extension and base name
            const rawName = file.name.replace(/\.[^/.]+$/, '');
            const finalName = (customName && customName.trim()) || rawName;

            const arrayBuffer = await file.arrayBuffer();
            const soundId = `snd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            // Decode to verify audio format and extract duration
            const audioBuffer = await soundboardAudioEngine.loadAudioBuffer(soundId, arrayBuffer);
            const duration = Math.round(audioBuffer.duration * 10) / 10;

            const item: SoundboardItem = {
              id: soundId,
              name: finalName,
              category,
              volume: 80,
              hotkey: null,
              duration,
              createdAt: Date.now(),
            };

            await soundboardStorage.saveSound(item, arrayBuffer);
            const updatedSounds = await soundboardStorage.getAllItems();
            set({ sounds: updatedSounds, isLoading: false });
            return true;
          } catch (err: any) {
            console.error('Failed to import audio file:', err);
            set({ error: err.message || 'Failed to decode audio file', isLoading: false });
            return false;
          }
        },

        playSound: async (id: string, localOnly = false) => {
          const sound = get().sounds.find((s) => s.id === id);
          if (!sound) return;

          try {
            await soundboardAudioEngine.playSound(sound, localOnly);
          } catch (err: any) {
            console.error(`Error playing sound ${sound.name}:`, err);
            set({ error: err.message || 'Playback error' });
          }
        },

        stopSound: (id: string) => {
          soundboardAudioEngine.stopSound(id);
        },

        stopAll: () => {
          soundboardAudioEngine.stopAllSounds();
        },

        updateSound: async (id: string, updates: Partial<SoundboardItem>) => {
          await soundboardStorage.updateItem(id, updates);
          set((state) => ({
            sounds: state.sounds.map((s) => (s.id === id ? { ...s, ...updates } : s)),
          }));
        },

        deleteSound: async (id: string) => {
          soundboardAudioEngine.stopSound(id);
          await soundboardStorage.deleteItem(id);
          set((state) => ({
            sounds: state.sounds.filter((s) => s.id !== id),
          }));
        },

        setMasterVolume: (vol: number) => {
          const clamped = Math.max(0, Math.min(100, vol));
          soundboardAudioEngine.setMasterVolume(clamped);
          set({ masterVolume: clamped });
        },

        setLocalMonitorVolume: (vol: number) => {
          const clamped = Math.max(0, Math.min(100, vol));
          soundboardAudioEngine.setLocalMonitorVolume(clamped);
          set({ localMonitorVolume: clamped });
        },

        setAllowWhileMuted: (allow: boolean) => {
          soundboardAudioEngine.setAllowWhileMuted(allow);
          set({ allowWhileMuted: allow });
        },

        setSelectedCategory: (category: string) => {
          set({ selectedCategory: category });
        },

        setSearchQuery: (query: string) => {
          set({ searchQuery: query });
        },

        setSoundboardOpen: (open: boolean) => {
          set({ isSoundboardOpen: open });
        },
      };
    },
    {
      name: 'nightshift_soundboard_settings',
      partialize: (state) => ({
        masterVolume: state.masterVolume,
        localMonitorVolume: state.localMonitorVolume,
        allowWhileMuted: state.allowWhileMuted,
        selectedCategory: state.selectedCategory,
      }),
    }
  )
);
