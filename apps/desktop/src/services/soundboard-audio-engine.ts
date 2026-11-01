import { SoundboardItem, soundboardStorage } from './soundboard.storage';
import { api } from '../lib/api';

export interface ActiveSoundInfo {
  soundId: string;
  name: string;
  startedAt: number;
  duration: number;
  isPaused: boolean;
  isLocalOnly: boolean;
}

interface ActiveSoundInstance {
  soundId: string;
  name: string;
  item: SoundboardItem;
  audioBuffer: AudioBuffer;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode;
  startedAt: number;
  duration: number;
  pauseOffset: number;
  isPaused: boolean;
  isLocalOnly: boolean;
}

export class SoundboardAudioEngine {
  private audioContext: AudioContext | null = null;
  private soundboardBusGain: GainNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private soundboardTrack: MediaStreamTrack | null = null;

  private isMicMuted: boolean = false;
  private allowWhileMuted: boolean = true;
  private masterVolume: number = 1.0;
  private localMonitorVolume: number = 1.0;
  private localMonitorMuted: boolean = false;
  private maxConcurrentSounds: number = 4;

  private activeInstances: Map<string, ActiveSoundInstance> = new Map();
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private currentMusicSessionId: string | null = null;
  private loadAbortControllers: Map<string, AbortController> = new Map();
  private listeners: Set<() => void> = new Set();
  private onActiveChangeHandler: ((active: ActiveSoundInfo[]) => void) | null = null;
  private onTrackEndedHandler: ((soundId: string) => void) | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      try {
        this.audioContext = new AudioCtx({ sampleRate: 48000 });
      } catch {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  public async ensureAudioContext(): Promise<AudioContext> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err) {
        console.warn('AudioContext resume failed:', err);
      }
    }
    return ctx;
  }

  /**
   * Initializes or returns the dedicated outgoing Soundboard audio track for LiveKit.
   * This pipeline contains ONLY soundboard audio (no microphone audio mixed in),
   * ensuring participants receive two separate, independently controllable tracks.
   */
  public initializePipeline(): MediaStreamTrack {
    const ctx = this.getAudioContext();

    // Soundboard Master Transmission Gain (Outgoing to WebRTC)
    if (!this.soundboardBusGain) {
      this.soundboardBusGain = ctx.createGain();
      this.soundboardBusGain.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
    }

    // Local Monitor Gain (so user hears sound in their own headphones)
    if (!this.localMonitorGain) {
      this.localMonitorGain = ctx.createGain();
      const currentMonitorVol = this.localMonitorMuted ? 0 : this.localMonitorVolume;
      this.localMonitorGain.gain.setValueAtTime(currentMonitorVol, ctx.currentTime);
      this.soundboardBusGain.connect(this.localMonitorGain);
      this.localMonitorGain.connect(ctx.destination);
    }

    // True 0 dBFS Peak Limiter (prevents digital clipping without squashing dynamics)
    if (!this.compressorNode) {
      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-0.5, ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(0, ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(20, ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.001, ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.05, ctx.currentTime);
      this.soundboardBusGain.connect(this.compressorNode);
    }

    // Dedicated MediaStreamDestination generating the outgoing WebRTC track
    if (!this.destinationNode) {
      this.destinationNode = ctx.createMediaStreamDestination();
      this.compressorNode.connect(this.destinationNode);
      this.soundboardTrack = this.destinationNode.stream.getAudioTracks()[0];
    }

    this.updateSoundboardTransmissionState();
    return this.soundboardTrack!;
  }

  /**
   * Sets microphone mute state. When muted, checks if soundboard transmission is allowed.
   */
  public setMicrophoneMuted(muted: boolean): void {
    this.isMicMuted = muted;
    this.updateSoundboardTransmissionState();
  }

  public setAllowWhileMuted(allow: boolean): void {
    this.allowWhileMuted = allow;
    this.updateSoundboardTransmissionState();
  }

  private updateSoundboardTransmissionState(): void {
    if (!this.soundboardBusGain || !this.audioContext) return;
    const shouldTransmit = !this.isMicMuted || this.allowWhileMuted;
    const targetVolume = shouldTransmit ? this.masterVolume : 0;
    try {
      const now = this.audioContext.currentTime;
      this.soundboardBusGain.gain.cancelScheduledValues(now);
      this.soundboardBusGain.gain.setValueAtTime(targetVolume, now);
    } catch {}
  }

  public setMasterVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(200, volumePercent));
    this.masterVolume = clamped / 100;
    if (this.soundboardBusGain && this.audioContext) {
      const shouldTransmit = !this.isMicMuted || this.allowWhileMuted;
      try {
        const now = this.audioContext.currentTime;
        this.soundboardBusGain.gain.cancelScheduledValues(now);
        this.soundboardBusGain.gain.setValueAtTime(
          shouldTransmit ? this.masterVolume : 0,
          now
        );
      } catch {}
    }
  }

  /**
   * Adjusts the volume at which the user hears their own played soundboard sounds in their headphones.
   */
  public setLocalMonitorVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(200, volumePercent));
    this.localMonitorVolume = clamped / 100;
    this.updateLocalMonitorGain();
  }

  /**
   * Allows the user who played the sound to completely silence it in their own headphones,
   * while the sound continues transmitting at full quality to everyone else in the voice room!
   */
  public setLocalMonitorMuted(muted: boolean): void {
    this.localMonitorMuted = muted;
    this.updateLocalMonitorGain();
  }

  public isLocalMonitorMuted(): boolean {
    return this.localMonitorMuted;
  }

  private updateLocalMonitorGain(): void {
    if (this.localMonitorGain && this.audioContext) {
      const target = this.localMonitorMuted ? 0 : this.localMonitorVolume;
      try {
        const now = this.audioContext.currentTime;
        this.localMonitorGain.gain.cancelScheduledValues(now);
        this.localMonitorGain.gain.setValueAtTime(target, now);
      } catch {}
    }
  }

  /**
   * Decodes and caches an ArrayBuffer into an AudioBuffer
   */
  public async loadAudioBuffer(soundId: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const cached = this.audioBufferCache.get(soundId);
    if (cached) return cached;

    const ctx = await this.ensureAudioContext();
    const cloned = arrayBuffer.slice(0);
    const audioBuffer = await ctx.decodeAudioData(cloned);
    this.audioBufferCache.set(soundId, audioBuffer);
    return audioBuffer;
  }

  /**
   * Plays a sound effect or music track.
   * If isMusic is true (default):
   *   - Immediately stops any current sounds and cancels in-flight requests.
   *   - Strictly prevents overlapping or ghost playback through session tokens.
   * If localOnly is true:
   *   - Routes ONLY to user's local speakers/headphones (private audition).
   *   - NEVER touches the outgoing WebRTC track or LiveKit broadcast.
   */
  public async playSound(item: SoundboardItem, localOnly = false, isMusic = true): Promise<void> {
    const ctx = await this.ensureAudioContext();

    if (isMusic) {
      // 1. Immediately stop any currently playing sounds BEFORE setting the new session token
      const currentActiveIds = Array.from(this.activeInstances.keys());
      for (const activeId of currentActiveIds) {
        this.stopSound(activeId);
      }
      // 2. Abort all previous in-flight network fetches
      this.loadAbortControllers.forEach((c) => {
        try { c.abort(); } catch {}
      });
      this.loadAbortControllers.clear();
    } else {
      if (this.activeInstances.has(item.id)) {
        this.stopSound(item.id);
      }
      if (this.activeInstances.size >= this.maxConcurrentSounds) {
        const oldestId = this.activeInstances.keys().next().value;
        if (oldestId) this.stopSound(oldestId);
      }
    }

    const playbackSessionId = `${item.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (isMusic) {
      this.currentMusicSessionId = playbackSessionId;
    }

    // Retrieve audio data with abortable network fetch
    let audioBuffer = this.audioBufferCache.get(item.id);
    if (!audioBuffer) {
      let rawData = await soundboardStorage.getAudioData(item.id);

      // Check if session was superseded while reading from storage
      if (isMusic && this.currentMusicSessionId !== playbackSessionId) {
        return;
      }

      if (!rawData && item.audioUrl) {
        const abortCtrl = new AbortController();
        this.loadAbortControllers.set(playbackSessionId, abortCtrl);

        try {
          let fullUrl = item.audioUrl;
          if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
            const base = api.getBaseUrl().replace(/\/$/, '');
            const path = item.audioUrl.startsWith('/') ? item.audioUrl : `/${item.audioUrl}`;
            fullUrl = `${base}${path}`;
          }
          const res = await fetch(fullUrl, { signal: abortCtrl.signal });
          if (res.ok) {
            rawData = await res.arrayBuffer();
            // Cache downloaded cloud song to local storage so playback is instant for future plays
            try {
              const localCacheItem: SoundboardItem = {
                ...item,
                audioUrl: fullUrl,
                source: 'cloud',
              };
              await soundboardStorage.saveSound(localCacheItem, rawData.slice(0));
            } catch (cacheErr) {
              console.warn('Could not cache cloud sound locally:', cacheErr);
            }
          } else {
            console.warn(`Failed to fetch cloud sound (${res.status}) from ${fullUrl}`);
          }
        } catch (fetchErr: any) {
          if (fetchErr.name === 'AbortError') {
            return;
          }
          console.warn(`Failed to fetch audio from URL: ${item.audioUrl}`, fetchErr);
        } finally {
          this.loadAbortControllers.delete(playbackSessionId);
        }
      }

      // Check if session was superseded during fetch
      if (isMusic && this.currentMusicSessionId !== playbackSessionId) {
        return;
      }

      if (!rawData) {
        throw new Error(`Audio data not found for sound "${item.name}"`);
      }

      audioBuffer = await this.loadAudioBuffer(item.id, rawData);

      // Check if session was superseded during decoding
      if (isMusic && this.currentMusicSessionId !== playbackSessionId) {
        return;
      }
    }

    // Mutual exclusivity check right before creating audio nodes
    if (isMusic && this.currentMusicSessionId !== playbackSessionId) {
      return;
    }

    if (isMusic) {
      const lingeringIds = Array.from(this.activeInstances.keys());
      for (const id of lingeringIds) {
        this.stopSound(id);
      }
    }

    // Create buffer source node and per-sound gain node
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const itemGainNode = ctx.createGain();
    const itemVol = item.volume !== undefined && item.volume !== null ? Math.max(0, item.volume / 100) : 1.0;
    itemGainNode.gain.setValueAtTime(itemVol, ctx.currentTime);

    sourceNode.connect(itemGainNode);

    if (localOnly) {
      // 100% PRIVATE LOCAL PREVIEW
      itemGainNode.connect(ctx.destination);
    } else {
      // BROADCAST TO CHANNEL
      if (!this.soundboardBusGain) {
        this.initializePipeline();
      }
      itemGainNode.connect(this.soundboardBusGain!);
    }

    // Final sanity check before playback starts
    if (isMusic && this.currentMusicSessionId !== playbackSessionId) {
      try {
        sourceNode.disconnect();
        itemGainNode.disconnect();
      } catch {}
      return;
    }

    const instance: ActiveSoundInstance = {
      soundId: item.id,
      name: item.name,
      item,
      audioBuffer,
      sourceNode,
      gainNode: itemGainNode,
      startedAt: Date.now(),
      duration: audioBuffer.duration,
      pauseOffset: 0,
      isPaused: false,
      isLocalOnly: localOnly,
    };

    this.activeInstances.set(item.id, instance);
    this.notifyListeners();

    sourceNode.onended = () => {
      // Only clean up if this was a natural end and not a pause
      const current = this.activeInstances.get(item.id);
      if (current && !current.isPaused) {
        this.activeInstances.delete(item.id);
        try {
          sourceNode.disconnect();
          itemGainNode.disconnect();
        } catch {}
        this.notifyListeners();
        if (this.onTrackEndedHandler) {
          try {
            this.onTrackEndedHandler(item.id);
          } catch (e) {
            console.warn('onTrackEnded error:', e);
          }
        }
      }
    };

    sourceNode.start(0);
  }

  /**
   * Pauses an active sound without resetting its playback position.
   */
  public pauseSound(soundId: string): void {
    const inst = this.activeInstances.get(soundId);
    if (!inst || inst.isPaused || !inst.sourceNode) return;

    const ctx = this.audioContext;
    const now = ctx ? ctx.currentTime : 0;
    
    // Calculate elapsed playback seconds
    const elapsedSeconds = (Date.now() - inst.startedAt) / 1000;
    inst.pauseOffset = Math.max(0, Math.min(inst.duration, elapsedSeconds));
    inst.isPaused = true;

    try {
      inst.gainNode.gain.cancelScheduledValues(now);
      inst.gainNode.gain.setValueAtTime(0, now);
    } catch {}

    inst.sourceNode.onended = null;
    try {
      inst.sourceNode.stop(now);
    } catch {}
    try {
      inst.sourceNode.disconnect();
    } catch {}
    inst.sourceNode = null;

    this.notifyListeners();
  }

  /**
   * Resumes a paused sound from its exact pause point.
   */
  public async resumeSound(soundId: string): Promise<void> {
    const inst = this.activeInstances.get(soundId);
    if (!inst || !inst.isPaused) return;

    const ctx = await this.ensureAudioContext();
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = inst.audioBuffer;
    sourceNode.connect(inst.gainNode);

    const now = ctx.currentTime;
    const itemVol = inst.item.volume !== undefined && inst.item.volume !== null ? Math.max(0, inst.item.volume / 100) : 1.0;
    try {
      inst.gainNode.gain.cancelScheduledValues(now);
      inst.gainNode.gain.setValueAtTime(itemVol, now);
    } catch {}

    inst.startedAt = Date.now() - (inst.pauseOffset * 1000);
    inst.isPaused = false;
    inst.sourceNode = sourceNode;

    sourceNode.onended = () => {
      const current = this.activeInstances.get(soundId);
      if (current && !current.isPaused) {
        this.activeInstances.delete(soundId);
        try {
          sourceNode.disconnect();
          inst.gainNode.disconnect();
        } catch {}
        this.notifyListeners();
        if (this.onTrackEndedHandler) {
          try {
            this.onTrackEndedHandler(soundId);
          } catch (e) {
            console.warn('onTrackEnded error:', e);
          }
        }
      }
    };

    sourceNode.start(now, inst.pauseOffset);
    this.notifyListeners();
  }

  /**
   * Seeks to a specific offset in seconds for an active sound.
   */
  public async seekSound(soundId: string, offsetSeconds: number): Promise<void> {
    const inst = this.activeInstances.get(soundId);
    if (!inst) return;

    const ctx = await this.ensureAudioContext();
    const clampedOffset = Math.max(0, Math.min(inst.duration, offsetSeconds));

    if (inst.sourceNode) {
      inst.sourceNode.onended = null;
      try {
        inst.sourceNode.stop(ctx.currentTime);
      } catch {}
      try {
        inst.sourceNode.disconnect();
      } catch {}
      inst.sourceNode = null;
    }

    inst.pauseOffset = clampedOffset;

    if (!inst.isPaused) {
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = inst.audioBuffer;
      sourceNode.connect(inst.gainNode);

      inst.startedAt = Date.now() - (clampedOffset * 1000);
      inst.sourceNode = sourceNode;

      sourceNode.onended = () => {
        const current = this.activeInstances.get(soundId);
        if (current && !current.isPaused) {
          this.activeInstances.delete(soundId);
          try {
            sourceNode.disconnect();
            inst.gainNode.disconnect();
          } catch {}
          this.notifyListeners();
          if (this.onTrackEndedHandler) {
            try {
              this.onTrackEndedHandler(soundId);
            } catch (e) {
              console.warn('onTrackEnded error:', e);
            }
          }
        }
      };

      sourceNode.start(ctx.currentTime, clampedOffset);
    }

    this.notifyListeners();
  }

  /**
   * Returns current playback position in seconds, total duration, and progress fraction.
   */
  public getPlaybackProgress(soundId: string): { currentTime: number; duration: number; progress: number } | null {
    const inst = this.activeInstances.get(soundId);
    if (!inst) return null;

    let currentTime = 0;
    if (inst.isPaused) {
      currentTime = inst.pauseOffset;
    } else {
      currentTime = Math.max(0, Math.min(inst.duration, (Date.now() - inst.startedAt) / 1000));
    }

    return {
      currentTime,
      duration: inst.duration,
      progress: inst.duration > 0 ? currentTime / inst.duration : 0,
    };
  }

  public setOnTrackEnded(callback: ((soundId: string) => void) | null): void {
    this.onTrackEndedHandler = callback;
  }

  /**
   * Toggles pause / resume for a playing sound.
   */
  public async togglePauseSound(soundId: string): Promise<void> {
    const inst = this.activeInstances.get(soundId);
    if (!inst) return;
    if (inst.isPaused) {
      await this.resumeSound(soundId);
    } else {
      this.pauseSound(soundId);
    }
  }

  /**
   * Stops an individual sound immediately and reliably.
   * Cancels scheduled audio values and immediately stops the buffer node.
   */
  public stopSound(soundId: string): void {
    if (this.currentMusicSessionId?.startsWith(soundId)) {
      this.currentMusicSessionId = null;
    }
    this.loadAbortControllers.forEach((ctrl, key) => {
      if (key.startsWith(soundId)) {
        try { ctrl.abort(); } catch {}
        this.loadAbortControllers.delete(key);
      }
    });

    const inst = this.activeInstances.get(soundId);
    if (!inst) return;

    this.activeInstances.delete(soundId);

    if (inst.sourceNode) {
      inst.sourceNode.onended = null;
      const ctx = this.audioContext;
      const now = ctx ? ctx.currentTime : 0;

      try {
        inst.gainNode.gain.cancelScheduledValues(now);
        inst.gainNode.gain.setValueAtTime(0, now);
      } catch {}

      try {
        inst.sourceNode.stop(now);
      } catch {}

      try {
        inst.sourceNode.disconnect();
      } catch {}
    }

    try {
      inst.gainNode.disconnect();
    } catch {}

    this.notifyListeners();
  }

  /**
   * Emergency stop for all active sounds and cancellation of all pending loads.
   */
  public stopAllSounds(): void {
    this.currentMusicSessionId = null;
    this.loadAbortControllers.forEach((ctrl) => {
      try { ctrl.abort(); } catch {}
    });
    this.loadAbortControllers.clear();

    const ids = Array.from(this.activeInstances.keys());
    for (const id of ids) {
      this.stopSound(id);
    }
  }

  public isPlaying(soundId: string): boolean {
    const inst = this.activeInstances.get(soundId);
    return !!inst && !inst.isPaused;
  }

  public isPaused(soundId: string): boolean {
    const inst = this.activeInstances.get(soundId);
    return !!inst && inst.isPaused;
  }

  public isLocalOnly(soundId: string): boolean {
    const inst = this.activeInstances.get(soundId);
    return !!inst && inst.isLocalOnly;
  }

  public getActivePlayingIds(): string[] {
    return Array.from(this.activeInstances.keys());
  }

  public getActiveSounds(): ActiveSoundInfo[] {
    return Array.from(this.activeInstances.values()).map((inst) => ({
      soundId: inst.soundId,
      name: inst.name,
      startedAt: inst.startedAt,
      duration: inst.duration,
      isPaused: inst.isPaused,
      isLocalOnly: inst.isLocalOnly,
    }));
  }

  public getSoundboardTrack(): MediaStreamTrack | null {
    if (!this.soundboardTrack) {
      this.initializePipeline();
    }
    return this.soundboardTrack;
  }

  public cleanup(): void {
    this.stopAllSounds();
  }

  public setOnActiveChange(handler: ((active: ActiveSoundInfo[]) => void) | null): void {
    this.onActiveChangeHandler = handler;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch {}
    }
    if (this.onActiveChangeHandler) {
      try {
        this.onActiveChangeHandler(this.getActiveSounds());
      } catch {}
    }
  }
}

export const soundboardAudioEngine = new SoundboardAudioEngine();
