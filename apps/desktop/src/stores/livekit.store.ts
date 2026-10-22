import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  LocalParticipant,
  RemoteParticipant,
  ConnectionState,
  LocalVideoTrack,
  TrackPublication,
  LocalAudioTrack,
  RemoteAudioTrack,
} from 'livekit-client';
import { useSettingsStore } from './settings.store';
import { sounds } from '../services/sound.service';
import { ScreenShareOptions, MessageDto } from '@nightshift/shared';
import { useChatStore } from './chat.store';
import { useRoomStore } from './room.store';
import { useServerStore } from './server.store';

export interface ActiveScreenShare {
  participantIdentity: string;
  participantName: string;
  isLocal: boolean;
  publication: TrackPublication;
}

interface LiveKitState {
  room: Room | null;
  connectionState: ConnectionState;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  isLocallySpeaking: boolean;
  currentPing: number | null;
  localParticipant: LocalParticipant | null;
  remoteParticipants: RemoteParticipant[];
  activeSpeakers: Set<string>;
  
  // Multi-stream & Opt-in Screen Share Architecture
  availableScreenShares: ActiveScreenShare[];
  watchedScreenShareIds: Set<string>;
  focusedScreenShareId: string | null;

  activeScreenTrack: TrackPublication | null;
  screenSharerIdentity: string | null;
  screenSharerName: string | null;
  currentScreenOptions: ScreenShareOptions | null;
  error: string | null;

  connect: (url: string, token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startScreenShare: (sourceId?: string, options?: ScreenShareOptions) => Promise<boolean>;
  stopScreenShare: () => Promise<void>;

  // Stream watching actions
  startWatchingStream: (participantIdentity: string) => void;
  stopWatchingStream: (participantIdentity: string) => void;
  setFocusedScreenShare: (participantIdentity: string | null) => void;
  setAudioInputDevice: (deviceId: string) => Promise<void>;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
  setPushToTalkActive: (active: boolean) => Promise<void>;
  setParticipantVolume: (identity: string, volumePercent: number) => void;
  broadcastChatMessage: (roomId: string, message: MessageDto) => Promise<void>;
}

export const useLiveKitStore = create<LiveKitState>((set, get) => {
  let activeCustomScreenTrack: LocalVideoTrack | null = null;
  let activeCustomScreenAudioTrack: LocalAudioTrack | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let localAudioContext: AudioContext | null = null;
  let localAudioSource: MediaStreamAudioSourceNode | null = null;
  let localAnalyser: AnalyserNode | null = null;
  let localAnimFrame: number | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupAudioAnalyser = () => {
    if (localAnimFrame) {
      cancelAnimationFrame(localAnimFrame);
      localAnimFrame = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (localAudioSource) {
      localAudioSource.disconnect();
      localAudioSource = null;
    }
    if (localAudioContext) {
      localAudioContext.close().catch(() => {});
      localAudioContext = null;
    }
    set({ isLocallySpeaking: false });
  };

  const setupAudioAnalyser = (track: MediaStreamTrack) => {
    cleanupAudioAnalyser();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      localAudioContext = new AudioCtx();
      const stream = new MediaStream([track]);
      localAudioSource = localAudioContext.createMediaStreamSource(stream);
      localAnalyser = localAudioContext.createAnalyser();
      localAnalyser.fftSize = 256;
      localAudioSource.connect(localAnalyser);

      const buffer = new Uint8Array(localAnalyser.frequencyBinCount);

      const checkAudio = () => {
        if (!localAnalyser) return;
        localAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));

        const threshold = useSettingsStore.getState().voiceActivationThreshold || 15;
        const isMuted = get().isMuted;

        if (!isMuted && normalized > threshold) {
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          if (!get().isLocallySpeaking) {
            set({ isLocallySpeaking: true });
            const localId = get().localParticipant?.identity;
            if (localId) {
              set((state) => ({
                activeSpeakers: new Set([...state.activeSpeakers, localId]),
              }));
            }
          }
        } else {
          if (!silenceTimer && get().isLocallySpeaking) {
            silenceTimer = setTimeout(() => {
              set({ isLocallySpeaking: false });
              const localId = get().localParticipant?.identity;
              if (localId) {
                set((state) => {
                  const updated = new Set(state.activeSpeakers);
                  updated.delete(localId);
                  return { activeSpeakers: updated };
                });
              }
              silenceTimer = null;
            }, 300);
          }
        }
        localAnimFrame = requestAnimationFrame(checkAudio);
      };
      checkAudio();
    } catch (e) {
      console.warn('Could not setup local audio analyzer:', e);
    }
  };

  const measurePing = async (room: Room) => {
    try {
      const pcManager = (room.engine as any)?.pcManager;
      const candidates = [
        pcManager?.subscriber?.getStats ? pcManager.subscriber : null,
        pcManager?.publisher?.getStats ? pcManager.publisher : null,
        (room.engine as any)?.subscriber?.getStats ? (room.engine as any).subscriber : null,
        (room.engine as any)?.publisher?.getStats ? (room.engine as any).publisher : null,
        (room.engine as any)?.pc?.getStats ? (room.engine as any).pc : null,
      ].filter(Boolean);

      for (const transport of candidates) {
        try {
          const stats = await transport.getStats();
          if (stats) {
            for (const report of stats.values()) {
              if (
                report.type === 'candidate-pair' &&
                (report.state === 'succeeded' || report.nominated) &&
                typeof report.currentRoundTripTime === 'number'
              ) {
                const rtt = Math.round(report.currentRoundTripTime * 1000);
                if (rtt > 0 && rtt < 1500) {
                  set({ currentPing: rtt });
                  return;
                }
              }
              if (report.type === 'remote-inbound-rtp' && typeof report.roundTripTime === 'number') {
                const rtt = Math.round(report.roundTripTime * 1000);
                if (rtt > 0 && rtt < 1500) {
                  set({ currentPing: rtt });
                  return;
                }
              }
            }
          }
        } catch {}
      }

      // Check engine's internal RTT calculation if available
      const engineRtt = (room.engine as any)?.rtt;
      if (typeof engineRtt === 'number' && engineRtt > 0) {
        set({ currentPing: Math.round(engineRtt) });
        return;
      }
    } catch {
      // Ignore transient ping failure
    }
  };

  const updateScreenShareState = (room: Room) => {
    const list: ActiveScreenShare[] = [];

    // 1. Check local participant
    const localScreenPub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (pub) => pub.source === Track.Source.ScreenShare && pub.track
    );
    if (localScreenPub) {
      list.push({
        participantIdentity: room.localParticipant.identity,
        participantName: room.localParticipant.name || 'You',
        isLocal: true,
        publication: localScreenPub,
      });
    }

    // 2. Check all remote participants
    for (const remote of room.remoteParticipants.values()) {
      const screenPub = Array.from(remote.videoTrackPublications.values()).find(
        (pub) => pub.source === Track.Source.ScreenShare && pub.track
      );
      if (screenPub) {
        list.push({
          participantIdentity: remote.identity,
          participantName: remote.name || remote.identity,
          isLocal: false,
          publication: screenPub,
        });
      }
    }

    const currentWatched = new Set(get().watchedScreenShareIds);
    const activeIdentities = new Set(list.map((s) => s.participantIdentity));
    // Clean up any watched streams that ended
    currentWatched.forEach((id) => {
      if (!activeIdentities.has(id)) {
        currentWatched.delete(id);
      }
    });

    // Auto-watch local stream if sharing so host can preview own screen
    if (localScreenPub && !currentWatched.has(room.localParticipant.identity)) {
      currentWatched.add(room.localParticipant.identity);
    }

    // Determine primary focused or active screen track
    const focusedId = get().focusedScreenShareId;
    let primary = list.find((s) => s.participantIdentity === focusedId && currentWatched.has(s.participantIdentity));
    if (!primary) {
      primary = list.find((s) => currentWatched.has(s.participantIdentity)) || null;
    }

    set({
      isScreenSharing: !!localScreenPub,
      availableScreenShares: list,
      watchedScreenShareIds: currentWatched,
      activeScreenTrack: primary ? primary.publication : null,
      screenSharerIdentity: primary ? primary.participantIdentity : null,
      screenSharerName: primary ? primary.participantName : null,
    });
  };

  const applyDeafenToRemoteTracks = (room: Room, deafened: boolean) => {
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && pub.track.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = !deafened;
        }
      });
    });
  };

  return {
    room: null,
    connectionState: ConnectionState.Disconnected,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    isLocallySpeaking: false,
    currentPing: null,
    localParticipant: null,
    remoteParticipants: [],
    activeSpeakers: new Set(),
    availableScreenShares: [],
    watchedScreenShareIds: new Set(),
    focusedScreenShareId: null,
    activeScreenTrack: null,
    screenSharerIdentity: null,
    screenSharerName: null,
    currentScreenOptions: null,
    error: null,

    connect: async (url: string, token: string) => {
      await get().disconnect();

      set({ connectionState: ConnectionState.Connecting, error: null });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        set({ connectionState: state });
      });

      room.on(RoomEvent.Connected, () => {
        set({
          connectionState: ConnectionState.Connected,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
        });
        useRoomStore.getState().setJoiningRoom(null);
        useServerStore.getState().setJoiningVoiceChannel(null);
        useRoomStore.getState().fetchRooms();
        measurePing(room);
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => measurePing(room), 2000);
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        sounds.playJoin();
        useRoomStore.getState().fetchRooms();
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        sounds.playDisconnect();
        updateScreenShareState(room);
        useRoomStore.getState().fetchRooms();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const speakingSet = new Set<string>();
        speakers.forEach((s) => speakingSet.add(s.identity));
        if (get().isLocallySpeaking && room.localParticipant) {
          speakingSet.add(room.localParticipant.identity);
        }
        set({ activeSpeakers: speakingSet });
      });

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;

          // Apply saved per-participant volume if any
          const savedVol = useSettingsStore.getState().participantVolumes[participant.identity];
          if (typeof savedVol === 'number' && typeof (track as RemoteAudioTrack).setVolume === 'function') {
            (track as RemoteAudioTrack).setVolume(savedVol / 100);
          }

          if (get().isDeafened && track.mediaStreamTrack) {
            track.mediaStreamTrack.enabled = false;
          }
        }
        updateScreenShareState(room);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        updateScreenShareState(room);
      });

      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.track && pub.track.kind === Track.Kind.Audio) {
          const localAudio = pub.track as LocalAudioTrack;
          if (localAudio.mediaStreamTrack) {
            setupAudioAnalyser(localAudio.mediaStreamTrack);
          }
        }
        updateScreenShareState(room);
      });

      room.on(RoomEvent.LocalTrackUnpublished, () => {
        updateScreenShareState(room);
      });

      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);
          if (data.type === 'chat_message' && data.message && data.roomId) {
            useChatStore.getState().addMessage(data.roomId, data.message);
          }
        } catch (err) {
          console.warn('Error parsing data packet:', err);
        }
      });

      try {
        await room.connect(url, token);

        // In web browsers, ensure WebRTC audio playback is activated (handles autoplay policy)
        try {
          await room.startAudio();
        } catch (audioErr) {
          console.warn('Audio playback pending user gesture:', audioErr);
        }

        const settings = useSettingsStore.getState();
        if (settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default') {
          try {
            await room.switchActiveDevice('audioinput', settings.audioInputDeviceId);
          } catch (e) {
            console.warn('Could not switch to preferred input device:', e);
          }
        }

        // Check if push-to-talk is enabled by default
        const isPtt = settings.inputMode === 'push-to-talk';

        try {
          await room.localParticipant.setMicrophoneEnabled(!isPtt);
          set({ isMuted: isPtt });

          // Find local audio track to start live analyzer
          const micPub = Array.from(room.localParticipant.audioTrackPublications.values())[0];
          if (micPub && micPub.track && (micPub.track as LocalAudioTrack).mediaStreamTrack) {
            setupAudioAnalyser((micPub.track as LocalAudioTrack).mediaStreamTrack!);
          }
        } catch (micErr: any) {
          console.warn('Microphone error:', micErr);
          set({ isMuted: true, error: 'Could not access microphone: ' + (micErr.message || 'Permission denied') });
        }

        set({
          room,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
          connectionState: ConnectionState.Connected,
        });

        sounds.playJoin();
        return true;
      } catch (err: any) {
        console.error('Failed to connect to LiveKit room:', err);
        useServerStore.getState().setJoiningVoiceChannel(null);
        set({
          error: err.message || 'Failed to connect to room',
          connectionState: ConnectionState.Disconnected,
        });
        return false;
      }
    },

    disconnect: async () => {
      const { room } = get();
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      cleanupAudioAnalyser();

      if (activeCustomScreenAudioTrack) {
        activeCustomScreenAudioTrack.stop();
        activeCustomScreenAudioTrack = null;
      }

      if (activeCustomScreenTrack) {
        activeCustomScreenTrack.stop();
        activeCustomScreenTrack = null;
      }

      if (room) {
        sounds.playDisconnect();
        try {
          await room.disconnect(true);
        } catch (e) {
          console.warn('Error during room disconnect:', e);
        }
      }

      set({
        room: null,
        localParticipant: null,
        remoteParticipants: [],
        activeSpeakers: new Set(),
        availableScreenShares: [],
        watchedScreenShareIds: new Set(),
        focusedScreenShareId: null,
        activeScreenTrack: null,
        screenSharerIdentity: null,
        screenSharerName: null,
        currentScreenOptions: null,
        isScreenSharing: false,
        isLocallySpeaking: false,
        currentPing: null,
        connectionState: ConnectionState.Disconnected,
      });

      useRoomStore.getState().setActiveRoom(null);
      useRoomStore.getState().setJoiningRoom(null);
      useRoomStore.getState().fetchRooms();
    },

    toggleMute: async () => {
      const { room, isMuted, isDeafened } = get();
      if (!room || !room.localParticipant) return;

      // If user is deafened and clicks to unmute: in Discord, unmuting automatically undeafens as well!
      if (isDeafened) {
        await get().toggleDeafen();
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          set({ isMuted: false });
          useSettingsStore.getState().setSelfMuted(false);
          sounds.playUnmute();
        } catch (err: any) {
          console.error('Failed to unmute mic:', err);
        }
        return;
      }

      const newMuted = !isMuted;
      try {
        await room.localParticipant.setMicrophoneEnabled(!newMuted);
        set({ isMuted: newMuted });
        useSettingsStore.getState().setSelfMuted(newMuted);
        if (newMuted) {
          sounds.playMute();
        } else {
          sounds.playUnmute();
        }
      } catch (err: any) {
        console.error('Failed to toggle microphone state:', err);
      }
    },

    setPushToTalkActive: async (active: boolean) => {
      const { room, isDeafened } = get();
      // If deafened, cannot transmit
      if (isDeafened) return;
      if (!room || !room.localParticipant) return;

      try {
        await room.localParticipant.setMicrophoneEnabled(active);
        set({ isMuted: !active });
        useSettingsStore.getState().setSelfMuted(!active);
        if (active) {
          sounds.playPttActivate();
        } else {
          sounds.playPttDeactivate();
        }
      } catch (err) {
        console.warn('Failed to update PTT mic state:', err);
      }
    },

    toggleDeafen: async () => {
      const { room, isDeafened } = get();
      const newDeafened = !isDeafened;

      if (newDeafened) {
        // Deafen ALWAYS mutes the user as well (like Discord: deafen = deafened + muted)
        try {
          if (room?.localParticipant) {
            await room.localParticipant.setMicrophoneEnabled(false);
          }
        } catch (e) {
          console.warn('Error disabling mic on deafen:', e);
        }
        set({ isDeafened: true, isMuted: true });
        useSettingsStore.getState().setDeafened(true);
        useSettingsStore.getState().setSelfDeafened(true);
        useSettingsStore.getState().setSelfMuted(true);
        sounds.playDeafen();
      } else {
        // Undeafen: restore deafened state
        set({ isDeafened: false });
        useSettingsStore.getState().setDeafened(false);
        useSettingsStore.getState().setSelfDeafened(false);
        sounds.playUndeafen();
      }

      if (room) {
        applyDeafenToRemoteTracks(room, newDeafened);
      }
    },

    startScreenShare: async (sourceId?: string, options?: ScreenShareOptions) => {
      const { room } = get();
      if (!room || !room.localParticipant) return false;

      const opts: ScreenShareOptions = {
        resolution: options?.resolution || '1080p',
        frameRate: options?.frameRate || 30,
        preset: options?.preset || 'motion',
        includeAudio: options?.includeAudio ?? true,
      };

      try {
        if (sourceId && (window as any).nightshift?.isElectron) {
          const targetFps = opts.frameRate || 30;
          const constraints: any = {
            audio: opts.includeAudio
              ? {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                  },
                }
              : false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                maxFrameRate: targetFps,
              },
            },
          };

          if (opts.resolution === '720p') {
            constraints.video.mandatory.minWidth = 1280;
            constraints.video.mandatory.maxWidth = 1280;
            constraints.video.mandatory.minHeight = 720;
            constraints.video.mandatory.maxHeight = 720;
          } else if (opts.resolution === '1080p') {
            constraints.video.mandatory.minWidth = 1920;
            constraints.video.mandatory.maxWidth = 1920;
            constraints.video.mandatory.minHeight = 1080;
            constraints.video.mandatory.maxHeight = 1080;
          } else if (opts.resolution === '1440p') {
            constraints.video.mandatory.minWidth = 2560;
            constraints.video.mandatory.maxWidth = 2560;
            constraints.video.mandatory.minHeight = 1440;
            constraints.video.mandatory.maxHeight = 1440;
          }

          const stream = await (navigator.mediaDevices as any).getUserMedia(constraints);

          const videoTrack = stream.getVideoTracks()[0];
          if (!videoTrack) throw new Error('No video track returned from screen capture');

          videoTrack.contentHint = opts.preset === 'detail' ? 'detail' : 'motion';
          videoTrack.onended = () => {
            get().stopScreenShare();
          };

          const localTrack = new LocalVideoTrack(videoTrack);
          activeCustomScreenTrack = localTrack;

          let maxBitrate = 5_000_000;
          if (opts.resolution === '720p') {
            maxBitrate = targetFps === 60 ? 4_500_000 : 3_000_000;
          } else if (opts.resolution === '1080p') {
            maxBitrate = targetFps === 60 ? 8_000_000 : 5_000_000;
          } else if (opts.resolution === '1440p' || opts.resolution === 'source') {
            maxBitrate = targetFps === 60 ? 12_000_000 : 8_000_000;
          }

          await room.localParticipant.publishTrack(localTrack, {
            name: 'screen-video',
            source: Track.Source.ScreenShare,
            videoEncoding: {
              maxBitrate,
              maxFramerate: targetFps,
              priority: 'high',
            },
            simulcast: false,
          });

          // Check if system audio track was captured
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            try {
              const localAudioTrack = new LocalAudioTrack(audioTracks[0]);
              activeCustomScreenAudioTrack = localAudioTrack;
              await room.localParticipant.publishTrack(localAudioTrack, {
                name: 'screen-audio',
                source: Track.Source.ScreenShareAudio,
              });
            } catch (audioPubErr) {
              console.warn('Could not publish system audio track:', audioPubErr);
            }
          }
        } else {
          const width = opts.resolution === '720p' ? 1280 : opts.resolution === '1440p' ? 2560 : 1920;
          const height = opts.resolution === '720p' ? 720 : opts.resolution === '1440p' ? 1440 : 1080;
          const targetFps = opts.frameRate || 30;

          await room.localParticipant.setScreenShareEnabled(true, {
            audio: opts.includeAudio ?? true,
            resolution: {
              width,
              height,
              frameRate: targetFps,
            },
            contentHint: opts.preset === 'detail' ? 'detail' : 'motion',
          });
        }

        set({ currentScreenOptions: opts });
        updateScreenShareState(room);
        return true;
      } catch (err: any) {
        console.error('Failed to start screen share:', err);
        set({ error: err.message || 'Screen sharing cancelled or failed' });
        return false;
      }
    },

    stopScreenShare: async () => {
      const { room } = get();
      if (!room || !room.localParticipant) return;

      try {
        if (activeCustomScreenAudioTrack) {
          await room.localParticipant.unpublishTrack(activeCustomScreenAudioTrack);
          activeCustomScreenAudioTrack.stop();
          activeCustomScreenAudioTrack = null;
        }
        if (activeCustomScreenTrack) {
          await room.localParticipant.unpublishTrack(activeCustomScreenTrack);
          activeCustomScreenTrack.stop();
          activeCustomScreenTrack = null;
        } else {
          await room.localParticipant.setScreenShareEnabled(false);
        }
      } catch (err) {
        console.warn('Error stopping screen share:', err);
      } finally {
        set({ currentScreenOptions: null });
        updateScreenShareState(room);
      }
    },

    startWatchingStream: (identity: string) => {
      const watched = new Set(get().watchedScreenShareIds);
      watched.add(identity);
      const shares = get().availableScreenShares;
      const target = shares.find((s) => s.participantIdentity === identity);
      set({
        watchedScreenShareIds: watched,
        focusedScreenShareId: identity,
        activeScreenTrack: target ? target.publication : get().activeScreenTrack,
        screenSharerIdentity: target ? target.participantIdentity : get().screenSharerIdentity,
        screenSharerName: target ? target.participantName : get().screenSharerName,
      });
    },

    stopWatchingStream: (identity: string) => {
      const watched = new Set(get().watchedScreenShareIds);
      watched.delete(identity);
      const remaining = Array.from(watched);
      const shares = get().availableScreenShares;
      const nextId = remaining[0] || null;
      const nextShare = nextId ? shares.find((s) => s.participantIdentity === nextId) : null;
      set({
        watchedScreenShareIds: watched,
        focusedScreenShareId: nextId,
        activeScreenTrack: nextShare ? nextShare.publication : null,
        screenSharerIdentity: nextShare ? nextShare.participantIdentity : null,
        screenSharerName: nextShare ? nextShare.participantName : null,
      });
    },

    setFocusedScreenShare: (identity: string | null) => {
      if (!identity) {
        set({ focusedScreenShareId: null });
        return;
      }
      const shares = get().availableScreenShares;
      const target = shares.find((s) => s.participantIdentity === identity);
      if (target) {
        set({
          focusedScreenShareId: identity,
          activeScreenTrack: target.publication,
          screenSharerIdentity: target.participantIdentity,
          screenSharerName: target.participantName,
        });
      }
    },

    setAudioInputDevice: async (deviceId: string) => {
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId);
      }
    },

    setAudioOutputDevice: async (deviceId: string) => {
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audiooutput', deviceId);
      }
    },

    setParticipantVolume: (identity: string, volumePercent: number) => {
      useSettingsStore.getState().setParticipantVolume(identity, volumePercent);
      const { room } = get();
      if (!room) return;

      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
            (pub.track as RemoteAudioTrack).setVolume(volumePercent / 100);
          }
        });
      }
    },

    broadcastChatMessage: async (roomId: string, message: MessageDto) => {
      const { room } = get();
      if (!room || !room.localParticipant) return;

      try {
        const payload = JSON.stringify({
          type: 'chat_message',
          roomId,
          message,
        });
        const bytes = new TextEncoder().encode(payload);
        await room.localParticipant.publishData(bytes, { reliable: true });
      } catch (err) {
        console.warn('Failed to broadcast chat message:', err);
      }
    },
  };
});
