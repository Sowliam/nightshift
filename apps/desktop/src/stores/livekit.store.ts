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
import { api, getApiBase } from '../lib/api';

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
  ensureSoundboardTrackPublished: () => Promise<void>;

  // Stream watching actions
  startWatchingStream: (participantIdentity: string) => void;
  stopWatchingStream: (participantIdentity: string) => void;
  setFocusedScreenShare: (participantIdentity: string | null) => void;
  applyAudioProcessingSettings: () => Promise<void>;
  setAudioInputDevice: (deviceId: string) => Promise<void>;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
  setPushToTalkActive: (active: boolean, seq?: number) => Promise<void>;
  getAudioSenderStats: () => Promise<any>;
  testContinuousAudio: (durationMs?: number) => Promise<{ success: boolean; packetsSent: number; bytesSent: number; error?: string }>;
  testUiPtt: (durationMs?: number) => Promise<{ success: boolean; packetsSent: number; bytesSent: number; error?: string }>;
  setParticipantVolume: (identity: string, volumePercent: number) => void;
  toggleMuteForMyself: (identity: string) => void;
  broadcastChatMessage: (roomId: string, message: MessageDto) => Promise<void>;
  broadcastChatDeleted: (roomId: string, messageId: string) => Promise<void>;
  canPlaybackAudio: boolean;
  startAudio: () => Promise<void>;
}

export const useLiveKitStore = create<LiveKitState>((set, get) => {
  let activeCustomScreenTrack: LocalVideoTrack | null = null;
  let activeCustomScreenAudioTrack: LocalAudioTrack | null = null;
  let activeLocalSoundboardTrack: LocalAudioTrack | null = null;
  let activeLocalMicTrack: MediaStreamTrack | null = null;
  let activeAnalyserStream: MediaStream | null = null;
  let activeAnalyserTrack: MediaStreamTrack | null = null;
  let pttQueue: Promise<void> = Promise.resolve();
  let targetPttActive = false;
  let currentPttSeq = 0;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectCountdownInterval: ReturnType<typeof setInterval> | null = null;
  let lastPingBroadcastTime = 0;
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

      const resumeAudioContext = () => {
        if (localAudioContext && localAudioContext.state === 'suspended') {
          localAudioContext.resume().catch(() => {});
        }
      };
      resumeAudioContext();
      window.addEventListener('click', resumeAudioContext, { once: true });
      window.addEventListener('keydown', resumeAudioContext, { once: true });

      // Direct live microphone stream: never clone track on Windows/Chromium to avoid dead audio buffers
      const stream = new MediaStream([track]);
      activeAnalyserStream = stream;

      localAudioSource = localAudioContext.createMediaStreamSource(stream);

      // Human vocal-band pass (200 Hz - 3400 Hz) eliminates hum, rumble, and high-frequency hiss
      const highpass = localAudioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(200, localAudioContext.currentTime);
      highpass.Q.setValueAtTime(0.7, localAudioContext.currentTime);

      const lowpass = localAudioContext.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(3400, localAudioContext.currentTime);
      lowpass.Q.setValueAtTime(0.7, localAudioContext.currentTime);

      localAnalyser = localAudioContext.createAnalyser();
      localAnalyser.fftSize = 512;
      localAnalyser.smoothingTimeConstant = 0.2;

      localAudioSource.connect(highpass);
      highpass.connect(lowpass);
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

      // Unmuted microphones must be live so WebRTC audio flows cleanly without driver stutter
      if (!get().isMuted && !get().isDeafened) {
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

        // Calibrated Decibel Curve for voice speech:
        // Ambient room silence / laptop fan: < -45 dB -> 0%
        // Normal speaking voice: -26 dB to -12 dB -> 50% - 100%
        const normalized = Math.max(0, Math.min(100, Math.round(((db + 45) / 25) * 100)));

        const currentSettings = useSettingsStore.getState();
        const isPtt = currentSettings.inputMode === 'push-to-talk';
        const isMuted = get().isMuted;
        const isDeafened = get().isDeafened;
        const localId = get().localParticipant?.identity;

        // 1. Muted or Deafened: disable capture and clear local speaking indicator
        if (isMuted || isDeafened) {
          if (track.enabled) track.enabled = false;
          if (get().isLocallySpeaking) {
            set({ isLocallySpeaking: false });
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

        // 2. Push-to-Talk: gate transmission by PTT button state and light up speaking ring
        if (isPtt) {
          const transmit = targetPttActive;
          if (track.enabled !== transmit) track.enabled = transmit;
          if (get().isLocallySpeaking !== transmit) {
            set({ isLocallySpeaking: transmit });
            if (localId) {
              set((state) => {
                const updated = new Set(state.activeSpeakers);
                if (transmit) updated.add(localId);
                else updated.delete(localId);
                return { activeSpeakers: updated };
              });
            }
          }
          return;
        }

        // 3. Voice-Activity: only active when connected to a voice channel
        const { room, connectionState } = get();
        if (!room || connectionState !== ConnectionState.Connected) {
          if (get().isLocallySpeaking) {
            set({ isLocallySpeaking: false });
          }
          return;
        }

        if (!track.enabled) {
          track.enabled = true;
        }

        // Calibrated Voice Activity Threshold:
        // Room silence is < 30%. True vocal cords speaking effortlessly register >= 35%.
        const threshold = currentSettings.autoSensitivity
          ? 28
          : Math.max(15, (currentSettings.sensitivityThreshold ?? currentSettings.voiceActivationThreshold ?? 28));

        if (normalized >= threshold) {
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          if (!get().isLocallySpeaking) {
            set({ isLocallySpeaking: true });
            if (localId) {
              set((state) => ({
                activeSpeakers: new Set([...state.activeSpeakers, localId]),
              }));
            }
          }
        } else {
          // Below threshold: smooth 180ms hangover timer so natural speech pauses don't flicker
          if (!silenceTimer && get().isLocallySpeaking) {
            silenceTimer = setTimeout(() => {
              set({ isLocallySpeaking: false });
              if (localId) {
                set((state) => {
                  const updated = new Set(state.activeSpeakers);
                  updated.delete(localId);
                  return { activeSpeakers: updated };
                });
              }
              silenceTimer = null;
            }, 180);
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

  let lastMeasuredPing = 0;
  let isPingMeasuring = false;

  const measurePing = async (room: Room) => {
    if (isPingMeasuring) return;
    isPingMeasuring = true;
    try {
      let selectedPairRtt: number | null = null;
      let candidatePairRtt: number | null = null;
      let remoteRtpRtt: number | null = null;

      // 1. Check WebRTC stats across publisher and subscriber
      const pcManager = (room.engine as any)?.pcManager;
      const candidates = [
        pcManager?.publisher?.getStats ? pcManager.publisher : null,
        pcManager?.subscriber?.getStats ? pcManager.subscriber : null,
        (room.engine as any)?.publisher?.getStats ? (room.engine as any).publisher : null,
        (room.engine as any)?.subscriber?.getStats ? (room.engine as any).subscriber : null,
        (room.engine as any)?.pc?.getStats ? (room.engine as any).pc : null,
      ].filter(Boolean);

      for (const transport of candidates) {
        try {
          const stats: RTCStatsReport = await transport.getStats();
          if (!stats) continue;

          for (const report of stats.values()) {
            if (report.type === 'candidate-pair') {
              const pair = report as any;
              // Always use instantaneous roundTripTime, never stale cumulative averages
              const rttSec = pair.currentRoundTripTime;
              if (typeof rttSec === 'number' && rttSec > 0) {
                const rttMs = Math.round(rttSec * 1000);
                if (rttMs > 0 && rttMs < 2000) {
                  const isSelected = pair.state === 'succeeded' && (pair.nominated === true || pair.selected === true);
                  if (isSelected) {
                    if (selectedPairRtt === null || rttMs < selectedPairRtt) {
                      selectedPairRtt = rttMs;
                    }
                  } else if (pair.state === 'succeeded') {
                    if (candidatePairRtt === null || rttMs < candidatePairRtt) {
                      candidatePairRtt = rttMs;
                    }
                  }
                }
              }
            } else if (report.type === 'remote-inbound-rtp') {
              const rir = report as any;
              if (typeof rir.roundTripTime === 'number' && rir.roundTripTime > 0) {
                const rttMs = Math.round(rir.roundTripTime * 1000);
                if (rttMs > 0 && rttMs < 2000) {
                  if (remoteRtpRtt === null || rttMs < remoteRtpRtt) {
                    remoteRtpRtt = rttMs;
                  }
                }
              }
            }
          }
        } catch {}
      }

      // Best RTT priority: 1) Active Nominated Pair, 2) Remote Inbound RTP, 3) Any Succeeded Pair
      let bestRtt = selectedPairRtt ?? remoteRtpRtt ?? candidatePairRtt;

      // In Desktop Electron: measure real socket TCP RTT directly to LiveKit Frankfurt edge
      if (window.nightshift?.measurePing) {
        try {
          const roomUrl = (room as any)?.options?.url || (room.engine as any)?.url || 'voiceline-qy3slc6n.livekit.cloud';
          const tcpHost = String(roomUrl)
            .replace(/^(wss?|https?):\/\//, '')
            .split('/')[0]
            .split(':')[0]
            .trim();
          if (tcpHost) {
            const hwPing = await window.nightshift.measurePing(tcpHost, 443);
            if (hwPing > 0 && hwPing < 1500) {
              // Prioritize true hardware TCP latency over delayed/stuck candidate stats
              if (bestRtt === null || hwPing < bestRtt) {
                bestRtt = hwPing;
              }
            }
          }
        } catch {}
      }

      // In Web Browser / Fallback: probe active gateway ping if WebRTC stats are unpopulated or biased by TURN relay
      if (bestRtt === null || bestRtt > 260) {
        try {
          const t0 = performance.now();
          const res = await fetch(`${getApiBase()}/api/ping?_t=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
          });
          if (res.ok) {
            const netRtt = Math.round(performance.now() - t0);
            if (netRtt > 0 && netRtt < 3000) {
              const realisticVoiceRtt = Math.min(bestRtt ?? 9999, netRtt + 15);
              bestRtt = realisticVoiceRtt;
            }
          }
        } catch {}
      }

      if (bestRtt !== null) {
        // Fast convergence: when ping drops, immediately track real low latency
        let smoothed = bestRtt;
        if (lastMeasuredPing > 0) {
          if (bestRtt < lastMeasuredPing) {
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
    private ctx: AudioContext | null = null;
    private nodes = new Map<string, { gain: GainNode; source: MediaStreamAudioSourceNode }>();

    constructor() {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('click', unlockAudio, { passive: true });
        window.addEventListener('keydown', unlockAudio, { passive: true });
        window.addEventListener('touchstart', unlockAudio, { passive: true });
      }
    }

    private getAudioContext(): AudioContext {
      if (!this.ctx || this.ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        try {
          this.ctx = new AudioCtx({ sampleRate: 48000 });
        } catch {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    public routeTrack(trackKey: string, mediaStreamTrack: MediaStreamTrack, volumePercent: number, isMuted: boolean): void {
      try {
        this.unrouteTrack(trackKey);
        if (!mediaStreamTrack) return;
        const ctx = this.getAudioContext();
        const stream = new MediaStream([mediaStreamTrack]);
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        const gainVal = isMuted ? 0 : Math.max(0, volumePercent / 100);
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gainVal, now);
        source.connect(gain);
        gain.connect(ctx.destination);
        this.nodes.set(trackKey, { gain, source });
      } catch (err) {
        console.warn('Failed to route track through gain engine:', err);
      }
    }

    public updateSoundboardVolume(identity: string, volumePercent: number, isMuted: boolean): void {
      const ctx = this.getAudioContext();
      const gainVal = isMuted ? 0 : Math.max(0, volumePercent / 100);
      const prefix = `${identity}_soundboard`;
      const now = ctx.currentTime;
      let matched = false;

      this.nodes.forEach((node, key) => {
        if (key.startsWith(prefix) || key.includes(prefix)) {
          matched = true;
          try {
            node.gain.gain.cancelScheduledValues(now);
            node.gain.gain.setValueAtTime(gainVal, now);
          } catch (e) {
            console.warn('Failed to set soundboard gain:', e);
          }
        }
      });

      if (!matched) {
        // Fallback: match any node belonging to identity that is not mic
        this.nodes.forEach((node, key) => {
          if (key.startsWith(identity) && !key.includes('_mic_')) {
            try {
              node.gain.gain.cancelScheduledValues(now);
              node.gain.gain.setValueAtTime(gainVal, now);
            } catch {}
          }
        });
      }
    }

    public updateVolume(trackKey: string, volumePercent: number, isMuted: boolean): void {
      const ctx = this.getAudioContext();
      const entry = this.nodes.get(trackKey);
      const gainVal = isMuted ? 0 : Math.max(0, volumePercent / 100);
      const now = ctx.currentTime;
      if (entry) {
        try {
          entry.gain.gain.cancelScheduledValues(now);
          entry.gain.gain.setValueAtTime(gainVal, now);
        } catch {}
      } else {
        // Robust prefix fallback: match participant and track type (e.g. "identity_soundboard" or "identity_mic")
        const parts = trackKey.split('_');
        const prefix = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : trackKey;
        this.nodes.forEach((node, key) => {
          if (key === trackKey || key.startsWith(prefix) || trackKey.startsWith(prefix)) {
            try {
              node.gain.gain.cancelScheduledValues(now);
              node.gain.gain.setValueAtTime(gainVal, now);
            } catch {}
          }
        });
      }
    }

    public unrouteTrack(trackKey: string): void {
      const entry = this.nodes.get(trackKey);
      if (entry) {
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {}
        this.nodes.delete(trackKey);
      }
    }

    public clear(): void {
      this.nodes.forEach((entry) => {
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {}
      });
      this.nodes.clear();
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
        if ((pub.track as any)?.attachedElements) {
          (pub.track as any).attachedElements.forEach((el: HTMLMediaElement) => {
            try {
              const v = deafened || isLocallyMuted ? 0 : Math.max(0, Math.min(1, vol / 100));
              el.volume = v;
              el.muted = v === 0;
            } catch {}
          });
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
      await get().disconnect();

      set({ connectionState: ConnectionState.Connecting, error: null });

      const room = new Room({
        adaptiveStream: false, // Ensure full original stream resolution is never downscaled
        dynacast: false,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 48000,
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
        set({ connectionState: state });
        if (state === ConnectionState.Connected) {
          clearReconnectWatchdog();
        } else if (state === ConnectionState.Reconnecting) {
          startReconnectWatchdog();
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        set({ connectionState: ConnectionState.Reconnecting });
        startReconnectWatchdog();
      });

      room.on(RoomEvent.Reconnected, () => {
        clearReconnectWatchdog();
        set({ connectionState: ConnectionState.Connected, error: null });
        sounds.playJoin();
      });

      room.on(RoomEvent.Disconnected, () => {
        clearReconnectWatchdog();
        set({ connectionState: ConnectionState.Disconnected });
      });

      room.on(RoomEvent.Connected, () => {
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
        measurePing(room);
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => measurePing(room), 1000);

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

      room.on(RoomEvent.ParticipantConnected, (_participant) => {
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
          container.appendChild(element);

          const trackKey = `${participant.identity}_${isSoundboard ? 'soundboard' : 'mic'}_${track.sid || (track as any).name || pub?.trackName || 'audio'}`;
          const isMutedTotal = isLocallyMuted || get().isDeafened;
          const targetVol = isMutedTotal ? 0 : Math.min(1, Math.max(0, savedVol / 100));

          // Route ALL remote audio through RemoteAudioGainEngine for unified 0-200% volume control and clear playback
          if (track.mediaStreamTrack) {
            remoteAudioGainEngine.routeTrack(trackKey, track.mediaStreamTrack, savedVol, isMutedTotal);
            // Mute the raw HTML audio element to prevent double playback / phase echo
            element.muted = true;
            element.volume = 0;
          } else {
            element.volume = targetVol;
            element.muted = targetVol === 0;
            if (typeof (track as any).setVolume === 'function') {
              try {
                (track as any).setVolume(targetVol);
              } catch {}
            }
          }

          // Unblock audio playback in browser if needed
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

      room.on(RoomEvent.TrackPublished, (_pub, _participant) => {
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

      try {
        await room.connect(url, token, {
          rtcConfig: {
            iceCandidatePoolSize: 10,
          },
        });

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

        // Ensure microphone track is acquired and published to LiveKit
        const isPtt = settings.inputMode === 'push-to-talk';
        const isNoiseSuppressed = settings.noiseSuppression !== 'none';
        const isEchoCancelled = settings.echoCancellation;

        try {
          // Always publish the microphone track with hardware audio constraints
          await room.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: isEchoCancelled,
            noiseSuppression: isNoiseSuppressed,
            autoGainControl: true,
            deviceId:
              settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default'
                ? settings.audioInputDeviceId
                : undefined,
          });

          const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
            (p) => p.source === Track.Source.Microphone
          );
          if (micPub && micPub.track && (micPub.track as LocalAudioTrack).mediaStreamTrack) {
            setupAudioAnalyser((micPub.track as LocalAudioTrack).mediaStreamTrack!);
            await get().applyAudioProcessingSettings();

            if (isPtt) {
              // Push-to-Talk mode: mute the track initially until PTT key is pressed
              (micPub.track as LocalAudioTrack).mediaStreamTrack.enabled = false;
              await micPub.mute();
              set({ isMuted: true, isLocallySpeaking: false });
            } else {
              set({ isMuted: false });
            }
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
            audioPreset: AudioPresets.music,
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
        }, 2000);

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
      clearReconnectWatchdog();
      try {
        sessionStorage.removeItem('nightshift_active_voice_session');
      } catch {}

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
      remoteAudioGainEngine.clear();

      if (activeCustomScreenAudioTrack) {
        activeCustomScreenAudioTrack.stop();
        activeCustomScreenAudioTrack = null;
      }

      if (activeCustomScreenTrack) {
        activeCustomScreenTrack.stop();
        activeCustomScreenTrack = null;
      }

      const activeChannel = useServerStore.getState().activeVoiceChannelId;
      if (activeChannel) {
        api.leaveVoiceChannel(activeChannel).catch(() => {});
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
        participantPings: {},
        isReconnecting: false,
        reconnectSecondsLeft: 0,
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
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (p) => p.source === Track.Source.Microphone
        );

        if (newMuted) {
          if (micPub) await micPub.mute();
          if (activeLocalMicTrack) activeLocalMicTrack.enabled = false;
        } else {
          if (micPub) await micPub.unmute();
          if (activeLocalMicTrack) activeLocalMicTrack.enabled = true;
        }

        set({ isMuted: newMuted });
        useSettingsStore.getState().setSelfMuted(newMuted);
      } catch (err: any) {
        console.error('Failed to toggle microphone state:', err);
      }
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

      targetPttActive = active;

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

          const settings = useSettingsStore.getState();
          const micConstraints = {
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression !== 'none',
            autoGainControl: true,
            deviceId:
              settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default'
                ? settings.audioInputDeviceId
                : undefined,
          };

          // Fail-safe: if mic track was somehow not published yet, publish it now
          if (!micPub || !micPub.track) {
            await room.localParticipant.setMicrophoneEnabled(true, micConstraints);
            micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (p) => p.source === Track.Source.Microphone
            );
            if (micPub && micPub.track && (micPub.track as LocalAudioTrack).mediaStreamTrack) {
              setupAudioAnalyser((micPub.track as LocalAudioTrack).mediaStreamTrack!);
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
              await room.localParticipant.setMicrophoneEnabled(true, micConstraints);
              micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
                (p) => p.source === Track.Source.Microphone
              );
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

          if (!desiredMuted) {
            sounds.playPttActivate();
          } else {
            sounds.playPttDeactivate();
          }
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
      } else {
        // Undeafen: restore deafened state
        set({ isDeafened: false });
        useSettingsStore.getState().setDeafened(false);
        useSettingsStore.getState().setSelfDeafened(false);
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
          const isMobileDevice =
            typeof navigator !== 'undefined' &&
            (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
              (typeof window !== 'undefined' && window.innerWidth < 768));

          if (isMobileDevice) {
            // Mobile devices (Android/iOS): getDisplayMedia does not support system audio or fixed 16:9 dimensions
            try {
              await room.localParticipant.setScreenShareEnabled(true, {
                audio: false,
                contentHint: opts.preset === 'detail' ? 'detail' : 'motion',
              });
            } catch (mobErr) {
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

            try {
              await room.localParticipant.setScreenShareEnabled(true, screenShareConfig);
            } catch (browserErr) {
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
        console.error('Failed to start screen share:', err);
        set({ error: err.message || 'Screen sharing cancelled or failed' });
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
