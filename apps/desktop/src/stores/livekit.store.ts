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
import { soundboardAudioEngine } from '../services/soundboard-audio-engine';

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

  activeSoundboardPlayers: Record<string, { soundName: string; soundId: string; startedAt: number; duration: number }>;
  broadcastSoundboardPlaying: (soundId: string, soundName: string, duration: number) => Promise<void>;
  broadcastSoundboardStopped: (soundId: string) => Promise<void>;
  setParticipantSoundboardVolume: (identity: string, volumePercent: number) => void;
  toggleMuteSoundboardForMyself: (identity: string) => void;

  // Stream watching actions
  startWatchingStream: (participantIdentity: string) => void;
  stopWatchingStream: (participantIdentity: string) => void;
  setFocusedScreenShare: (participantIdentity: string | null) => void;
  applyAudioProcessingSettings: () => Promise<void>;
  setAudioInputDevice: (deviceId: string) => Promise<void>;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
  setPushToTalkActive: (active: boolean) => Promise<void>;
  setParticipantVolume: (identity: string, volumePercent: number) => void;
  toggleMuteForMyself: (identity: string) => void;
  broadcastChatMessage: (roomId: string, message: MessageDto) => Promise<void>;
}

export const useLiveKitStore = create<LiveKitState>((set, get) => {
  let activeCustomScreenTrack: LocalVideoTrack | null = null;
  let activeCustomScreenAudioTrack: LocalAudioTrack | null = null;
  let activeLocalSoundboardTrack: LocalAudioTrack | null = null;
  let activeLocalMicTrack: MediaStreamTrack | null = null;
  let activeAnalyserStream: MediaStream | null = null;
  let activeAnalyserTrack: MediaStreamTrack | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let localAudioContext: AudioContext | null = null;
  let localAudioSource: MediaStreamAudioSourceNode | null = null;
  let localAnalyser: AnalyserNode | null = null;
  let localAudioInterval: ReturnType<typeof setInterval> | null = null;
  let localScriptProcessor: ScriptProcessorNode | null = null;
  let localSilentGain: GainNode | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupAudioAnalyser = () => {
    if (localAudioInterval) {
      clearInterval(localAudioInterval);
      localAudioInterval = null;
    }
    if (localScriptProcessor) {
      try {
        localScriptProcessor.disconnect();
      } catch {}
      localScriptProcessor = null;
    }
    if (localSilentGain) {
      try {
        localSilentGain.disconnect();
      } catch {}
      localSilentGain = null;
    }
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (localAudioSource) {
      try {
        localAudioSource.disconnect();
      } catch {}
      localAudioSource = null;
    }
    if (activeAnalyserStream) {
      try {
        activeAnalyserStream.getTracks().forEach((t) => t.stop());
      } catch {}
      activeAnalyserStream = null;
    }
    if (activeAnalyserTrack) {
      try {
        activeAnalyserTrack.stop();
      } catch {}
      activeAnalyserTrack = null;
    }
    if (localAudioContext) {
      try {
        localAudioContext.close().catch(() => {});
      } catch {}
      localAudioContext = null;
    }
    activeLocalMicTrack = null;
    set({ isLocallySpeaking: false });
  };

  const setupAudioAnalyser = async (track: MediaStreamTrack) => {
    cleanupAudioAnalyser();
    activeLocalMicTrack = track;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        if (track && !get().isMuted && !get().isDeafened) track.enabled = true;
        return;
      }

      // Safe AudioContext constructor: avoid sampleRate error on 44.1kHz audio hardware
      try {
        localAudioContext = new AudioCtx({ sampleRate: 48000 });
      } catch {
        localAudioContext = new AudioCtx();
      }

      if (localAudioContext.state === 'suspended') {
        localAudioContext.resume().catch(() => {});
      }

      const settings = useSettingsStore.getState();
      const isVoiceActivity = settings.inputMode === 'voice-activity';

      // To prevent Chromium from deadlocking cloned audio when track.enabled is muted on WebRTC,
      // we acquire an isolated hardware stream specifically for voice activity detection.
      let stream: MediaStream;
      try {
        const streamConstraints: MediaStreamConstraints = {
          audio: {
            deviceId:
              settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default'
                ? { exact: settings.audioInputDeviceId }
                : undefined,
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression !== 'none',
            autoGainControl: true,
          },
        };
        stream = await navigator.mediaDevices.getUserMedia(streamConstraints);
        activeAnalyserStream = stream;
      } catch {
        // Fallback to track clone if second getUserMedia is denied
        activeAnalyserTrack = track.clone();
        activeAnalyserTrack.enabled = true;
        stream = new MediaStream([activeAnalyserTrack]);
      }

      localAudioSource = localAudioContext.createMediaStreamSource(stream);

      // Cascaded Vocal Bandpass Filtering (140 Hz 4th-order High-Pass + 3400 Hz Low-Pass):
      // Aggressively strips breath puffs, microphone air turbulence, desk thumps, and high hiss
      const highpass1 = localAudioContext.createBiquadFilter();
      highpass1.type = 'highpass';
      highpass1.frequency.setValueAtTime(140, localAudioContext.currentTime);
      highpass1.Q.setValueAtTime(1.0, localAudioContext.currentTime);

      const highpass2 = localAudioContext.createBiquadFilter();
      highpass2.type = 'highpass';
      highpass2.frequency.setValueAtTime(140, localAudioContext.currentTime);
      highpass2.Q.setValueAtTime(1.0, localAudioContext.currentTime);

      const lowpass = localAudioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(3400, localAudioContext.currentTime);
      lowpass.Q.setValueAtTime(0.7, localAudioContext.currentTime);

      localAnalyser = localAudioContext.createAnalyser();
      localAnalyser.fftSize = 512;
      localAnalyser.smoothingTimeConstant = 0.2;

      localAudioSource.connect(highpass1);
      highpass1.connect(highpass2);
      highpass2.connect(lowpass);
      lowpass.connect(localAnalyser);

      // Terminate analyser through a ScriptProcessor connected to a silent GainNode.
      // This forces the Web Audio thread to process audio callbacks continuously via hardware
      // buffers even when the window is minimized or occluded by other applications!
      try {
        localScriptProcessor = localAudioContext.createScriptProcessor(1024, 1, 1);
        localSilentGain = localAudioContext.createGain();
        localSilentGain.gain.setValueAtTime(0, localAudioContext.currentTime);

        localAnalyser.connect(localScriptProcessor);
        localScriptProcessor.connect(localSilentGain);
        localSilentGain.connect(localAudioContext.destination);
      } catch (procErr) {
        console.warn('ScriptProcessor fallback notice:', procErr);
      }

      const timeBuffer = new Uint8Array(localAnalyser.fftSize);

      // In voice-activity mode, start with WebRTC track muted until real speech is detected
      if (isVoiceActivity && !get().isMuted && !get().isDeafened) {
        track.enabled = false;
      } else if (!get().isMuted && !get().isDeafened) {
        track.enabled = true;
      }

      const processAudioSample = () => {
        if (!localAnalyser) return;

        // Auto-resume AudioContext if suspended by OS/power saver
        if (localAudioContext && localAudioContext.state === 'suspended') {
          localAudioContext.resume().catch(() => {});
        }

        localAnalyser.getByteTimeDomainData(timeBuffer);

        let sumSquares = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          const sample = (timeBuffer[i] - 128) / 128;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const db = 20 * Math.log10(Math.max(0.00001, rms));

        // Calibrated Decibel Curve:
        // Room silence / breath: < -50 dB -> 0%
        // Whispers: -40 dB -> ~33%
        // Normal voice: -26 dB to -14 dB -> 80% - 100%
        const normalized = Math.max(0, Math.min(100, Math.round(((db + 50) / 30) * 100)));

        const currentSettings = useSettingsStore.getState();
        const isPtt = currentSettings.inputMode === 'push-to-talk';
        const isMuted = get().isMuted;
        const isDeafened = get().isDeafened;
        const threshold = currentSettings.autoSensitivity
          ? 35
          : (currentSettings.sensitivityThreshold ?? currentSettings.voiceActivationThreshold ?? 35);

        if (isMuted || isDeafened) {
          if (track.enabled) track.enabled = false;
          if (get().isLocallySpeaking) {
            set({ isLocallySpeaking: false });
            const localId = get().localParticipant?.identity;
            if (localId) {
              set((state) => {
                const updated = new Set(state.activeSpeakers);
                updated.delete(localId);
                return { activeSpeakers: updated };
              });
            }
          }
          return;
        }

        if (isPtt) {
          // Managed by setPushToTalkActive
          return;
        }

        // Voice Activity Gating:
        if (normalized >= threshold) {
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          if (!track.enabled) {
            track.enabled = true;
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
          // Below threshold: smooth 280ms hangover timer so speech endings are never clipped
          if (!silenceTimer && get().isLocallySpeaking) {
            silenceTimer = setTimeout(() => {
              track.enabled = false;
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
            }, 280);
          }
        }
      };

      if (localScriptProcessor) {
        localScriptProcessor.onaudioprocess = () => {
          processAudioSample();
        };
      }

      // 25ms background interval ensures uninterrupted processing when minimized or unfocused
      localAudioInterval = setInterval(() => {
        processAudioSample();
      }, 25);
    } catch (e) {
      console.warn('Could not setup local audio analyzer:', e);
      // Failsafe: if analyzer fails, never silence user
      if (track && !get().isMuted && !get().isDeafened) {
        track.enabled = true;
      }
    }
  };

  const measurePing = async (room: Room) => {
    try {
      const pcManager = (room.engine as any)?.pcManager;
      const candidates = [
        pcManager?.publisher?.getStats ? pcManager.publisher : null,
        pcManager?.subscriber?.getStats ? pcManager.subscriber : null,
        (room.engine as any)?.publisher?.getStats ? (room.engine as any).publisher : null,
        (room.engine as any)?.subscriber?.getStats ? (room.engine as any).subscriber : null,
        (room.engine as any)?.pc?.getStats ? (room.engine as any).pc : null,
      ].filter(Boolean);

      let bestRtt: number | null = null;

      for (const transport of candidates) {
        try {
          const stats: RTCStatsReport = await transport.getStats();
          if (!stats) continue;

          let selectedPairId: string | undefined;
          const candidatePairs: any[] = [];

          for (const report of stats.values()) {
            if (report.type === 'transport' && (report as any).selectedCandidatePairId) {
              selectedPairId = (report as any).selectedCandidatePairId;
            } else if (report.type === 'candidate-pair') {
              candidatePairs.push(report);
            }
          }

          // Prioritize: 1) transport's selectedCandidatePairId, 2) pair with selected === true, 3) nominated & succeeded
          let activePair =
            (selectedPairId ? stats.get(selectedPairId) : undefined) ??
            candidatePairs.find((c) => c.selected && (c.currentRoundTripTime || c.totalRoundTripTime)) ??
            candidatePairs.find(
              (c) => c.nominated && c.state === 'succeeded' && (c.currentRoundTripTime || c.totalRoundTripTime)
            );

          if (!activePair && candidatePairs.length > 0) {
            const valid = candidatePairs
              .filter(
                (c) =>
                  (c.state === 'succeeded' || c.nominated) &&
                  typeof c.currentRoundTripTime === 'number' &&
                  c.currentRoundTripTime > 0
              )
              .sort((a, b) => a.currentRoundTripTime - b.currentRoundTripTime);
            if (valid.length > 0) {
              activePair = valid[0];
            }
          }

          if (activePair) {
            let rttSec = activePair.currentRoundTripTime;
            if (typeof rttSec !== 'number' || rttSec <= 0) {
              if (
                typeof activePair.totalRoundTripTime === 'number' &&
                typeof activePair.responsesReceived === 'number' &&
                activePair.responsesReceived > 0
              ) {
                rttSec = activePair.totalRoundTripTime / activePair.responsesReceived;
              }
            }
            if (typeof rttSec === 'number' && rttSec > 0) {
              const rttMs = Math.round(rttSec * 1000);
              if (rttMs > 0 && rttMs < 2000) {
                if (bestRtt === null || rttMs < bestRtt) {
                  bestRtt = rttMs;
                }
              }
            }
          }
        } catch {}
      }

      if (bestRtt !== null) {
        set({ currentPing: bestRtt });
        return;
      }

      // Check engine's internal RTT calculation if available
      const engineRtt = (room.engine as any)?.rtt;
      if (typeof engineRtt === 'number' && engineRtt > 0 && engineRtt < 2000) {
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
    let primary: ActiveScreenShare | undefined = list.find((s) => s.participantIdentity === focusedId && currentWatched.has(s.participantIdentity));
    if (!primary) {
      primary = list.find((s) => currentWatched.has(s.participantIdentity));
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
    const localMuted = useSettingsStore.getState().localMutedUsers;
    const volumes = useSettingsStore.getState().participantVolumes;
    const sbMuted = useSettingsStore.getState().localMutedSoundboards;
    const sbVolumes = useSettingsStore.getState().soundboardVolumes;

    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        const isSoundboard = pub.trackName === 'soundboard' || (pub.track as any)?.name === 'soundboard';
        const isLocallyMuted = isSoundboard
          ? !!sbMuted[participant.identity]
          : !!localMuted[participant.identity];
        const vol = isSoundboard
          ? (sbVolumes[participant.identity] ?? 100)
          : (volumes[participant.identity] ?? 100);

        if (pub.track && pub.track.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = !deafened && !isLocallyMuted;
        }
        if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
          (pub.track as RemoteAudioTrack).setVolume(deafened || isLocallyMuted ? 0 : vol / 100);
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
    activeSoundboardPlayers: {},
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
        adaptiveStream: false, // Ensure full original stream resolution is never downscaled
        dynacast: false,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        publishDefaults: {
          simulcast: false,
          degradationPreference: 'maintain-resolution',
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
        pingInterval = setInterval(() => measurePing(room), 1000);
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

      room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const isSoundboard = (pub && pub.trackName === 'soundboard') || (track as any).name === 'soundboard';

          if (isSoundboard) {
            let container = document.getElementById('nightshift-soundboard-audio-container');
            if (!container) {
              container = document.createElement('div');
              container.id = 'nightshift-soundboard-audio-container';
              container.style.display = 'none';
              document.body.appendChild(container);
            }
            const element = track.attach();
            element.autoplay = true;
            container.appendChild(element);

            // Apply saved per-participant soundboard volume and local mute
            const isLocallyMuted = !!useSettingsStore.getState().localMutedSoundboards[participant.identity];
            const savedVol = useSettingsStore.getState().soundboardVolumes[participant.identity] ?? 100;
            if (typeof (track as RemoteAudioTrack).setVolume === 'function') {
              (track as RemoteAudioTrack).setVolume(isLocallyMuted || get().isDeafened ? 0 : savedVol / 100);
            }

            if ((get().isDeafened || isLocallyMuted) && track.mediaStreamTrack) {
              track.mediaStreamTrack.enabled = false;
            }
          } else if (track.source === Track.Source.Microphone) {
            let container = document.getElementById('nightshift-voice-audio-container');
            if (!container) {
              container = document.createElement('div');
              container.id = 'nightshift-voice-audio-container';
              container.style.display = 'none';
              document.body.appendChild(container);
            }
            const element = track.attach();
            element.autoplay = true;
            container.appendChild(element);

            // Apply saved per-participant volume and local mute
            const isLocallyMuted = !!useSettingsStore.getState().localMutedUsers[participant.identity];
            const savedVol = useSettingsStore.getState().participantVolumes[participant.identity] ?? 100;
            if (typeof (track as RemoteAudioTrack).setVolume === 'function') {
              (track as RemoteAudioTrack).setVolume(isLocallyMuted || get().isDeafened ? 0 : savedVol / 100);
            }

            if ((get().isDeafened || isLocallyMuted) && track.mediaStreamTrack) {
              track.mediaStreamTrack.enabled = false;
            }
          }
        }
        updateScreenShareState(room);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        try {
          const detached = track.detach();
          detached.forEach((el) => el.remove());
        } catch {}
        updateScreenShareState(room);
      });

      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.track && pub.track.kind === Track.Kind.Audio) {
          const localAudio = pub.track as LocalAudioTrack;
          if (localAudio.mediaStreamTrack && pub.source === Track.Source.Microphone) {
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
          } else if (data.type === 'soundboard_playing' && data.participantIdentity) {
            set((state) => ({
              activeSoundboardPlayers: {
                ...state.activeSoundboardPlayers,
                [data.participantIdentity]: {
                  soundName: data.soundName || 'Audio',
                  soundId: data.soundId || '',
                  startedAt: data.startedAt || Date.now(),
                  duration: data.duration || 0,
                },
              },
            }));
          } else if (data.type === 'soundboard_stopped' && data.participantIdentity) {
            set((state) => {
              const updated = { ...state.activeSoundboardPlayers };
              delete updated[data.participantIdentity];
              return { activeSoundboardPlayers: updated };
            });
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
        const isNoiseSuppressed = settings.noiseSuppression !== 'none';
        const isEchoCancelled = settings.echoCancellation;

        try {
          await room.localParticipant.setMicrophoneEnabled(!isPtt, {
            echoCancellation: isEchoCancelled,
            noiseSuppression: isNoiseSuppressed,
            autoGainControl: true,
            deviceId:
              settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default'
                ? settings.audioInputDeviceId
                : undefined,
          });
          set({ isMuted: isPtt });

          const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          );
          if (micPub && micPub.track && (micPub.track as LocalAudioTrack).mediaStreamTrack) {
            setupAudioAnalyser((micPub.track as LocalAudioTrack).mediaStreamTrack!);
            await get().applyAudioProcessingSettings();
          }
        } catch (micErr: any) {
          console.warn('Microphone error:', micErr);
          set({ isMuted: true, error: 'Could not access microphone: ' + (micErr.message || 'Permission denied') });
        }

        // Publish dedicated Soundboard audio track (Separate from microphone stream)
        try {
          const sbMediaTrack = soundboardAudioEngine.initializePipeline();
          const sbTrack = new LocalAudioTrack(sbMediaTrack);
          activeLocalSoundboardTrack = sbTrack;
          await room.localParticipant.publishTrack(sbTrack, {
            name: 'soundboard',
            source: Track.Source.Unknown,
            dtx: false,
          });
          console.log('[LiveKit] Dedicated Soundboard audio track published successfully');
        } catch (sbErr) {
          console.warn('[LiveKit] Soundboard track publish failed:', sbErr);
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
      if (activeLocalSoundboardTrack) {
        try {
          activeLocalSoundboardTrack.stop();
        } catch {}
        activeLocalSoundboardTrack = null;
      }
      soundboardAudioEngine.cleanup();

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

      // Clean up any remaining audio elements in DOM
      try {
        const audioContainer = document.getElementById('nightshift-voice-audio-container');
        if (audioContainer) {
          audioContainer.innerHTML = '';
        }
        const sbContainer = document.getElementById('nightshift-soundboard-audio-container');
        if (sbContainer) {
          sbContainer.innerHTML = '';
        }
      } catch {}

      set({
        room: null,
        localParticipant: null,
        remoteParticipants: [],
        activeSpeakers: new Set(),
        activeSoundboardPlayers: {},
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
      useServerStore.getState().setActiveVoiceChannel(null);
      useServerStore.getState().setJoiningVoiceChannel(null);
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
        soundboardAudioEngine.setMicrophoneMuted(newMuted);
        await room.localParticipant.setMicrophoneEnabled(!newMuted);

        if (activeLocalMicTrack) {
          activeLocalMicTrack.enabled = !newMuted && useSettingsStore.getState().inputMode !== 'voice-activity';
        }

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
        if (activeLocalMicTrack) {
          activeLocalMicTrack.enabled = active;
        }
        soundboardAudioEngine.setMicrophoneMuted(!active);
        await room.localParticipant.setMicrophoneEnabled(active);
        set({ isMuted: !active, isLocallySpeaking: active });
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
          if (activeLocalMicTrack) {
            activeLocalMicTrack.enabled = false;
          }
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
                minFrameRate: targetFps,
                maxFrameRate: targetFps,
              },
            },
          };

          if (opts.resolution === '720p') {
            constraints.video.mandatory.maxWidth = 1280;
            constraints.video.mandatory.maxHeight = 720;
          } else if (opts.resolution === '1080p') {
            constraints.video.mandatory.maxWidth = 1920;
            constraints.video.mandatory.maxHeight = 1080;
          } else if (opts.resolution === '1440p') {
            constraints.video.mandatory.maxWidth = 2560;
            constraints.video.mandatory.maxHeight = 1440;
          } else if (opts.resolution === '4k' || opts.resolution === 'source') {
            constraints.video.mandatory.maxWidth = 3840;
            constraints.video.mandatory.maxHeight = 2160;
          }

          let stream: MediaStream;
          try {
            stream = await (navigator.mediaDevices as any).getUserMedia(constraints);
          } catch (audioErr) {
            if (opts.includeAudio) {
              console.warn('Screen capture with audio failed, falling back to video only:', audioErr);
              constraints.audio = false;
              stream = await (navigator.mediaDevices as any).getUserMedia(constraints);
            } else {
              throw audioErr;
            }
          }

          const videoTrack = stream.getVideoTracks()[0];
          if (!videoTrack) throw new Error('No video track returned from screen capture');

          videoTrack.contentHint = opts.preset === 'detail' ? 'detail' : 'motion';
          videoTrack.onended = () => {
            get().stopScreenShare();
          };

          const localTrack = new LocalVideoTrack(videoTrack);
          activeCustomScreenTrack = localTrack;

          let maxBitrate = 8_000_000;
          if (opts.resolution === '720p') {
            maxBitrate = targetFps === 60 ? 6_000_000 : 4_500_000;
          } else if (opts.resolution === '1080p') {
            maxBitrate = targetFps === 60 ? 12_000_000 : 8_000_000;
          } else if (opts.resolution === '1440p') {
            maxBitrate = targetFps === 60 ? 20_000_000 : 14_000_000;
          } else if (opts.resolution === '4k' || opts.resolution === 'source') {
            maxBitrate = targetFps === 60 ? 35_000_000 : 25_000_000;
          }

          const pub = await room.localParticipant.publishTrack(localTrack, {
            name: 'screen-video',
            source: Track.Source.ScreenShare,
            videoEncoding: {
              maxBitrate,
              maxFramerate: targetFps,
              priority: 'high',
            },
            simulcast: false,
            degradationPreference: 'maintain-resolution',
          });

          // Enforce 1:1 scale resolution and maintain-resolution on RTCRtpSender
          try {
            const sender = (pub as any)?.sender as RTCRtpSender | undefined;
            if (sender && typeof sender.getParameters === 'function') {
              const params = sender.getParameters();
              if (params && params.encodings && params.encodings.length > 0) {
                params.encodings.forEach((enc) => {
                  enc.scaleResolutionDownBy = 1.0;
                  enc.maxBitrate = maxBitrate;
                  enc.maxFramerate = targetFps;
                  enc.networkPriority = 'high';
                });
                (params as any).degradationPreference = 'maintain-resolution';
                await sender.setParameters(params);
              }
            }
          } catch (paramErr) {
            console.warn('Sender parameter enforcement info:', paramErr);
          }

          // Check if system audio track was captured
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            try {
              const localAudioTrack = new LocalAudioTrack(audioTracks[0]);
              activeCustomScreenAudioTrack = localAudioTrack;
              await room.localParticipant.publishTrack(localAudioTrack, {
                name: 'screen-audio',
                source: Track.Source.ScreenShareAudio,
                dtx: false,
              });
              console.log('[LiveKit] Screen audio track published successfully');
            } catch (audioPubErr) {
              console.warn('Could not publish system audio track:', audioPubErr);
            }
          }
        } else {
          const width =
            opts.resolution === '720p'
              ? 1280
              : opts.resolution === '1440p'
              ? 2560
              : opts.resolution === '4k'
              ? 3840
              : opts.resolution === 'source'
              ? 3840
              : 1920;
          const height =
            opts.resolution === '720p'
              ? 720
              : opts.resolution === '1440p'
              ? 1440
              : opts.resolution === '4k'
              ? 2160
              : opts.resolution === 'source'
              ? 2160
              : 1080;
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

    applyAudioProcessingSettings: async () => {
      const settings = useSettingsStore.getState();
      const isNoiseSuppressed = settings.noiseSuppression !== 'none';
      const isEchoCancelled = settings.echoCancellation;

      const constraints: MediaTrackConstraints = {
        echoCancellation: isEchoCancelled ? { ideal: true } : false,
        noiseSuppression: isNoiseSuppressed ? { ideal: true } : false,
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        ...(isEchoCancelled
          ? {
              googEchoCancellation: { ideal: true } as any,
              googEchoCancellation2: { ideal: true } as any,
              googDAEchoCancellation: { ideal: true } as any,
            }
          : {
              googEchoCancellation: { ideal: false } as any,
            }),
        ...(isNoiseSuppressed
          ? {
              googNoiseSuppression: { ideal: true } as any,
              googNoiseSuppression2: { ideal: true } as any,
              googHighpassFilter: { ideal: true } as any,
              googTypingNoiseDetection: { ideal: true } as any,
            }
          : {
              googNoiseSuppression: { ideal: false } as any,
              googHighpassFilter: { ideal: false } as any,
            }),
      };

      if (activeLocalMicTrack) {
        try {
          await activeLocalMicTrack.applyConstraints(constraints);
          console.log('[LiveKit] Applied Ultra voice audio constraints to active mic track');
        } catch (err) {
          console.warn('[LiveKit] Could not apply dynamic audio constraints:', err);
        }
      }
    },

    setAudioInputDevice: async (deviceId: string) => {
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId);
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone
        );
        if (micPub && micPub.track && (micPub.track as LocalAudioTrack).mediaStreamTrack) {
          setupAudioAnalyser((micPub.track as LocalAudioTrack).mediaStreamTrack!);
          await get().applyAudioProcessingSettings();
        }
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
      const { room, isDeafened } = get();
      if (!room) return;

      const isLocallyMuted = !!useSettingsStore.getState().localMutedUsers[identity];
      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Microphone) {
            if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
              (pub.track as RemoteAudioTrack).setVolume(isLocallyMuted || isDeafened ? 0 : volumePercent / 100);
            }
            if (pub.track && pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !isLocallyMuted && !isDeafened;
            }
          }
        });
      }
    },

    setParticipantSoundboardVolume: (identity: string, volumePercent: number) => {
      useSettingsStore.getState().setSoundboardVolume(identity, volumePercent);
      const { room, isDeafened } = get();
      if (!room) return;

      const isMuted = !!useSettingsStore.getState().localMutedSoundboards[identity];
      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.trackName === 'soundboard' || (pub.track as any)?.name === 'soundboard') {
            if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
              (pub.track as RemoteAudioTrack).setVolume(isMuted || isDeafened ? 0 : volumePercent / 100);
            }
            if (pub.track && pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !isMuted && !isDeafened;
            }
          }
        });
      }
    },

    toggleMuteForMyself: (identity: string) => {
      useSettingsStore.getState().toggleLocalMute(identity);
      const isLocallyMuted = !!useSettingsStore.getState().localMutedUsers[identity];
      const currentVol = useSettingsStore.getState().participantVolumes[identity] ?? 100;
      const { room, isDeafened } = get();
      if (!room) return;

      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Microphone) {
            if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
              (pub.track as RemoteAudioTrack).setVolume(isLocallyMuted || isDeafened ? 0 : currentVol / 100);
            }
            if (pub.track && pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !isLocallyMuted && !isDeafened;
            }
          }
        });
      }
    },

    toggleMuteSoundboardForMyself: (identity: string) => {
      useSettingsStore.getState().toggleLocalMutedSoundboard(identity);
      const isMuted = !!useSettingsStore.getState().localMutedSoundboards[identity];
      const currentVol = useSettingsStore.getState().soundboardVolumes[identity] ?? 100;
      const { room, isDeafened } = get();
      if (!room) return;

      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.trackName === 'soundboard' || (pub.track as any)?.name === 'soundboard') {
            if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
              (pub.track as RemoteAudioTrack).setVolume(isMuted || isDeafened ? 0 : currentVol / 100);
            }
            if (pub.track && pub.track.mediaStreamTrack) {
              pub.track.mediaStreamTrack.enabled = !isMuted && !isDeafened;
            }
          }
        });
      }
    },

    broadcastSoundboardPlaying: async (soundId: string, soundName: string, duration: number) => {
      const { room } = get();
      if (!room || !room.localParticipant) return;
      const identity = room.localParticipant.identity;
      const payload = {
        type: 'soundboard_playing',
        participantIdentity: identity,
        soundId,
        soundName,
        duration,
        startedAt: Date.now(),
      };
      set((state) => ({
        activeSoundboardPlayers: {
          ...state.activeSoundboardPlayers,
          [identity]: { soundName, soundId, startedAt: Date.now(), duration },
        },
      }));
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        await room.localParticipant.publishData(bytes, { reliable: true });
      } catch (e) {
        console.warn('Failed to broadcast soundboard_playing:', e);
      }
    },

    broadcastSoundboardStopped: async (soundId: string) => {
      const { room } = get();
      if (!room || !room.localParticipant) return;
      const identity = room.localParticipant.identity;
      const payload = {
        type: 'soundboard_stopped',
        participantIdentity: identity,
        soundId,
      };
      set((state) => {
        const updated = { ...state.activeSoundboardPlayers };
        delete updated[identity];
        return { activeSoundboardPlayers: updated };
      });
      try {
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        await room.localParticipant.publishData(bytes, { reliable: true });
      } catch (e) {
        console.warn('Failed to broadcast soundboard_stopped:', e);
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
