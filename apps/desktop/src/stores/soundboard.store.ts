import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SoundboardItem, soundboardStorage } from '../services/soundboard.storage';
import { soundboardAudioEngine, ActiveSoundInfo } from '../services/soundboard-audio-engine';
import { seedDefaultSoundsIfEmpty } from '../services/soundboard-presets';
import { useLiveKitStore } from './livekit.store';

interface SoundboardState {
  sounds: SoundboardItem[];
  activePlayingIds: string[];
  activeSounds: ActiveSoundInfo[];
  masterVolume: number;
  localMonitorVolume: number;
  localMonitorMuted: boolean;
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
  pauseSound: (id: string) => void;
  resumeSound: (id: string) => Promise<void>;
  togglePauseSound: (id: string) => Promise<void>;
  handleHotkeyTrigger: (id: string) => Promise<void>;
  stopSound: (id: string) => void;
  stopAll: () => void;
  updateSound: (id: string, updates: Partial<SoundboardItem>) => Promise<void>;
  deleteSound: (id: string) => Promise<void>;
  setMasterVolume: (vol: number) => void;
  setLocalMonitorVolume: (vol: number) => void;
  setLocalMonitorMuted: (muted: boolean) => void;
  setAllowWhileMuted: (allow: boolean) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setSoundboardOpen: (open: boolean) => void;
}

// Track hotkey double-tap timestamps
const lastHotkeyPressTimestamps: Record<string, number> = {};

export const useSoundboardStore = create<SoundboardState>()(
  persist(
    (set, get) => {
      // Wire audio engine listener to update activePlayingIds & activeSounds in store
      soundboardAudioEngine.subscribe(() => {
        const active = soundboardAudioEngine.getActiveSounds();
        set({
          activePlayingIds: soundboardAudioEngine.getActivePlayingIds(),
          activeSounds: active,
        });
      });

      // Track automatic sound finishes to broadcast stopped packet
      let previousActiveIds = new Set<string>();
      soundboardAudioEngine.setOnActiveChange((activeList) => {
        const currentActiveIds = new Set(activeList.map((a) => a.soundId));
        previousActiveIds.forEach((id) => {
          if (!currentActiveIds.has(id)) {
            useLiveKitStore.getState().broadcastSoundboardStopped(id);
          }
        });
        previousActiveIds = currentActiveIds;
      });

      return {
        sounds: [],
        activePlayingIds: [],
        activeSounds: [],
        masterVolume: 80,
        localMonitorVolume: 80,
        localMonitorMuted: false,
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
            soundboardAudioEngine.setMasterVolume(get().masterVolume);
            soundboardAudioEngine.setLocalMonitorVolume(get().localMonitorVolume);
            soundboardAudioEngine.setLocalMonitorMuted(get().localMonitorMuted);
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
            if (file.size > 25 * 1024 * 1024) {
              throw new Error('Audio file is too large (maximum 25MB).');
            }

            const rawName = file.name.replace(/\.[^/.]+$/, '');
            const finalName = (customName && customName.trim()) || rawName;

            const arrayBuffer = await file.arrayBuffer();
            const soundId = `snd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

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
            if (!localOnly) {
              useLiveKitStore.getState().broadcastSoundboardPlaying(sound.id, sound.name, sound.duration);
            }
          } catch (err: any) {
            console.error(`Error playing sound ${sound.name}:`, err);
            set({ error: err.message || 'Playback error' });
          }
        },

        pauseSound: (id: string) => {
          soundboardAudioEngine.pauseSound(id);
        },

        resumeSound: async (id: string) => {
          await soundboardAudioEngine.resumeSound(id);
        },

        togglePauseSound: async (id: string) => {
          await soundboardAudioEngine.togglePauseSound(id);
        },

        /**
         * Hotkey trigger behavior requested by user:
         * - If sound is playing:
         *   - Press once: Pause (or resume if already paused)
         *   - Double-press within 380ms: Stop completely (قطع کامل)
         * - If sound is not playing:
         *   - Starts playback
         */
        handleHotkeyTrigger: async (id: string) => {
          const now = Date.now();
          const lastPress = lastHotkeyPressTimestamps[id] || 0;
          const isDoublePress = (now - lastPress) < 380;
          const isActive = soundboardAudioEngine.isPlaying(id) || soundboardAudioEngine.isPaused(id);

          lastHotkeyPressTimestamps[id] = now;

          if (isActive) {
            if (isDoublePress) {
              // Double-tap: Stop completely
              lastHotkeyPressTimestamps[id] = 0;
              get().stopSound(id);
            } else {
              // Single tap: Toggle pause
              await get().togglePauseSound(id);
            }
          } else {
            // Not playing: Play sound
            await get().playSound(id, false);
          }
        },

        stopSound: (id: string) => {
          soundboardAudioEngine.stopSound(id);
          useLiveKitStore.getState().broadcastSoundboardStopped(id);
        },

        stopAll: () => {
          const ids = get().activePlayingIds;
          soundboardAudioEngine.stopAllSounds();
          ids.forEach((id) => {
            useLiveKitStore.getState().broadcastSoundboardStopped(id);
          });
        },

        updateSound: async (id: string, updates: Partial<SoundboardItem>) => {
          await soundboardStorage.updateItem(id, updates);
          set((state) => ({
            sounds: state.sounds.map((s) => (s.id === id ? { ...s, ...updates } : s)),
          }));
        },

        deleteSound: async (id: string) => {
          soundboardAudioEngine.stopSound(id);
          useLiveKitStore.getState().broadcastSoundboardStopped(id);
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

        setLocalMonitorMuted: (muted: boolean) => {
          soundboardAudioEngine.setLocalMonitorMuted(muted);
          set({ localMonitorMuted: muted });
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
      name: 'nightshift-soundboard-store',
      partialize: (state) => ({
        masterVolume: state.masterVolume,
        localMonitorVolume: state.localMonitorVolume,
        localMonitorMuted: state.localMonitorMuted,
        allowWhileMuted: state.allowWhileMuted,
      }),
    }
  )
);
