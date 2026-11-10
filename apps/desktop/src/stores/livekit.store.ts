import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  Track,
  Participant,
  LocalParticipant,
  RemoteParticipant,
  ConnectionState,
  DisconnectReason,
  LocalVideoTrack,
  TrackPublication,
  RemoteTrackPublication,
  LocalAudioTrack,
  RemoteAudioTrack,
  AudioPresets,
} from 'livekit-client';
import { useSettingsStore } from './settings.store';
import { sounds } from '../services/sound.service';
import { ScreenShareOptions, MessageDto } from '@nightshift/shared';
import { useChatStore } from './chat.store';
import { useRoomStore } from './room.store';
import { useServerStore } from './server.store';
import { soundboardAudioEngine } from '../services/soundboard-audio-engine';
import { api } from '../lib/api';
import { captureConstraintFlags, createVoiceProcessor, readCleanerState, setVoiceCleanerState, type CleanerState } from '../audio/voice-cleaner';
import { isolateSharedSystemAudio } from '../audio/screen-audio-isolation';
import { useAuthStore } from './auth.store';

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
  participantPings: Record<string, number>;
  participantAvatars: Record<string, string>;
  isReconnecting: boolean;
  reconnectSecondsLeft: number;
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
  disconnect: (notifyServer?: boolean | { notifyServer?: boolean; playSound?: boolean; keepChannel?: boolean }) => Promise<void>;
  moveToVoiceChannel: (channelId: string) => Promise<boolean>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startScreenShare: (sourceId?: string, options?: ScreenShareOptions) => Promise<boolean>;
  stopScreenShare: () => Promise<void>;

  activeSoundboardPlayers: Record<string, { soundName: string; soundId: string; startedAt: number; duration: number }>;
  broadcastSoundboardPlaying: (soundId: string, soundName: string, duration: number) => Promise<void>;
  broadcastSoundboardStopped: (soundId: string) => Promise<void>;
  setParticipantSoundboardVolume: (identity: string, volumePercent: number) => void;
  toggleMuteSoundboardForMyself: (identity: string) => void;
  ensureSoundboardTrackPublished: () => Promise<void>;

  // Stream watching actions
  startWatchingStream: (participantIdentity: string) => void;
  stopWatchingStream: (participantIdentity: string) => void;
  setFocusedScreenShare: (participantIdentity: string | null) => void;
  applyAudioProcessingSettings: () => Promise<void>;
  syncCaptureToLevels: (levels: CleanerState) => Promise<void>;
  setAudioInputDevice: (deviceId: string) => Promise<void>;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
  setPushToTalkActive: (active: boolean, seq?: number) => Promise<void>;
  announceAvatar: () => void;
  getAudioSenderStats: () => Promise<any>;
  testContinuousAudio: (durationMs?: number) => Promise<{ success: boolean; packetsSent: number; bytesSent: number; error?: string }>;
  testUiPtt: (durationMs?: number) => Promise<{ success: boolean; packetsSent: number; bytesSent: number; error?: string }>;
  setParticipantVolume: (identity: string, volumePercent: number) => void;
  setMasterOutputVolume: (volumePercent: number) => void;
  toggleMuteForMyself: (identity: string) => void;
  broadcastChatMessage: (roomId: string, message: MessageDto) => Promise<void>;
  broadcastChatDeleted: (roomId: string, messageId: string) => Promise<void>;
  canPlaybackAudio: boolean;
  startAudio: () => Promise<void>;
}

export const useLiveKitStore = create<LiveKitState>((set, get) => {
  let activeCustomScreenTrack: LocalVideoTrack | null = null;
  let activeCustomScreenAudioTrack: LocalAudioTrack | null = null;
  let stopScreenAudioIsolation: (() => void) | null = null;
  let activeLocalSoundboardTrack: LocalAudioTrack | null = null;
  let activeLocalMicTrack: MediaStreamTrack | null = null;
  let activeAnalyserStream: MediaStream | null = null;
  let activeAnalyserTrack: MediaStreamTrack | null = null;
  let pttQueue: Promise<void> = Promise.resolve();
  let targetPttActive = false;
  let currentPttSeq = 0;
  let pttReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  let pttTailCommit = false;
  const PTT_TAIL_MS = 400;
  let mutedBeforeDeafen = false;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectCountdownInterval: ReturnType<typeof setInterval> | null = null;
  let lastPingBroadcastTime = 0;
  let voiceMove: Promise<boolean> | null = null;
  let connectedVoiceChannelId: string | null = null;
  let voiceProcessContext: AudioContext | null = null;
  let browserCapture = { echo: true, noise: true };

  const cleanerFromSettings = (): CleanerState => {
    const settings = useSettingsStore.getState();
    return {
      noise: Number.isFinite(settings.noiseAmount) ? settings.noiseAmount : 0,
      echo: Number.isFinite(settings.echoAmount) ? settings.echoAmount : 0,
      sensitivity: Number.isFinite(settings.sensitivityThreshold) ? settings.sensitivityThreshold : 35,
      auto: settings.autoSensitivity !== false,
      ptt: settings.inputMode === 'push-to-talk',
    };
  };

  const micConstraints = () => {
    const settings = useSettingsStore.getState();
    const levels = cleanerFromSettings();
    const flags = captureConstraintFlags(levels.noise, levels.echo);
    const deviceId = settings.audioInputDeviceId;
    return {
      ...flags,
      deviceId:
        deviceId && deviceId !== 'default' && deviceId !== 'communications'
          ? deviceId
          : undefined,
    };
  };

  const ensureVoiceCleaner = async (localAudio: LocalAudioTrack, useSaved = true) => {
    if (useSaved) setVoiceCleanerState(cleanerFromSettings());
    if ((localAudio as any).processor?.name === 'nightshift-voice-cleaner') return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!voiceProcessContext || voiceProcessContext.state === 'closed') {
      voiceProcessContext = new AudioCtx();
    }
    if (voiceProcessContext.state === 'suspended') {
      await voiceProcessContext.resume().catch(() => {});
    }
    await (localAudio as any).setAudioContext(voiceProcessContext);
    await localAudio.setProcessor(
      createVoiceProcessor(() => readCleanerState()),
    );
  };
  let localAudioContext: AudioContext | null = null;
  let localAudioSource: MediaStreamAudioSourceNode | null = null;
  let localAudioInterval: ReturnType<typeof setInterval> | null = null;
  let localScriptProcessor: ScriptProcessorNode | null = null;
  let localSilentGain: GainNode | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupAudioAnalyser = () => {
    const published = activeLocalMicTrack;
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
    // The analyser stream must be a clone. Stopping the published track here
    // ends the microphone, so nobody hears you until mute/unmute restarts it.
    if (activeAnalyserStream) {
      try {
        activeAnalyserStream.getTracks().forEach((t) => {
          if (t !== published) t.stop();
        });
      } catch {}
      activeAnalyserStream = null;
    }
    if (activeAnalyserTrack && activeAnalyserTrack !== published) {
      try {
        activeAnalyserTrack.stop();
      } catch {}
    }
    activeAnalyserTrack = null;
    if (localAudioContext) {
      try {
        localAudioContext.close().catch(() => {});
      } catch {}
      localAudioContext = null;
    }
    activeLocalMicTrack = null;
    set({ isLocallySpeaking: false });
  };

  const releaseMediaElement = (el: HTMLMediaElement) => {
    try {
      el.pause();
      el.srcObject = null;
      el.removeAttribute('src');
    } catch {}
    try {
      el.remove();
    } catch {}
  };

  const clearAudioContainer = (id: string) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.querySelectorAll('audio, video').forEach((node) => {
      releaseMediaElement(node as HTMLMediaElement);
    });
  };

  const clearReconnectWatchdog = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (reconnectCountdownInterval) {
      clearInterval(reconnectCountdownInterval);
      reconnectCountdownInterval = null;
    }
    set({ isReconnecting: false, reconnectSecondsLeft: 0 });
  };

  const startReconnectWatchdog = () => {
    if (reconnectTimer) return;
    set({
      isReconnecting: true,
      reconnectSecondsLeft: 60,
      error: 'اتصال اینترنت شما با سرور قطع شده است. در حال تلاش برای اتصال مجدد...',
    });

    let seconds = 60;
    if (reconnectCountdownInterval) clearInterval(reconnectCountdownInterval);
    reconnectCountdownInterval = setInterval(() => {
      seconds -= 1;
      if (seconds >= 0) {
        set({ reconnectSecondsLeft: seconds });
      }
    }, 1000);

    reconnectTimer = setTimeout(async () => {
      console.warn('[LiveKit] Reconnection timed out after 60 seconds. Force disconnecting voice channel.');
      clearReconnectWatchdog();
      try {
        sessionStorage.removeItem('nightshift_active_voice_session');
      } catch {}
      await get().disconnect();
      set({
        error: 'اتصال شما به ویس چت به دلیل قطعی بیش از ۱ دقیقه اینترنت قطع شد.',
      });
    }, 60000);
  };

  const setupAudioAnalyser = (track: MediaStreamTrack) => {
    if (!track) return;
    cleanupAudioAnalyser();
    activeLocalMicTrack = track;
    const pttMode = useSettingsStore.getState().inputMode === 'push-to-talk';
    if (!get().isMuted && !get().isDeafened && !pttMode) track.enabled = true;
    // LiveKit already measures the mic on the audio thread. A second Web Audio
    // graph plus ScriptProcessor was running on the main thread the whole call.
    localAudioInterval = setInterval(() => {
      const live = activeLocalMicTrack;
      if (!live || live.readyState !== 'live') return;
      const ptt = useSettingsStore.getState().inputMode === 'push-to-talk';
      const transmit = !get().isMuted && !get().isDeafened && (!ptt || targetPttActive);
      if (live.enabled !== transmit) live.enabled = transmit;
    }, 1000);
  };

  let lastMeasuredPing = 0;
  let isPingMeasuring = false;

  const rttToMs = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    // Spec values are seconds. A few stacks already return milliseconds.
    const ms = value > 10 ? value : value * 1000;
    if (ms <= 0 || ms >= 1500) return null;
    return Math.round(ms);
  };

  const measurePing = async (room: Room) => {
    if (isPingMeasuring) return;
    isPingMeasuring = true;
    try {
      let audioRtt: number | null = null;
      let selectedPairRtt: number | null = null;

      // Voice delay is the audio RTCP round trip. ICE candidate pairs that are
      // only nominated (not the transport's selected pair) sit near 250-300ms
      // and were what the meter kept showing.
      const pcManager = (room.engine as any)?.pcManager;
      const candidates = [
        pcManager?.publisher?.getStats ? pcManager.publisher : null,
        pcManager?.subscriber?.getStats ? pcManager.subscriber : null,
        (room.engine as any)?.publisher?.getStats ? (room.engine as any).publisher : null,
        (room.engine as any)?.subscriber?.getStats ? (room.engine as any).subscriber : null,
        (room.engine as any)?.pc?.getStats ? (room.engine as any).pc : null,
      ].filter(Boolean);

      for (const transport of candidates) {
        if (audioRtt !== null) break;
        try {
          const stats: RTCStatsReport = await transport.getStats();
          if (!stats) continue;

          const selectedIds = new Set<string>();
          const pairs = new Map<string, any>();
          for (const report of stats.values()) {
            const row = report as any;
            if (row.type === 'transport' && typeof row.selectedCandidatePairId === 'string') {
              selectedIds.add(row.selectedCandidatePairId);
            } else if (row.type === 'candidate-pair' && row.id) {
              pairs.set(row.id, row);
            } else if (row.type === 'remote-inbound-rtp' && row.kind !== 'video') {
              const ms = rttToMs(row.roundTripTime);
              if (ms !== null && (audioRtt === null || ms < audioRtt)) audioRtt = ms;
            }
          }
          selectedIds.forEach((id) => {
            const pair = pairs.get(id);
            const ms = pair ? rttToMs(pair.currentRoundTripTime) : null;
            if (ms !== null && (selectedPairRtt === null || ms < selectedPairRtt)) {
              selectedPairRtt = ms;
            }
          });
        } catch {}
      }

      const signalRaw = (room.engine as any)?.client?.rtt;
      const signalRtt = rttToMs(signalRaw);
      // Audio RTCP is the voice path. The signal pong is the same LiveKit server
      // and stays low when an unused ICE pair reports 250-300ms. Prefer the pong
      // when the audio sample is far above it.
      let bestRtt = audioRtt ?? signalRtt ?? selectedPairRtt;
      if (
        audioRtt !== null &&
        signalRtt !== null &&
        audioRtt > signalRtt + 80 &&
        signalRtt < 180
      ) {
        bestRtt = signalRtt;
      }

      if (bestRtt !== null) {
        let smoothed = bestRtt;
        if (lastMeasuredPing > 0) {
          if (bestRtt + 30 < lastMeasuredPing) {
            smoothed = bestRtt;
          } else if (bestRtt < lastMeasuredPing) {
            smoothed = Math.round(lastMeasuredPing * 0.2 + bestRtt * 0.8);
          } else {
            smoothed = Math.round(lastMeasuredPing * 0.5 + bestRtt * 0.5);
          }
        }
        lastMeasuredPing = smoothed;

        set((state) => ({
          currentPing: smoothed,
          participantPings: {
            ...state.participantPings,
            [room.localParticipant.identity]: smoothed,
            ...(room.localParticipant.name ? { [room.localParticipant.name]: smoothed } : {}),
          },
        }));

        const now = Date.now();
        if (now - lastPingBroadcastTime >= 2000) {
          lastPingBroadcastTime = now;
          try {
            const payload = new TextEncoder().encode(
              JSON.stringify({
                type: 'ping_stat',
                identity: room.localParticipant.identity,
                name: room.localParticipant.name,
                ping: smoothed,
              })
            );
            room.localParticipant.publishData(payload, {
              reliable: false,
              topic: 'pings',
            });
          } catch {}
        }
      }
    } catch {
      // Ignore transient ping failure
    } finally {
      isPingMeasuring = false;
    }
  };

  const updateScreenShareState = (room: Room) => {
    const list: ActiveScreenShare[] = [];

    // 1. Check local participant
    const localScreenPub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted && !!pub.track
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
        (pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted
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

  class RemoteAudioGainEngine {
    private masterLinear = Math.max(0, (useSettingsStore.getState().outputVolume ?? 100) / 100);
    private pending = new Map<string, { track: MediaStreamTrack; volume: number; muted: boolean; element: HTMLMediaElement | null }>();

    constructor() {
      const unlockAudio = () => this.flushPending();
      if (typeof window !== 'undefined') {
        window.addEventListener('pointerdown', unlockAudio, { passive: true });
        window.addEventListener('keydown', unlockAudio, { passive: true });
        window.addEventListener('touchstart', unlockAudio, { passive: true });
      }
    }

    public isRouted(_trackKey: string): boolean {
      return false;
    }

    private applyElement(element: HTMLMediaElement | null, volumePercent: number, isMuted: boolean, _takenByGraph: boolean) {
      if (!element) return;
      try {
        const vol = isMuted ? 0 : Math.max(0, Math.min(1, (volumePercent / 100) * this.masterLinear));
        element.muted = vol === 0;
        element.volume = vol;
        if (vol > 0) element.play().catch(() => {});
      } catch {}
    }

    private flushOne(trackKey: string): boolean {
      const item = this.pending.get(trackKey);
      if (!item?.track) return false;
      // Play the remote track on its own <audio> element. A second Web Audio
      // graph mutes that element and, in the browser, often stays silent.
      this.applyElement(item.element, item.volume, item.muted, false);
      return false;
    }

    private flushPending() {
      Array.from(this.pending.keys()).forEach((key) => this.flushOne(key));
    }

    public routeTrack(
      trackKey: string,
      mediaStreamTrack: MediaStreamTrack,
      volumePercent: number,
      isMuted: boolean,
      element?: HTMLMediaElement | null,
    ): boolean {
      if (!mediaStreamTrack) return false;
      const previous = this.pending.get(trackKey);
      this.pending.set(trackKey, {
        track: mediaStreamTrack,
        volume: volumePercent,
        muted: isMuted,
        element: element ?? previous?.element ?? null,
      });
      return this.flushOne(trackKey);
    }

    public setMasterOutputVolume(volumePercent: number): void {
      this.masterLinear = Math.max(0, volumePercent / 100);
      this.flushPending();
    }

    public async setSinkId(deviceId: string): Promise<void> {
      const id = deviceId && deviceId !== 'default' && deviceId !== 'communications' ? deviceId : '';
      const elements = Array.from(this.pending.values())
        .map((item) => item.element)
        .filter((el): el is HTMLMediaElement => !!el && typeof el.setSinkId === 'function');
      await Promise.all(elements.map(async (el) => {
        try {
          await el.setSinkId(id);
        } catch (err) {
          console.warn('[RemoteAudioGainEngine] Could not move playback to the selected output:', err);
          if (id) {
            try { await el.setSinkId(''); } catch {}
          }
        }
      }));
    }

    public updateSoundboardVolume(identity: string, volumePercent: number, isMuted: boolean): void {
      const prefix = `${identity}_soundboard`;
      this.pending.forEach((item, key) => {
        if (key.startsWith(prefix) || key.includes(prefix) || (key.startsWith(identity) && !key.includes('_mic_'))) {
          item.volume = volumePercent;
          item.muted = isMuted;
          this.applyElement(item.element, item.volume, item.muted, false);
        }
      });
    }

    public updateVolume(trackKey: string, volumePercent: number, isMuted: boolean): void {
      const pendingItem = this.pending.get(trackKey);
      if (pendingItem) {
        pendingItem.volume = volumePercent;
        pendingItem.muted = isMuted;
        this.applyElement(pendingItem.element, volumePercent, isMuted, false);
      }
      const parts = trackKey.split('_');
      const prefix = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : trackKey;
      this.pending.forEach((item, key) => {
        if (key === trackKey) return;
        if (key.startsWith(prefix)) {
          item.volume = volumePercent;
          item.muted = isMuted;
          this.applyElement(item.element, volumePercent, isMuted, false);
        }
      });
    }

    public unrouteTrack(trackKey: string): void {
      this.pending.delete(trackKey);
    }

    public clear(): void {
      this.pending.clear();
    }
  }

  const remoteAudioGainEngine = new RemoteAudioGainEngine();

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

        const trackKey = `${participant.identity}_${isSoundboard ? 'soundboard' : 'mic'}_${pub.trackSid || pub.track?.sid || pub.trackName || 'audio'}`;
        remoteAudioGainEngine.updateVolume(trackKey, vol, deafened || isLocallyMuted);

        if (pub.track && pub.track.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = !deafened && !isLocallyMuted;
        }
        if (pub.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
          try {
            (pub.track as RemoteAudioTrack).setVolume(deafened || isLocallyMuted ? 0 : Math.max(0, Math.min(1, vol / 100)));
          } catch {}
        }
      });
    });
  };

  return {
    room: null,
    connectionState: ConnectionState.Disconnected,
    canPlaybackAudio: true,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    isLocallySpeaking: false,
    currentPing: null,
    participantPings: {},
    participantAvatars: {},
    isReconnecting: false,
    reconnectSecondsLeft: 0,
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
      await get().disconnect(false);

      set({ connectionState: ConnectionState.Connecting, error: null });

      const room = new Room({
        adaptiveStream: false, // Ensure full original stream resolution is never downscaled
        dynacast: false,
        audioCaptureDefaults: {
          ...captureConstraintFlags(
            Number.isFinite(useSettingsStore.getState().noiseAmount) ? useSettingsStore.getState().noiseAmount : 0,
            Number.isFinite(useSettingsStore.getState().echoAmount) ? useSettingsStore.getState().echoAmount : 0,
          ),
        },
        publishDefaults: {
          simulcast: false,
          degradationPreference: 'maintain-resolution',
          audioPreset: AudioPresets.speech,
          red: true,
          dtx: false,
        },
      });

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (get().room && get().room !== room) return;
        set({ connectionState: state });
        if (state === ConnectionState.Connected) {
          clearReconnectWatchdog();
        } else if (state === ConnectionState.Reconnecting) {
          startReconnectWatchdog();
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (get().room && get().room !== room) return;
        set({ connectionState: ConnectionState.Reconnecting });
        startReconnectWatchdog();
      });

      room.on(RoomEvent.Reconnected, () => {
        if (get().room && get().room !== room) return;
        clearReconnectWatchdog();
        set({ connectionState: ConnectionState.Connected, error: null });
        sounds.playJoin();
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        if (get().room && get().room !== room) return;
        clearReconnectWatchdog();
        const code = typeof reason === 'number' ? reason : Number(reason);
        let message: string | null = null;
        if (code === DisconnectReason.DUPLICATE_IDENTITY) {
          message = 'این حساب از یک پنجره یا برنامهٔ دیگر داخل ویس است. همان را ببند و دوباره وصل شو.';
        } else if (code === DisconnectReason.PARTICIPANT_REMOVED) {
          message = 'سرور تو را از ویس بیرون کرد.';
        } else if (code === DisconnectReason.JOIN_FAILURE) {
          message = 'اتصال به ویس برقرار نشد. یک بار دیگر وارد کانال شو.';
        } else if (
          code === DisconnectReason.SIGNAL_CLOSE ||
          code === DisconnectReason.STATE_MISMATCH ||
          code === DisconnectReason.SERVER_SHUTDOWN ||
          code === DisconnectReason.ROOM_DELETED ||
          code === DisconnectReason.ROOM_CLOSED ||
          code === DisconnectReason.CONNECTION_TIMEOUT ||
          code === DisconnectReason.MEDIA_FAILURE
        ) {
          message = 'ارتباط با سرور ویس قطع شد. اینترنت را چک کن و دوباره وصل شو.';
        } else if (
          Number.isFinite(code) &&
          code !== DisconnectReason.CLIENT_INITIATED &&
          code !== DisconnectReason.UNKNOWN_REASON &&
          code !== DisconnectReason.MIGRATION
        ) {
          message = `اتصال ویس قطع شد (${code}).`;
        }
        set({
          connectionState: ConnectionState.Disconnected,
          ...(message ? { error: message } : {}),
        });
      });

      room.on(RoomEvent.Connected, () => {
        if (get().room && get().room !== room) return;
        clearReconnectWatchdog();
        set({
          connectionState: ConnectionState.Connected,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
          error: null,
        });
        useRoomStore.getState().setJoiningRoom(null);
        useServerStore.getState().setJoiningVoiceChannel(null);
        useRoomStore.getState().fetchRooms();
        get().announceAvatar();
        measurePing(room);
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => measurePing(room), 8000);

        // Request active soundboard / music status from room members who are currently playing
        const requestSoundboardSync = () => {
          try {
            if (room.localParticipant && room.state === ConnectionState.Connected) {
              const syncReq = new TextEncoder().encode(JSON.stringify({ type: 'soundboard_sync_request' }));
              room.localParticipant.publishData(syncReq, { reliable: true });
            }
          } catch {}
        };
        setTimeout(requestSoundboardSync, 400);
        setTimeout(requestSoundboardSync, 1200);
      });

      const subscribeVoiceAudio = (participant: RemoteParticipant) => {
        participant.audioTrackPublications.forEach((pub) => {
          const isScreen =
            pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
          try {
            if (isScreen) {
              pub.setSubscribed(get().watchedScreenShareIds.has(participant.identity));
            } else {
              pub.setSubscribed(true);
            }
          } catch {}
        });
      };

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        subscribeVoiceAudio(participant);
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        sounds.playUserConnected();
        useRoomStore.getState().fetchRooms();

        // If local user is currently playing music, announce it to the newcomer once their data channel is ready
        const announceIfPlaying = () => {
          try {
            const localActive = soundboardAudioEngine.getActiveSounds().filter((s) => !s.isLocalOnly);
            if (localActive.length > 0 && room.localParticipant && room.state === ConnectionState.Connected) {
              const current = localActive[0];
              get().broadcastSoundboardPlaying(current.soundId, current.name, current.duration);
            }
          } catch (e) {
            console.warn('Failed to announce soundboard to newcomer:', e);
          }
        };
        setTimeout(announceIfPlaying, 500);
        setTimeout(announceIfPlaying, 1500);
        setTimeout(() => get().announceAvatar(), 400);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        set((state) => {
          const updatedPings = { ...state.participantPings };
          const updatedSoundboard = { ...state.activeSoundboardPlayers };
          if (participant?.identity) {
            delete updatedPings[participant.identity];
            delete updatedSoundboard[participant.identity];
          }
          return {
            remoteParticipants: Array.from(room.remoteParticipants.values()),
            participantPings: updatedPings,
            activeSoundboardPlayers: updatedSoundboard,
          };
        });
        sounds.playUserDisconnected();
        updateScreenShareState(room);
        useRoomStore.getState().fetchRooms();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const speakingSet = new Set<string>();
        speakers.forEach((s) => speakingSet.add(s.identity));
        if (get().isLocallySpeaking && !get().isMuted && !get().isDeafened && room.localParticipant) {
          speakingSet.add(room.localParticipant.identity);
        }
        set({ activeSpeakers: speakingSet });
      });

      room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, (speaking: boolean) => {
        if (!get().isMuted && !get().isDeafened) {
          set((state) => {
            const updated = new Set(state.activeSpeakers);
            if (speaking || get().isLocallySpeaking) {
              updated.add(room.localParticipant.identity);
            } else {
              updated.delete(room.localParticipant.identity);
            }
            return { activeSpeakers: updated };
          });
        }
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        set({ canPlaybackAudio: room.canPlaybackAudio });
        if (!room.canPlaybackAudio) {
          room.startAudio().catch(() => {});
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        const isScreenMedia =
          pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
        if (isScreenMedia && !participant.isLocal && !get().watchedScreenShareIds.has(participant.identity)) {
          try { pub.setSubscribed(false); } catch {}
          try {
            track.detach().forEach((el) => {
              if (el instanceof HTMLMediaElement) {
                el.pause();
                el.srcObject = null;
              }
              el.remove();
            });
          } catch {}
          return;
        }
        if (track.kind === Track.Kind.Audio) {
          const trackName = (pub?.trackName || (pub as any)?.name || (track as any)?.name || '').toLowerCase();
          const isSoundboard = trackName === 'soundboard';
          const containerId = isSoundboard ? 'nightshift-soundboard-audio-container' : 'nightshift-voice-audio-container';
          let container = document.getElementById(containerId);
          if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.top = '-9999px';
            container.style.width = '0';
            container.style.height = '0';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);
          }

          const isLocallyMuted = isSoundboard
            ? !!useSettingsStore.getState().localMutedSoundboards[participant.identity]
            : !!useSettingsStore.getState().localMutedUsers[participant.identity];
          const savedVol = isSoundboard
            ? (useSettingsStore.getState().soundboardVolumes[participant.identity] ?? 100)
            : (useSettingsStore.getState().participantVolumes[participant.identity] ?? 100);

          const element = track.attach();
          element.autoplay = true;
          element.setAttribute('playsinline', 'true');
          container.appendChild(element);

          const trackKey = `${participant.identity}_${isSoundboard ? 'soundboard' : 'mic'}_${track.sid || (track as any).name || pub?.trackName || 'audio'}`;
          const isMutedTotal = isLocallyMuted || get().isDeafened;
          const targetVol = isMutedTotal ? 0 : Math.min(1, Math.max(0, savedVol / 100));

          // Keep the <audio> element audible until the gain graph is actually running.
          // Muting it while AudioContext is still suspended is why voice stayed silent
          // until the next mute click.
          if (track.mediaStreamTrack) {
            remoteAudioGainEngine.routeTrack(trackKey, track.mediaStreamTrack, savedVol, isMutedTotal, element);
          } else {
            element.volume = targetVol;
            element.muted = targetVol === 0;
          }
          if (typeof (track as any).setVolume === 'function') {
            try {
              (track as any).setVolume(targetVol);
            } catch {}
          }

          element.play().catch(() => {});
          if (room && !room.canPlaybackAudio) {
            room.startAudio().catch(() => {});
          }

          if (isMutedTotal && track.mediaStreamTrack) {
            track.mediaStreamTrack.enabled = false;
          }

          // If this is a soundboard track, ask the sender if they have an active song playing
          if (isSoundboard && participant && participant.identity) {
            try {
              if (room.localParticipant && room.state === ConnectionState.Connected) {
                const req = new TextEncoder().encode(JSON.stringify({ type: 'soundboard_sync_request' }));
                room.localParticipant.publishData(req, { reliable: true });
              }
            } catch {}
          }
        }
        updateScreenShareState(room);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        try {
          if (participant && track.kind === Track.Kind.Audio) {
            const trackName = (pub?.trackName || (pub as any)?.name || (track as any)?.name || '').toLowerCase();
            const isSoundboard = trackName === 'soundboard';
            const trackKey = `${participant.identity}_${isSoundboard ? 'soundboard' : 'mic'}_${track.sid || (track as any).name || pub?.trackName || 'audio'}`;
            remoteAudioGainEngine.unrouteTrack(trackKey);

            if (isSoundboard) {
              set((state) => {
                const updated = { ...state.activeSoundboardPlayers };
                delete updated[participant.identity];
                return { activeSoundboardPlayers: updated };
              });
            }
          }
          track.detach().forEach((el) => releaseMediaElement(el));
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

      room.on(RoomEvent.TrackPublished, (pub, participant) => {
        const isScreenMedia =
          pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
        if (!participant.isLocal) {
          try {
            if (isScreenMedia) {
              pub.setSubscribed(get().watchedScreenShareIds.has(participant.identity));
            } else if (pub.kind === Track.Kind.Audio) {
              pub.setSubscribed(true);
            }
          } catch {}
        }
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        updateScreenShareState(room);
      });

      room.on(RoomEvent.TrackUnpublished, (pub, participant) => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        updateScreenShareState(room);

        // Immediate cleanup if soundboard track is unpublished
        const trackName = (pub?.trackName || (pub as any)?.name || '').toLowerCase();
        if (trackName === 'soundboard' && participant?.identity) {
          set((state) => {
            const updated = { ...state.activeSoundboardPlayers };
            delete updated[participant.identity];
            return { activeSoundboardPlayers: updated };
          });
        }
      });

      room.on(RoomEvent.TrackMuted, (pub, _participant) => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        if (pub.source === Track.Source.ScreenShare) {
          updateScreenShareState(room);
        }
      });

      room.on(RoomEvent.TrackUnmuted, (pub, _participant) => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        if (pub.source === Track.Source.ScreenShare) {
          updateScreenShareState(room);
        }
      });

      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const text = new TextDecoder().decode(payload);
          const data = JSON.parse(text);
          if (data.type === 'ping_stat' && data.identity && typeof data.ping === 'number') {
            const p = Math.round(data.ping);
            set((state) => ({
              participantPings: {
                ...state.participantPings,
                [data.identity]: p,
                ...(data.name ? { [data.name]: p } : {}),
              },
            }));
          } else if (data.type === 'chat_message' && data.message && data.roomId) {
            useChatStore.getState().addMessage(data.roomId, data.message);
          } else if (data.type === 'chat_message_deleted' && data.roomId && data.messageId) {
            useChatStore.getState().removeMessage(data.roomId, data.messageId);
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
          } else if (data.type === 'screenshare_stopped' && data.participantIdentity) {
            // Instant drop of screenshare card when someone closes screen share
            set((state) => {
              const filtered = state.availableScreenShares.filter((s) => s.participantIdentity !== data.participantIdentity);
              const watched = new Set(state.watchedScreenShareIds);
              watched.delete(data.participantIdentity);
              return {
                availableScreenShares: filtered,
                watchedScreenShareIds: watched,
                activeScreenTrack: state.screenSharerIdentity === data.participantIdentity ? null : state.activeScreenTrack,
                screenSharerIdentity: state.screenSharerIdentity === data.participantIdentity ? null : state.screenSharerIdentity,
                screenSharerName: state.screenSharerIdentity === data.participantIdentity ? null : state.screenSharerName,
              };
            });
            updateScreenShareState(room);
          } else if (data.type === 'avatar' && data.identity) {
            const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : null;
            set((state) => ({
              participantAvatars: { ...state.participantAvatars, [data.identity]: avatarUrl || '' },
            }));
            useServerStore.getState().patchMemberAvatar(data.identity, avatarUrl);
          } else if (data.type === 'soundboard_sync_request') {
            // Someone joined the room and requested active music playback state
            try {
              const localActive = soundboardAudioEngine.getActiveSounds().filter((s) => !s.isLocalOnly);
              if (localActive.length > 0 && room.localParticipant) {
                const current = localActive[0];
                get().broadcastSoundboardPlaying(current.soundId, current.name, current.duration);
              }
            } catch {}
          }
        } catch (err) {
          console.warn('Error parsing data packet:', err);
        }
      });

      const deviceSync = useSettingsStore.getState().syncSystemDevices().catch(() => null);

      try {
        await room.connect(url, token, {
          autoSubscribe: false,
        });

        room.remoteParticipants.forEach((participant) => {
          participant.audioTrackPublications.forEach((pub) => {
            const isScreen =
              pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio;
            try {
              pub.setSubscribed(!isScreen || get().watchedScreenShareIds.has(participant.identity));
            } catch {}
          });
        });

        // In web browsers, ensure WebRTC audio playback is activated (handles autoplay policy)
        try {
          await room.startAudio();
        } catch (audioErr) {
          console.warn('Audio playback pending user gesture:', audioErr);
        }

        await deviceSync;
        const settings = useSettingsStore.getState();

        // Ensure microphone track is acquired and published to LiveKit
        const isPtt = settings.inputMode === 'push-to-talk';
        const capture = micConstraints();
        browserCapture = { echo: capture.echoCancellation, noise: capture.noiseSuppression };

        const outputId = settings.audioOutputDeviceId || 'default';
        const outputApply = Promise.all([
          Promise.resolve(sounds.setOutputDevice(outputId)),
          remoteAudioGainEngine.setSinkId(outputId),
          room.switchActiveDevice('audiooutput', outputId === 'communications' ? 'default' : outputId).catch(() => {}),
        ]).catch(() => {});

        try {
          const startMuted = isPtt || settings.isSelfMuted;
          if (startMuted) set({ isMuted: true, isLocallySpeaking: false });

          await room.localParticipant.setMicrophoneEnabled(true, capture);

          let micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          );
          if (micPub?.track && (micPub.track as LocalAudioTrack).mediaStreamTrack?.readyState !== 'live') {
            await room.localParticipant.setMicrophoneEnabled(true, capture);
            micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (p) => p.source === Track.Source.Microphone
            );
          }
          if (micPub?.track) {
            try {
              await ensureVoiceCleaner(micPub.track as LocalAudioTrack);
            } catch (cleanErr) {
              console.warn('[LiveKit] Voice cleaner failed, using browser processing only:', cleanErr);
            }
          }
          let mediaTrack = micPub?.track
            ? (micPub.track as LocalAudioTrack).mediaStreamTrack
            : null;
          if (mediaTrack) {
            setupAudioAnalyser(mediaTrack);
          }
          if (micPub && startMuted) {
            if (mediaTrack) mediaTrack.enabled = false;
            await micPub.mute();
            set({ isMuted: true, isLocallySpeaking: false });
          } else if (micPub) {
            if (mediaTrack && mediaTrack.readyState === 'live') mediaTrack.enabled = true;
            if (micPub.isMuted) await micPub.unmute();
            set({ isMuted: false, isLocallySpeaking: false });
          }
        } catch (micErr: any) {
          console.warn('Microphone error:', micErr);
          set({ isMuted: true, error: 'Could not access microphone: ' + (micErr.message || 'Permission denied') });
        }

        await outputApply;

        set({
          room,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
          connectionState: ConnectionState.Connected,
          canPlaybackAudio: room.canPlaybackAudio,
        });

        // Start ping measurement immediately and periodic updates
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        measurePing(room);
        pingInterval = setInterval(() => {
          if (get().connectionState === ConnectionState.Connected && room) {
            measurePing(room);
          }
        }, 8000);

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

    disconnect: async (notifyServer: boolean | { notifyServer?: boolean; playSound?: boolean; keepChannel?: boolean } = true) => {
      const options =
        notifyServer && typeof notifyServer === 'object' && !('preventDefault' in notifyServer)
          ? notifyServer
          : { notifyServer: typeof notifyServer === 'boolean' ? notifyServer : true };
      const shouldNotify = options.notifyServer !== false;
      const playSound = options.playSound !== false && shouldNotify;
      const keepChannel = options.keepChannel === true;
      const leaving = get().room;
      clearReconnectWatchdog();
      try {
        sessionStorage.removeItem('nightshift_active_voice_session');
      } catch {}

      const { room } = get();
      cleanupAudioAnalyser();
      lastMeasuredPing = 0;
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
      remoteAudioGainEngine.clear();

      if (stopScreenAudioIsolation) {
        stopScreenAudioIsolation();
        stopScreenAudioIsolation = null;
      }
      if (activeCustomScreenAudioTrack) {
        activeCustomScreenAudioTrack.stop();
        activeCustomScreenAudioTrack = null;
      }

      if (activeCustomScreenTrack) {
        activeCustomScreenTrack.stop();
        activeCustomScreenTrack = null;
      }

      const channelToLeave = connectedVoiceChannelId;
      connectedVoiceChannelId = null;
      if (shouldNotify && channelToLeave) {
        void api.leaveVoiceChannel(channelToLeave).catch(() => {});
      }

      if (room) {
        if (playSound) {
          sounds.playDisconnect();
        }
        try {
          await room.disconnect(true);
        } catch (e) {
          console.warn('Error during room disconnect:', e);
        }
      }

      // Clean up any remaining audio elements in DOM
      try {
        clearAudioContainer('nightshift-voice-audio-container');
        clearAudioContainer('nightshift-soundboard-audio-container');
      } catch {}

      if (!get().room || get().room === leaving) {
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
          participantPings: {},
    participantAvatars: {},
          isReconnecting: false,
          reconnectSecondsLeft: 0,
          connectionState: ConnectionState.Disconnected,
        });
      }

      useRoomStore.getState().setActiveRoom(null);
      useRoomStore.getState().setJoiningRoom(null);
      if (!keepChannel) {
        useServerStore.getState().setActiveVoiceChannel(null);
        useServerStore.getState().setJoiningVoiceChannel(null);
        useRoomStore.getState().fetchRooms();
      }
    },

    moveToVoiceChannel: async (channelId: string) => {
      const server = useServerStore.getState();
      const current = connectedVoiceChannelId || server.activeVoiceChannelId;
      const state = get().connectionState;
      if (current === channelId && state === ConnectionState.Connected) {
        server.selectChannel(channelId);
        return true;
      }
      if (voiceMove) {
        try { await voiceMove; } catch {}
        if (useServerStore.getState().activeVoiceChannelId === channelId && get().connectionState === ConnectionState.Connected) {
          return true;
        }
      }

      const run = (async () => {
        const switching =
          !!current &&
          current !== channelId &&
          state !== ConnectionState.Disconnected;
        useServerStore.getState().selectChannel(channelId);
        useServerStore.getState().setJoiningVoiceChannel(channelId);
        useServerStore.getState().setActiveVoiceChannel(channelId);

        const previousChannelId = current !== channelId ? current : null;
        if (previousChannelId) {
          void api.leaveVoiceChannel(previousChannelId).catch(() => {});
        }
        const joinPromise = api.joinVoiceChannel(channelId);
        if (switching) {
          await get().disconnect({ notifyServer: false, playSound: false, keepChannel: true });
        }
        const joinData = await joinPromise;
        const ok = await get().connect(joinData.livekitUrl, joinData.token);
        if (ok) connectedVoiceChannelId = channelId;
        useServerStore.getState().setJoiningVoiceChannel(null);
        if (!ok) return false;
        try {
          sessionStorage.setItem(
            'nightshift_active_voice_session',
            JSON.stringify({
              channelId,
              serverId: useServerStore.getState().activeServerId,
            })
          );
        } catch {}
        return true;
      })();

      voiceMove = run;
      try {
        return await run;
      } catch (err) {
        useServerStore.getState().setJoiningVoiceChannel(null);
        useServerStore.getState().setActiveVoiceChannel(null);
        throw err;
      } finally {
        if (voiceMove === run) voiceMove = null;
      }
    },

    toggleMute: async () => {
      const { room, isMuted, isDeafened } = get();
      if (!room || !room.localParticipant) return;

      // If user is deafened and clicks to unmute: in Discord, unmuting automatically undeafens as well!
      if (isDeafened) {
        mutedBeforeDeafen = false;
        try {
          await get().toggleDeafen();
        } catch (err: any) {
          console.error('Failed to unmute mic:', err);
        }
        return;
      }

      const newMuted = !isMuted;
      try {
        soundboardAudioEngine.setMicrophoneMuted(newMuted);
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone
        );

        if (!micPub?.track && !newMuted) {
          await room.localParticipant.setMicrophoneEnabled(true, micConstraints());
          const opened = Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          );
          if (opened?.track) {
            try { await ensureVoiceCleaner(opened.track as LocalAudioTrack); } catch {}
          }
          const openedTrack = opened?.track
            ? (opened.track as LocalAudioTrack).mediaStreamTrack
            : null;
          if (openedTrack) {
            openedTrack.enabled = true;
            setupAudioAnalyser(openedTrack);
          }
        } else if (newMuted) {
          if (micPub) await micPub.mute();
          if (activeLocalMicTrack && activeLocalMicTrack.readyState === 'live') {
            activeLocalMicTrack.enabled = false;
          }
        } else if (micPub) {
          await micPub.unmute();
          const live = (micPub.track as LocalAudioTrack | undefined)?.mediaStreamTrack;
          if (live && live.readyState === 'live') {
            live.enabled = true;
            if (live !== activeLocalMicTrack) setupAudioAnalyser(live);
          } else if (activeLocalMicTrack && activeLocalMicTrack.readyState === 'live') {
            activeLocalMicTrack.enabled = true;
          }
        }

        set({ isMuted: newMuted });
        useSettingsStore.getState().setSelfMuted(newMuted);
      } catch (err: any) {
        console.error('Failed to toggle microphone state:', err);
      }
    },

    announceAvatar: () => {
      const room = get().room;
      const user = useAuthStore.getState().user;
      if (!room?.localParticipant || !user) return;
      const avatarUrl = user.avatarUrl ?? null;
      const identity = room.localParticipant.identity;
      set((state) => ({
        participantAvatars: { ...state.participantAvatars, [identity]: avatarUrl || '' },
      }));
      useServerStore.getState().patchMemberAvatar(identity, avatarUrl);
      if (room.state !== ConnectionState.Connected) return;
      const bytes = new TextEncoder().encode(JSON.stringify({ type: 'avatar', identity, avatarUrl }));
      room.localParticipant.publishData(bytes, { reliable: true }).catch(() => {});
    },

    setPushToTalkActive: async (active: boolean, seq?: number) => {
      window.nightshift?.logPtt?.(`setPushToTalkActive START: active=${active}, seq=${seq}`);
      // Out-of-order event check: drop if an event with older sequence arrives late
      if (seq !== undefined && currentPttSeq > 0 && seq < currentPttSeq) {
        window.nightshift?.logPtt?.(`Dropping outdated event: seq=${seq} < currentPttSeq=${currentPttSeq}`);
        console.log(`[LiveKit PTT] Dropping outdated event (seq: ${seq} < ${currentPttSeq})`);
        return;
      }
      if (seq !== undefined) {
        currentPttSeq = seq;
      }

      if (active) {
        if (pttReleaseTimer) {
          clearTimeout(pttReleaseTimer);
          pttReleaseTimer = null;
        }
        pttTailCommit = false;
      } else if (!pttTailCommit) {
        const { room, isDeafened } = get();
        if (!isDeafened && room?.localParticipant) sounds.playPttDeactivate();
        if (pttReleaseTimer) clearTimeout(pttReleaseTimer);
        const releaseSeq = currentPttSeq;
        pttReleaseTimer = setTimeout(() => {
          pttReleaseTimer = null;
          pttTailCommit = true;
          void get().setPushToTalkActive(false, releaseSeq);
        }, PTT_TAIL_MS);
        return;
      } else {
        pttTailCommit = false;
      }

      targetPttActive = active;

      const { room, isDeafened } = get();
      if (!isDeafened && room?.localParticipant) {
        const micNow = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone
        );
        const liveNow = micNow?.track
          ? (micNow.track as LocalAudioTrack).mediaStreamTrack
          : null;
        if (liveNow && liveNow.readyState === 'live') liveNow.enabled = active;
        if (active) sounds.playPttActivate();
      }

      // Sequential promise serialization queue: guarantees no overlapping mute/unmute calls
      pttQueue = pttQueue.then(async () => {
        const { room, isDeafened } = get();
        if (isDeafened) {
          window.nightshift?.logPtt?.('Skipping PTT: user is deafened');
          return;
        }
        if (!room || !room.localParticipant) {
          window.nightshift?.logPtt?.('Skipping PTT: not in a connected room');
          return;
        }

        const desiredMuted = !targetPttActive;
        // Publish the gate before any await. The capture analyser runs on the
        // audio thread and was disabling the track again while unmute() was in flight.
        set({ isMuted: desiredMuted, isLocallySpeaking: !desiredMuted });

        try {
          let micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          );

          const capture = micConstraints();

          // Fail-safe: if mic track was somehow not published yet, publish it now
          if (!micPub || !micPub.track) {
            await room.localParticipant.setMicrophoneEnabled(true, capture);
            micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (p) => p.source === Track.Source.Microphone
            );
            if (micPub?.track) {
              try { await ensureVoiceCleaner(micPub.track as LocalAudioTrack); } catch {}
              const opened = (micPub.track as LocalAudioTrack).mediaStreamTrack;
              if (opened) setupAudioAnalyser(opened);
            }
          }

          const mediaTrack = micPub?.track
            ? (micPub.track as LocalAudioTrack).mediaStreamTrack
            : null;

          // A fullscreen game can leave the capturer paused. Reopen it on the way down to talk.
          if (!desiredMuted && mediaTrack && (mediaTrack.readyState !== 'live' || mediaTrack.muted)) {
            window.nightshift?.logPtt?.(`Mic capturer stalled (ready=${mediaTrack.readyState}, muted=${mediaTrack.muted}). Restarting.`);
            try {
              await room.localParticipant.setMicrophoneEnabled(false);
              await room.localParticipant.setMicrophoneEnabled(true, capture);
              micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone
              );
              if (micPub?.track) {
                try { await ensureVoiceCleaner(micPub.track as LocalAudioTrack); } catch {}
              }
              const restarted = micPub?.track
                ? (micPub.track as LocalAudioTrack).mediaStreamTrack
                : null;
              if (restarted) setupAudioAnalyser(restarted);
            } catch (restartErr) {
              window.nightshift?.logPtt?.(`Mic restart failed: ${restartErr}`);
            }
          }

          if (micPub && micPub.track) {
            const liveTrack = (micPub.track as LocalAudioTrack).mediaStreamTrack;
            if (liveTrack) liveTrack.enabled = !desiredMuted;
            if (micPub.isMuted !== desiredMuted) {
              window.nightshift?.logPtt?.(`Mic transition: ${micPub.isMuted ? 'MUTED' : 'UNMUTED'} -> ${desiredMuted ? 'MUTED' : 'UNMUTED'}`);
              console.log(`[LiveKit PTT] Transitioning mic: ${micPub.isMuted ? 'MUTED' : 'UNMUTED'} -> ${desiredMuted ? 'MUTED' : 'UNMUTED'} (active: ${targetPttActive}, seq: ${seq})`);
              if (desiredMuted) {
                await micPub.mute();
              } else {
                await micPub.unmute();
              }
              window.nightshift?.logPtt?.(`Mic transition DONE -> isMuted=${micPub.isMuted}, trackEnabled=${liveTrack?.enabled}`);
            }
            if (liveTrack && liveTrack.enabled !== !desiredMuted) {
              liveTrack.enabled = !desiredMuted;
            }
          }

          soundboardAudioEngine.setMicrophoneMuted(desiredMuted);
          const localId = room.localParticipant?.identity;
          const isSpeaking = !desiredMuted;
          set((state) => {
            const updated = new Set(state.activeSpeakers);
            if (localId) {
              if (isSpeaking) updated.add(localId);
              else updated.delete(localId);
            }
            return {
              isMuted: desiredMuted,
              isLocallySpeaking: isSpeaking,
              activeSpeakers: updated,
            };
          });
        } catch (err) {
          window.nightshift?.logPtt?.(`Error during PTT state update: ${err}`);
          console.warn('[LiveKit PTT] Error during PTT state update:', err);
        }
      });

      return pttQueue;
    },

    getAudioSenderStats: async () => {
      const { room } = get();
      if (!room || !room.localParticipant) return null;
      const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone
      );
      if (!micPub || !micPub.track) return null;
      const track = micPub.track as LocalAudioTrack;
      if (typeof track.getSenderStats === 'function') {
        return await track.getSenderStats();
      }
      return null;
    },

    testContinuousAudio: async (durationMs = 3000) => {
      const { room, isMuted } = get();
      if (!room || !room.localParticipant) {
        return { success: false, packetsSent: 0, bytesSent: 0, error: 'Not connected to room' };
      }
      console.log(`[PTT Diagnostic] Starting Continuous Audio Test for ${durationMs}ms...`);
      const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone
      );
      if (!micPub || !micPub.track) {
        return { success: false, packetsSent: 0, bytesSent: 0, error: 'No microphone track published' };
      }

      const initialStats: any = await (micPub.track as LocalAudioTrack).getSenderStats();
      const initialPackets = (initialStats?.packetsSent || 0) as number;
      const initialBytes = (initialStats?.bytesSent || 0) as number;

      await micPub.unmute();
      set({ isMuted: false, isLocallySpeaking: true });

      await new Promise((res) => setTimeout(res, durationMs));

      const finalStats: any = await (micPub.track as LocalAudioTrack).getSenderStats();
      const finalPackets = (finalStats?.packetsSent || 0) as number;
      const finalBytes = (finalStats?.bytesSent || 0) as number;

      if (isMuted) {
        await micPub.mute();
        set({ isMuted: true, isLocallySpeaking: false });
      }

      const packetsSent = finalPackets - initialPackets;
      const bytesSent = finalBytes - initialBytes;
      const success = packetsSent > 0 || bytesSent > 0;
      console.log(`[PTT Diagnostic] Continuous Audio Result: success=${success}, packets=${packetsSent}, bytes=${bytesSent}`);
      return { success, packetsSent, bytesSent };
    },

    testUiPtt: async (durationMs = 2000) => {
      console.log(`[PTT Diagnostic] Starting UI PTT Test for ${durationMs}ms...`);
      const nextSeq = ++currentPttSeq;
      await get().setPushToTalkActive(true, nextSeq);
      const stats = await get().testContinuousAudio(durationMs);
      await get().setPushToTalkActive(false, ++currentPttSeq);
      return stats;
    },

    toggleDeafen: async () => {
      const { room, isDeafened, isMuted } = get();
      const newDeafened = !isDeafened;
      const micPub = room?.localParticipant
        ? Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          )
        : undefined;

      if (newDeafened) {
        mutedBeforeDeafen = isMuted;
        try {
          if (activeLocalMicTrack) activeLocalMicTrack.enabled = false;
          if (micPub) await micPub.mute();
        } catch (e) {
          console.warn('Error muting mic on deafen:', e);
        }
        set({ isDeafened: true, isMuted: true });
        useSettingsStore.getState().setDeafened(true);
        useSettingsStore.getState().setSelfDeafened(true);
        useSettingsStore.getState().setSelfMuted(true);
      } else {
        const restoreMuted = mutedBeforeDeafen;
        set({ isDeafened: false, isMuted: restoreMuted });
        useSettingsStore.getState().setDeafened(false);
        useSettingsStore.getState().setSelfDeafened(false);
        useSettingsStore.getState().setSelfMuted(restoreMuted);
        if (!restoreMuted) {
          try {
            if (micPub) await micPub.unmute();
            if (activeLocalMicTrack && activeLocalMicTrack.readyState === 'live') {
              activeLocalMicTrack.enabled = true;
            }
          } catch (e) {
            console.warn('Error restoring mic on undeafen:', e);
          }
        }
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
        if (sourceId && !sourceId.startsWith('browser-') && (window as any).nightshift?.isElectron) {
          const targetFps = opts.frameRate || 30;
          const constraints: any = {
            audio: opts.includeAudio
              ? {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
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
            console.warn('Screen capture with audio/constraints failed, trying fallback:', audioErr);
            constraints.audio = false;
            try {
              stream = await (navigator.mediaDevices as any).getUserMedia(constraints);
            } catch (constraintErr) {
              console.warn('Screen capture with custom constraints failed (WGC), trying minimal constraints:', constraintErr);
              stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                  },
                },
              });
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
              const isolated = await isolateSharedSystemAudio(audioTracks[0]);
              stopScreenAudioIsolation = isolated.stop;
              const localAudioTrack = new LocalAudioTrack(isolated.track);
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
          const isMobileDevice =
            typeof navigator !== 'undefined' &&
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          if (isMobileDevice) {
            try {
              await room.localParticipant.setScreenShareEnabled(true, {
                audio: false,
                contentHint: opts.preset === 'detail' ? 'detail' : 'motion',
              });
            } catch (mobErr: any) {
              const name = String(mobErr?.name || '');
              const msg = String(mobErr?.message || '').toLowerCase();
              const cancelled =
                name === 'NotAllowedError' ||
                name === 'AbortError' ||
                msg.includes('permission denied') ||
                msg.includes('cancel');
              if (cancelled) throw mobErr;
              console.warn('Mobile screen share initial call failed, retrying minimal:', mobErr);
              await room.localParticipant.setScreenShareEnabled(true);
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

            const displaySurface =
              sourceId === 'browser-window'
                ? 'window'
                : sourceId === 'browser-tab'
                ? 'browser'
                : sourceId === 'browser-display'
                ? 'monitor'
                : undefined;

            const screenShareConfig: any = {
              audio: opts.includeAudio ?? true,
              resolution: {
                width,
                height,
                frameRate: targetFps,
              },
              contentHint: opts.preset === 'detail' ? 'detail' : 'motion',
            };

            if (displaySurface) {
              screenShareConfig.video = { displaySurface };
            }

            const cancelledByUser = (err: any) => {
              const name = String(err?.name || '');
              const msg = String(err?.message || '').toLowerCase();
              return (
                name === 'NotAllowedError' ||
                name === 'AbortError' ||
                msg.includes('permission denied') ||
                msg.includes('cancel')
              );
            };

            try {
              await room.localParticipant.setScreenShareEnabled(true, screenShareConfig);
            } catch (browserErr) {
              if (cancelledByUser(browserErr) || !screenShareConfig.audio) throw browserErr;
              console.warn('Browser screen share with audio failed, falling back to video only:', browserErr);
              screenShareConfig.audio = false;
              await room.localParticipant.setScreenShareEnabled(true, screenShareConfig);
            }
          }
        }

        set({ currentScreenOptions: opts });
        updateScreenShareState(room);
        return true;
      } catch (err: any) {
        const name = String(err?.name || '');
        const msg = String(err?.message || '').toLowerCase();
        const cancelled =
          name === 'NotAllowedError' ||
          name === 'AbortError' ||
          msg.includes('permission denied') ||
          msg.includes('cancel');
        if (cancelled) {
          set({ error: null });
          return false;
        }
        console.error('Failed to start screen share:', err);
        set({ error: err.message || 'Screen sharing failed' });
        return false;
      }
    },

    stopScreenShare: async () => {
      const { room } = get();
      if (!room || !room.localParticipant) return;

      try {
        // Fast-drop notice to all room participants so "Watch Live" closes instantly
        try {
          const stopMsg = new TextEncoder().encode(JSON.stringify({
            type: 'screenshare_stopped',
            participantIdentity: room.localParticipant.identity,
          }));
          room.localParticipant.publishData(stopMsg, { reliable: true });
        } catch {}

        if (activeCustomScreenAudioTrack) {
          await room.localParticipant.unpublishTrack(activeCustomScreenAudioTrack);
          if (stopScreenAudioIsolation) {
            stopScreenAudioIsolation();
            stopScreenAudioIsolation = null;
          }
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
      const { room } = get();
      if (room) {
        const remote = room.getParticipantByIdentity(identity);
        if (remote) {
          const videoPub = remote.getTrackPublication(Track.Source.ScreenShare) as RemoteTrackPublication | undefined;
          if (videoPub) videoPub.setSubscribed(true);
          const audioPub = remote.getTrackPublication(Track.Source.ScreenShareAudio) as RemoteTrackPublication | undefined;
          if (audioPub) audioPub.setSubscribed(true);
        }
      }
    },

    stopWatchingStream: (identity: string) => {
      const { room } = get();
      if (room) {
        const remote = room.getParticipantByIdentity(identity);
        if (remote) {
          // 1. Unsubscribe from screen video track
          const videoPub = remote.getTrackPublication(Track.Source.ScreenShare) as RemoteTrackPublication | undefined;
          if (videoPub) {
            try {
              videoPub.setSubscribed(false);
              if (videoPub.track) {
                videoPub.track.detach().forEach((el) => {
                  if (el instanceof HTMLMediaElement) {
                    el.pause();
                    el.srcObject = null;
                  }
                  el.remove();
                });
              }
            } catch (e) {
              console.warn('Error unsubscribing screen video:', e);
            }
          }

          // 2. Unsubscribe from screen audio track and completely silence it
          const audioPub = remote.getTrackPublication(Track.Source.ScreenShareAudio) as RemoteTrackPublication | undefined;
          if (audioPub) {
            try {
              audioPub.setSubscribed(false);
              if (audioPub.track) {
                audioPub.track.detach().forEach((el) => {
                  if (el instanceof HTMLMediaElement) {
                    el.pause();
                    el.srcObject = null;
                  }
                  el.remove();
                });
              }
            } catch (e) {
              console.warn('Error unsubscribing screen audio:', e);
            }
          }
        }
      }

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
      await get().syncCaptureToLevels(cleanerFromSettings());
    },

    syncCaptureToLevels: async (levels: CleanerState) => {
      const noise = Number.isFinite(levels.noise) ? levels.noise : 0;
      const echo = Number.isFinite(levels.echo) ? levels.echo : 0;
      setVoiceCleanerState({ ...levels, noise, echo });

      const { room } = get();
      const micPub = room
        ? Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          )
        : undefined;
      const localAudio = micPub?.track as LocalAudioTrack | undefined;
      if (!localAudio) return;

      const next = { echo: echo > 0, noise: noise > 0 };
      if (next.echo !== browserCapture.echo || next.noise !== browserCapture.noise) {
        browserCapture = next;
        const deviceId = micConstraints().deviceId;
        const capture = {
          ...captureConstraintFlags(noise, echo),
          ...(deviceId ? { deviceId } : {}),
        };
        try {
          const defaults = room?.options?.audioCaptureDefaults as Record<string, unknown> | undefined;
          if (defaults) {
            defaults.echoCancellation = next.echo;
            defaults.noiseSuppression = next.noise;
            defaults.autoGainControl = false;
          }
          await localAudio.restartTrack(capture);
        } catch (err) {
          console.warn('[LiveKit] Capture restart failed, applying constraints:', err);
          try {
            await localAudio.applyConstraints({
              echoCancellation: next.echo,
              noiseSuppression: next.noise,
              autoGainControl: false,
            });
          } catch (constraintErr) {
            console.warn('[LiveKit] Could not apply capture constraints:', constraintErr);
          }
        }
      }
      try {
        await ensureVoiceCleaner(localAudio, false);
      } catch (err) {
        console.warn('[LiveKit] Voice cleaner was not reattached:', err);
      }
    },

    setAudioInputDevice: async (deviceId: string) => {
      const id = !deviceId || deviceId === 'communications' ? 'default' : deviceId;
      const { room } = get();
      if (!room) return;
      await room.switchActiveDevice('audioinput', id);
      const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.source === Track.Source.Microphone
      );
      if (micPub?.track) {
        try { await ensureVoiceCleaner(micPub.track as LocalAudioTrack); } catch {}
        const media = (micPub.track as LocalAudioTrack).mediaStreamTrack;
        if (media) setupAudioAnalyser(media);
        await get().applyAudioProcessingSettings();
      }
    },

    setAudioOutputDevice: async (deviceId: string) => {
      const id = !deviceId || deviceId === 'communications' ? 'default' : deviceId;
      sounds.setOutputDevice(id);
      await remoteAudioGainEngine.setSinkId(id);
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audiooutput', id).catch(() => {});
      }
    },

    setParticipantVolume: (identity: string, volumePercent: number) => {
      useSettingsStore.getState().setParticipantVolume(identity, volumePercent);
      const { room, isDeafened } = get();
      if (!room) return;

      const isLocallyMuted = !!useSettingsStore.getState().localMutedUsers[identity];
      const targetVol = (isLocallyMuted || isDeafened) ? 0 : Math.max(0, Math.min(1, volumePercent / 100));
      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Microphone) {
            const trackKey = `${identity}_mic_${pub.trackSid || pub.track?.sid || pub.trackName || 'audio'}`;
            remoteAudioGainEngine.updateVolume(trackKey, volumePercent, isLocallyMuted || isDeafened);
            if (pub.track) {
              if (pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = !isLocallyMuted && !isDeafened;
              }
              try {
                (pub.track as any).setVolume?.(targetVol);
              } catch {}
            }
          }
        });
      }
    },

    setMasterOutputVolume: (volumePercent: number) => {
      useSettingsStore.getState().setOutputVolume(volumePercent);
      remoteAudioGainEngine.setMasterOutputVolume(volumePercent);
    },

    setParticipantSoundboardVolume: (identity: string, volumePercent: number) => {
      useSettingsStore.getState().setSoundboardVolume(identity, volumePercent);
      const isMuted = !!useSettingsStore.getState().localMutedSoundboards[identity];
      const { room, isDeafened } = get();
      const targetVol = (isMuted || isDeafened) ? 0 : Math.max(0, Math.min(1, volumePercent / 100));

      // Directly update WebAudio gain node for immediate real 0-200% volume change
      remoteAudioGainEngine.updateSoundboardVolume(identity, volumePercent, isMuted || isDeafened);

      if (!room) return;
      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          const trackName = (pub.trackName || (pub as any)?.name || (pub.track as any)?.name || '').toLowerCase();
          if (trackName === 'soundboard' || pub.source === Track.Source.Unknown) {
            const trackKey = `${identity}_soundboard_${pub.trackSid || pub.track?.sid || pub.trackName || 'audio'}`;
            remoteAudioGainEngine.updateVolume(trackKey, volumePercent, isMuted || isDeafened);
            if (pub.track) {
              if (pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = !isMuted && !isDeafened;
              }
              try {
                (pub.track as any).setVolume?.(targetVol);
              } catch {}
              if ((pub.track as any).attachedElements) {
                (pub.track as any).attachedElements.forEach((el: HTMLMediaElement) => {
                  try {
                    el.volume = targetVol;
                    el.muted = targetVol === 0;
                  } catch {}
                });
              }
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
      const targetVol = (isLocallyMuted || isDeafened) ? 0 : Math.max(0, Math.min(1, currentVol / 100));

      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          if (pub.source === Track.Source.Microphone) {
            const trackKey = `${identity}_mic_${pub.trackSid || pub.track?.sid || pub.trackName || 'audio'}`;
            remoteAudioGainEngine.updateVolume(trackKey, currentVol, isLocallyMuted || isDeafened);
            if (pub.track) {
              if (pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = !isLocallyMuted && !isDeafened;
              }
              try {
                (pub.track as any).setVolume?.(targetVol);
              } catch {}
              if ((pub.track as any).attachedElements) {
                (pub.track as any).attachedElements.forEach((el: HTMLMediaElement) => {
                  try {
                    el.volume = targetVol;
                    el.muted = targetVol === 0;
                  } catch {}
                });
              }
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
      const targetVol = (isMuted || isDeafened) ? 0 : Math.max(0, Math.min(1, currentVol / 100));

      // Directly mute/unmute WebAudio gain node
      remoteAudioGainEngine.updateSoundboardVolume(identity, currentVol, isMuted || isDeafened);

      if (!room) return;
      const remote = room.remoteParticipants.get(identity);
      if (remote) {
        remote.audioTrackPublications.forEach((pub) => {
          const trackName = (pub.trackName || (pub as any)?.name || (pub.track as any)?.name || '').toLowerCase();
          if (trackName === 'soundboard' || pub.source === Track.Source.Unknown) {
            const trackKey = `${identity}_soundboard_${pub.trackSid || pub.track?.sid || pub.trackName || 'audio'}`;
            remoteAudioGainEngine.updateVolume(trackKey, currentVol, isMuted || isDeafened);
            if (pub.track) {
              if (pub.track.mediaStreamTrack) {
                pub.track.mediaStreamTrack.enabled = !isMuted && !isDeafened;
              }
              try {
                (pub.track as any).setVolume?.(targetVol);
              } catch {}
              if ((pub.track as any).attachedElements) {
                (pub.track as any).attachedElements.forEach((el: HTMLMediaElement) => {
                  try {
                    el.volume = targetVol;
                    el.muted = targetVol === 0;
                  } catch {}
                });
              }
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

    broadcastChatDeleted: async (roomId: string, messageId: string) => {
      const { room } = get();
      if (!room || !room.localParticipant) return;

      try {
        const payload = JSON.stringify({
          type: 'chat_message_deleted',
          roomId,
          messageId,
        });
        const bytes = new TextEncoder().encode(payload);
        await room.localParticipant.publishData(bytes, { reliable: true });
      } catch (err) {
        console.warn('Failed to broadcast chat deletion:', err);
      }
    },

    ensureSoundboardTrackPublished: async () => {
      const { room } = get();
      if (!room || room.state !== ConnectionState.Connected) return;

      await soundboardAudioEngine.ensureAudioContext();

      const existingPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
        (p) => p.trackName === 'soundboard' || (p.track as any)?.name === 'soundboard'
      );

      if (existingPub && existingPub.track) {
        if (existingPub.track.mediaStreamTrack) {
          existingPub.track.mediaStreamTrack.enabled = true;
        }
        return;
      }

      try {
        const sbMediaTrack = soundboardAudioEngine.initializePipeline();
        const sbTrack = new LocalAudioTrack(sbMediaTrack);
        activeLocalSoundboardTrack = sbTrack;
        await room.localParticipant.publishTrack(sbTrack, {
          name: 'soundboard',
          source: Track.Source.Unknown,
          dtx: false,
          audioPreset: AudioPresets.music,
        });
        console.log('[LiveKit] Dedicated Soundboard audio track ensured and published');
      } catch (err) {
        console.warn('Failed to ensure soundboard track published:', err);
      }
    },

    startAudio: async () => {
      const { room } = get();
      sounds.unlock().catch(() => {});
      soundboardAudioEngine.ensureAudioContext().catch(() => {});
      if (room) {
        try {
          await room.startAudio();
          set({ canPlaybackAudio: room.canPlaybackAudio });
        } catch (e) {
          console.warn('[LiveKit] room.startAudio error:', e);
        }
      }
    },
  };
});

useAuthStore.subscribe((state, prev) => {
  const nextUrl = state.user?.avatarUrl ?? null;
  const prevUrl = prev.user?.avatarUrl ?? null;
  if (nextUrl === prevUrl) return;
  const userId = state.user?.id;
  if (userId) useServerStore.getState().patchMemberAvatar(userId, nextUrl);
  const serverId = useServerStore.getState().activeServerId;
  if (serverId) useServerStore.getState().fetchMembers(serverId).catch(() => {});
  useLiveKitStore.getState().announceAvatar();
});

// Dynamically handle inputMode changes (Voice Activity vs Push-to-Talk) while connected to a room
if (typeof window !== 'undefined') {
  (window as any).nightshift_diagnostics = {
    getStats: () => useLiveKitStore.getState().getAudioSenderStats(),
    testContinuous: (ms?: number) => useLiveKitStore.getState().testContinuousAudio(ms),
    testUiPtt: (ms?: number) => useLiveKitStore.getState().testUiPtt(ms),
  };

  useSettingsStore.subscribe((state, prevState) => {
    if (state.inputMode !== prevState.inputMode) {
      const livekit = useLiveKitStore.getState();
      const room = livekit.room;
      if (room && room.localParticipant) {
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone
        );
        if (state.inputMode === 'push-to-talk') {
          // Switch to PTT: mute mic track immediately until PTT key is held down
          micPub?.mute();
          useLiveKitStore.setState({ isMuted: true, isLocallySpeaking: false });
        } else {
          // Switch to Voice Activity: unmute if user is not deafened or manually self-muted
          if (!livekit.isDeafened && !state.isSelfMuted) {
            micPub?.unmute();
            useLiveKitStore.setState({ isMuted: false });
          }
        }
      }
    }
  });
}
