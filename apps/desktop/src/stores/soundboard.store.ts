import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SoundboardItem, Playlist, soundboardStorage } from '../services/soundboard.storage';
import { soundboardAudioEngine, ActiveSoundInfo } from '../services/soundboard-audio-engine';
import { seedDefaultSoundsIfEmpty } from '../services/soundboard-presets';
import { extractAudioMetadata } from '../services/audio-metadata';
import { useLiveKitStore } from './livekit.store';
import { api, CloudSoundItem, CloudStorageStatus } from '../lib/api';

export type RepeatMode = 'off' | 'all' | 'one';

interface SoundboardState {
  sounds: SoundboardItem[];
  cloudSounds: CloudSoundItem[];
  isCloudLoading: boolean;
  isCloudUploading: boolean;
  cloudStorageStatus: CloudStorageStatus | null;
  playlists: Playlist[];
  activePlaylistId: string | null;
  queue: string[];
  currentQueueIndex: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  activePlayingIds: string[];
  activeSounds: ActiveSoundInfo[];
  masterVolume: number;
  localMonitorVolume: number;
  localMonitorMuted: boolean;
  allowWhileMuted: boolean;
  selectedCategory: string;
  searchQuery: string;
  isSoundboardOpen: boolean;
  isQueueOpen: boolean;
  isLoading: boolean;
  isImporting: boolean;
  error: string | null;

  // Actions
  loadSounds: () => Promise<void>;
  loadPlaylists: () => Promise<void>;
  importSound: (file: File, customName?: string, category?: string) => Promise<boolean>;
  playSound: (id: string, localOnly?: boolean) => Promise<void>;
  pauseSound: (id: string) => void;
  resumeSound: (id: string) => Promise<void>;
  togglePauseSound: (id: string) => Promise<void>;
  togglePlayPause: (id?: string) => Promise<void>;
  seekSound: (id: string, seconds: number) => Promise<void>;
  handleHotkeyTrigger: (id: string) => Promise<void>;
  stopSound: (id: string) => void;
  stopAll: () => void;
  updateSound: (id: string, updates: Partial<SoundboardItem>) => Promise<void>;
  deleteSound: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;

  // Cloudflare R2 / Server Cloud Library Actions
  loadCloudSounds: () => Promise<void>;
  loadCloudStorageStatus: () => Promise<void>;
  uploadToCloud: (file: File, customName?: string, category?: string) => Promise<boolean>;
  deleteFromCloud: (id: string) => Promise<boolean>;
  playCloudSound: (cloudItem: CloudSoundItem, localOnly?: boolean) => Promise<void>;
  saveCloudToLocal: (cloudItem: CloudSoundItem) => Promise<boolean>;

  // Playlist & Queue Actions
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  addSoundToPlaylist: (playlistId: string, soundId: string) => Promise<void>;
  removeSoundFromPlaylist: (playlistId: string, soundId: string) => Promise<void>;
  playPlaylist: (playlistId: string, startIndex?: number) => Promise<void>;
  setQueue: (soundIds: string[], startIndex?: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;

  setMasterVolume: (vol: number) => void;
  setLocalMonitorVolume: (vol: number) => void;
  setLocalMonitorMuted: (muted: boolean) => void;
  setAllowWhileMuted: (allow: boolean) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  setSoundboardOpen: (open: boolean) => void;
  setQueueOpen: (open: boolean) => void;
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

      // Wire automatic queue progression on track end
      soundboardAudioEngine.setOnTrackEnded((endedSoundId: string) => {
        const state = get();
        if (state.repeatMode === 'one') {
          // Replay same song
          get().playSound(endedSoundId, false);
          return;
        }

        if (state.queue.length > 0) {
          get().playNext();
        }
      });

      return {
        sounds: [],
        cloudSounds: [],
        isCloudLoading: false,
        isCloudUploading: false,
        cloudStorageStatus: null,
        playlists: [],
        activePlaylistId: null,
        queue: [],
        currentQueueIndex: -1,
        repeatMode: 'off',
        isShuffle: false,
        activePlayingIds: [],
        activeSounds: [],
        masterVolume: 100,
        localMonitorVolume: 100,
        localMonitorMuted: false,
        allowWhileMuted: true,
        selectedCategory: 'All',
        searchQuery: '',
        isSoundboardOpen: false,
        isQueueOpen: false,
        isLoading: false,
        isImporting: false,
        error: null,

        loadSounds: async () => {
          set({ isLoading: true, error: null });
          try {
            // Seed presets asynchronously in the background so it never blocks UI loading
            seedDefaultSoundsIfEmpty().catch((e) => console.warn('Preset seed notice:', e));
            get().loadCloudStorageStatus().catch(() => {});
            get().loadCloudSounds().catch(() => {});

            const items = await soundboardStorage.getAllItems();
            const storedPlaylists = await soundboardStorage.getAllPlaylists();

            soundboardAudioEngine.setMasterVolume(get().masterVolume);
            soundboardAudioEngine.setLocalMonitorVolume(get().localMonitorVolume);
            soundboardAudioEngine.setLocalMonitorMuted(get().localMonitorMuted);
            soundboardAudioEngine.setAllowWhileMuted(get().allowWhileMuted);

            set({
              sounds: items,
              playlists: storedPlaylists,
              isLoading: false,
            });
          } catch (err: any) {
            console.error('Failed to load soundboard sounds:', err);
            set({ error: err.message || 'Failed to load sounds', isLoading: false });
          } finally {
            set({ isLoading: false });
          }
        },

        loadPlaylists: async () => {
          try {
            const list = await soundboardStorage.getAllPlaylists();
            set({ playlists: list });
          } catch (err) {
            console.warn('Failed to load playlists:', err);
          }
        },

        loadCloudSounds: async () => {
          set({ isCloudLoading: true });
          try {
            const list = await api.getCloudSounds();
            set({ cloudSounds: list, isCloudLoading: false });
          } catch (err: any) {
            console.warn('Failed to load cloud sounds:', err);
            set({ isCloudLoading: false });
          }
        },

        loadCloudStorageStatus: async () => {
          try {
            const status = await api.getCloudStorageStatus();
            set({ cloudStorageStatus: status });
          } catch (err) {
            console.warn('Failed to load cloud storage status:', err);
          }
        },

        uploadToCloud: async (file: File, customName?: string, category = 'General') => {
          set({ isCloudUploading: true, error: null });
          try {
            if (file.size > 40 * 1024 * 1024) {
              throw new Error('File exceeds maximum size of 40MB');
            }
            const rawName = file.name.replace(/\.[^/.]+$/, '');
            const finalName = (customName && customName.trim()) || rawName;

            let duration = 0;
            try {
              const decodePromise = (async () => {
                const arrayBuf = await file.arrayBuffer();
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                const ctx = new AudioCtx();
                const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
                const d = Math.round(decoded.duration * 10) / 10;
                ctx.close();
                return d;
              })();
              duration = await Promise.race([
                decodePromise,
                new Promise<number>((res) => setTimeout(() => res(0), 1200)),
              ]);
            } catch {}

            const newSound = await api.uploadCloudSound(file, finalName, category, duration);
            set((state) => ({
              cloudSounds: [newSound, ...state.cloudSounds.filter((s) => s.id !== newSound.id)],
              isCloudUploading: false,
            }));
            // Refresh from backend to ensure consistent state
            get().loadCloudSounds().catch(() => {});
            return true;
          } catch (err: any) {
            console.error('Failed to upload sound to cloud:', err);
            set({ error: err.message || 'Upload failed', isCloudUploading: false });
            return false;
          } finally {
            set({ isCloudUploading: false });
          }
        },

        deleteFromCloud: async (id: string) => {
          try {
            await api.deleteCloudSound(id);
            set((state) => ({
              cloudSounds: state.cloudSounds.filter((s) => s.id !== id),
            }));
            return true;
          } catch (err: any) {
            console.error('Failed to delete cloud sound:', err);
            set({ error: err.message || 'Delete failed' });
            return false;
          }
        },

        playCloudSound: async (cloudItem: CloudSoundItem, localOnly = false) => {
          await get().playSound(cloudItem.id, localOnly);
        },

        saveCloudToLocal: async (cloudItem: CloudSoundItem) => {
          try {
            const fullUrl = cloudItem.audioUrl.startsWith('http')
              ? cloudItem.audioUrl
              : `${api.getBaseUrl()}${cloudItem.audioUrl.startsWith('/') ? '' : '/'}${cloudItem.audioUrl}`;
            const res = await fetch(fullUrl);
            if (!res.ok) throw new Error('Failed to fetch audio from cloud');
            const arrayBuffer = await res.arrayBuffer();

            const localItem: SoundboardItem = {
              id: `snd_local_${cloudItem.id}`,
              name: cloudItem.name,
              category: cloudItem.category,
              volume: 80,
              hotkey: null,
              duration: cloudItem.duration,
              createdAt: Date.now(),
              isFavorite: false,
            };

            await soundboardStorage.saveSound(localItem, arrayBuffer);
            const updatedSounds = await soundboardStorage.getAllItems();
            set({ sounds: updatedSounds });
            return true;
          } catch (err: any) {
            console.error('Failed to save cloud sound locally:', err);
            set({ error: err.message || 'Failed to download to local library' });
            return false;
          }
        },

        importSound: async (file: File, customName?: string, category = 'General') => {
          set({ isImporting: true, error: null });
          try {
            if (file.size > 35 * 1024 * 1024) {
              throw new Error('Audio file is too large (maximum 35MB).');
            }

            const rawName = file.name.replace(/\.[^/.]+$/, '');
            const finalName = (customName && customName.trim()) || rawName;

            const arrayBuffer = await file.arrayBuffer();
            const soundId = `snd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            const audioBuffer = await soundboardAudioEngine.loadAudioBuffer(soundId, arrayBuffer);
            const duration = Math.round(audioBuffer.duration * 10) / 10;

            // Extract ID3 album artwork and metadata
            const metadata = await extractAudioMetadata(file);

            const item: SoundboardItem = {
              id: soundId,
              name: metadata.title || finalName,
              artist: metadata.artist,
              artworkUrl: metadata.artworkUrl,
              category,
              volume: 80,
              hotkey: null,
              duration,
              createdAt: Date.now(),
              isFavorite: false,
            };

            await soundboardStorage.saveSound(item, arrayBuffer);
            const updatedSounds = await soundboardStorage.getAllItems();
            set({ sounds: updatedSounds, isImporting: false });
            return true;
          } catch (err: any) {
            console.error('Failed to import audio file:', err);
            set({ error: err.message || 'Failed to decode audio file', isImporting: false });
            return false;
          } finally {
            set({ isImporting: false });
          }
        },

        playSound: async (id: string, localOnly = false) => {
          // If already paused, resume it!
          if (soundboardAudioEngine.isPaused(id)) {
            await soundboardAudioEngine.resumeSound(id);
            return;
          }

          let sound = get().sounds.find((s) => s.id === id);
          if (!sound) {
            const cloud = get().cloudSounds.find((c) => c.id === id);
            if (cloud) {
              sound = {
                id: cloud.id,
                name: cloud.name,
                category: cloud.category,
                volume: 100,
                hotkey: null,
                duration: cloud.duration,
                createdAt: new Date(cloud.createdAt).getTime(),
                audioUrl: cloud.audioUrl,
                source: 'cloud',
              };
            }
          }
          if (!sound) return;

          try {
            // Update queue index if part of current queue
            const qIndex = get().queue.indexOf(id);
            if (qIndex >= 0) {
              set({ currentQueueIndex: qIndex });
            } else if (!localOnly) {
              // Add to queue if playing standalone
              set({ queue: [id], currentQueueIndex: 0 });
            }

            await soundboardAudioEngine.playSound(sound, localOnly, true);
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

        togglePlayPause: async (targetId?: string) => {
          const state = get();
          const id =
            targetId ||
            state.queue[state.currentQueueIndex] ||
            (state.activeSounds.length > 0 ? state.activeSounds[0].soundId : (state.queue.length > 0 ? state.queue[0] : null));
          if (!id) return;

          if (soundboardAudioEngine.isPlaying(id)) {
            get().pauseSound(id);
          } else if (soundboardAudioEngine.isPaused(id)) {
            await get().resumeSound(id);
          } else {
            await get().playSound(id, false);
          }
        },

        seekSound: async (id: string, seconds: number) => {
          await soundboardAudioEngine.seekSound(id, seconds);
        },

        handleHotkeyTrigger: async (id: string) => {
          const now = Date.now();
          const lastPress = lastHotkeyPressTimestamps[id] || 0;
          const isDoublePress = (now - lastPress) < 380;
          const isActive = soundboardAudioEngine.isPlaying(id) || soundboardAudioEngine.isPaused(id);

          lastHotkeyPressTimestamps[id] = now;

          if (isActive) {
            if (isDoublePress) {
              lastHotkeyPressTimestamps[id] = 0;
              get().stopSound(id);
            } else {
              await get().togglePauseSound(id);
            }
          } else {
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
            queue: state.queue.filter((sId) => sId !== id),
          }));
        },

        toggleFavorite: async (id: string) => {
          const sound = get().sounds.find((s) => s.id === id);
          if (!sound) return;
          const nextFav = !sound.isFavorite;
          await get().updateSound(id, { isFavorite: nextFav });
        },

        // Playlist operations
        createPlaylist: async (name: string) => {
          const newPlaylist: Playlist = {
            id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: name.trim() || 'New Playlist',
            soundIds: [],
            createdAt: Date.now(),
          };
          await soundboardStorage.savePlaylist(newPlaylist);
          const list = await soundboardStorage.getAllPlaylists();
          set({ playlists: list });
          return newPlaylist;
        },

        deletePlaylist: async (id: string) => {
          await soundboardStorage.deletePlaylist(id);
          const list = await soundboardStorage.getAllPlaylists();
          set({
            playlists: list,
            activePlaylistId: get().activePlaylistId === id ? null : get().activePlaylistId,
          });
        },

        renamePlaylist: async (id: string, name: string) => {
          const playlist = get().playlists.find((p) => p.id === id);
          if (!playlist) return;
          const updated: Playlist = { ...playlist, name: name.trim() || playlist.name };
          await soundboardStorage.savePlaylist(updated);
          const list = await soundboardStorage.getAllPlaylists();
          set({ playlists: list });
        },

        addSoundToPlaylist: async (playlistId: string, soundId: string) => {
          const playlist = get().playlists.find((p) => p.id === playlistId);
          if (!playlist) return;
          if (playlist.soundIds.includes(soundId)) return;
          const updated: Playlist = {
            ...playlist,
            soundIds: [...playlist.soundIds, soundId],
          };
          await soundboardStorage.savePlaylist(updated);
          const list = await soundboardStorage.getAllPlaylists();
          set({ playlists: list });
        },

        removeSoundFromPlaylist: async (playlistId: string, soundId: string) => {
          const playlist = get().playlists.find((p) => p.id === playlistId);
          if (!playlist) return;
          const updated: Playlist = {
            ...playlist,
            soundIds: playlist.soundIds.filter((sId) => sId !== soundId),
          };
          await soundboardStorage.savePlaylist(updated);
          const list = await soundboardStorage.getAllPlaylists();
          set({ playlists: list });
        },

        playPlaylist: async (playlistId: string, startIndex = 0) => {
          const playlist = get().playlists.find((p) => p.id === playlistId);
          if (!playlist || playlist.soundIds.length === 0) return;

          let queue = [...playlist.soundIds];
          if (get().isShuffle) {
            // Fisher-Yates shuffle
            for (let i = queue.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [queue[i], queue[j]] = [queue[j], queue[i]];
            }
          }

          set({
            activePlaylistId: playlistId,
            queue,
            currentQueueIndex: startIndex,
          });

          const targetSoundId = queue[startIndex] || queue[0];
          if (targetSoundId) {
            await get().playSound(targetSoundId, false);
          }
        },

        setQueue: async (soundIds: string[], startIndex = 0) => {
          set({
            queue: soundIds,
            currentQueueIndex: startIndex,
          });
          const target = soundIds[startIndex];
          if (target) {
            await get().playSound(target, false);
          }
        },

        playNext: async () => {
          const { queue, currentQueueIndex, repeatMode, isShuffle } = get();
          if (queue.length === 0) return;

          let nextIndex = currentQueueIndex + 1;
          if (nextIndex >= queue.length) {
            if (repeatMode === 'all') {
              nextIndex = 0;
            } else {
              // End of queue reached
              return;
            }
          }

          if (isShuffle && queue.length > 1) {
            let rand = Math.floor(Math.random() * queue.length);
            if (rand === currentQueueIndex) {
              rand = (rand + 1) % queue.length;
            }
            nextIndex = rand;
          }

          set({ currentQueueIndex: nextIndex });
          const nextSoundId = queue[nextIndex];
          if (nextSoundId) {
            await get().playSound(nextSoundId, false);
          }
        },

        playPrevious: async () => {
          const { queue, currentQueueIndex, activePlayingIds } = get();
          if (queue.length === 0) return;

          // If current track is more than 3 seconds in, restart it first
          if (activePlayingIds.length > 0) {
            const progress = soundboardAudioEngine.getPlaybackProgress(activePlayingIds[0]);
            if (progress && progress.currentTime > 3) {
              await get().seekSound(activePlayingIds[0], 0);
              return;
            }
          }

          let prevIndex = currentQueueIndex - 1;
          if (prevIndex < 0) {
            prevIndex = queue.length - 1;
          }

          set({ currentQueueIndex: prevIndex });
          const prevSoundId = queue[prevIndex];
          if (prevSoundId) {
            await get().playSound(prevSoundId, false);
          }
        },

        toggleShuffle: () => {
          set((s) => ({ isShuffle: !s.isShuffle }));
        },

        toggleRepeat: () => {
          set((s) => {
            const modes: RepeatMode[] = ['off', 'all', 'one'];
            const nextMode = modes[(modes.indexOf(s.repeatMode) + 1) % modes.length];
            return { repeatMode: nextMode };
          });
        },

        setMasterVolume: (vol: number) => {
          const clamped = Math.max(0, Math.min(200, vol));
          soundboardAudioEngine.setMasterVolume(clamped);
          set({ masterVolume: clamped });
        },

        setLocalMonitorVolume: (vol: number) => {
          const clamped = Math.max(0, Math.min(200, vol));
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

        setQueueOpen: (open: boolean) => {
          set({ isQueueOpen: open });
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
        repeatMode: state.repeatMode,
        isShuffle: state.isShuffle,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Auto-heal volume if it was saved as <= 1 due to the previous 0-1 slider bug
          if (typeof state.masterVolume !== 'number' || state.masterVolume <= 1) {
            state.masterVolume = 100;
          }
          if (typeof state.localMonitorVolume !== 'number' || state.localMonitorVolume <= 1) {
            state.localMonitorVolume = 100;
          }
          if (state.allowWhileMuted === undefined) {
            state.allowWhileMuted = true;
          }
          soundboardAudioEngine.setMasterVolume(state.masterVolume);
          soundboardAudioEngine.setAllowWhileMuted(state.allowWhileMuted);
          soundboardAudioEngine.setLocalMonitorVolume(state.localMonitorVolume);
          soundboardAudioEngine.setLocalMonitorMuted(!!state.localMonitorMuted);
        }
      },
    }
  )
);
