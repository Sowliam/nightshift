import { SoundboardItem, soundboardStorage } from './soundboard.storage';

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
  private allowWhileMuted: boolean = false;
  private masterVolume: number = 0.8;
  private localMonitorVolume: number = 0.8;
  private localMonitorMuted: boolean = false;
  private maxConcurrentSounds: number = 4;

  private activeInstances: Map<string, ActiveSoundInstance> = new Map();
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private listeners: Set<() => void> = new Set();
  private onActiveChangeHandler: ((active: ActiveSoundInfo[]) => void) | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 48000 });
    }
    return this.audioContext;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
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

    // Dynamics Compressor / Limiter to prevent clipping
    if (!this.compressorNode) {
      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-6, ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(10, ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(12, ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, ctx.currentTime);
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
      this.soundboardBusGain.gain.setValueAtTime(targetVolume, this.audioContext.currentTime);
    } catch {}
  }

  public setMasterVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(100, volumePercent));
    this.masterVolume = clamped / 100;
    if (this.soundboardBusGain && this.audioContext) {
      const shouldTransmit = !this.isMicMuted || this.allowWhileMuted;
      try {
        this.soundboardBusGain.gain.setValueAtTime(
          shouldTransmit ? this.masterVolume : 0,
          this.audioContext.currentTime
        );
      } catch {}
    }
  }

  /**
   * Adjusts the volume at which the user hears their own played soundboard sounds in their headphones.
   */
  public setLocalMonitorVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(100, volumePercent));
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
        this.localMonitorGain.gain.setValueAtTime(target, this.audioContext.currentTime);
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
   * Plays a sound effect.
   * If localOnly is true:
   *   - Routes ONLY to user's local speakers/headphones (private audition).
   *   - NEVER touches the outgoing WebRTC track or LiveKit broadcast.
   *   - Works reliably even when not connected to a voice room.
   * If localOnly is false:
   *   - Transmits to the voice room via dedicated soundboardTrack.
   *   - Also routes to local monitor (headphones) according to localMonitorVolume / localMonitorMuted.
   */
  public async playSound(item: SoundboardItem, localOnly = false): Promise<void> {
    const ctx = await this.ensureAudioContext();

    // If this sound is already playing or paused, stop it first
    if (this.activeInstances.has(item.id)) {
      this.stopSound(item.id);
    }

    // Enforce max concurrent sounds limit (stop oldest sound)
    if (this.activeInstances.size >= this.maxConcurrentSounds) {
      let oldestId: string | null = null;
      let oldestTime = Infinity;
      this.activeInstances.forEach((inst, id) => {
        if (inst.startedAt < oldestTime) {
          oldestTime = inst.startedAt;
          oldestId = id;
        }
      });
      if (oldestId) {
        this.stopSound(oldestId);
      }
    }

    // Retrieve audio data
    let audioBuffer = this.audioBufferCache.get(item.id);
    if (!audioBuffer) {
      const rawData = await soundboardStorage.getAudioData(item.id);
      if (!rawData) {
        throw new Error(`Audio data not found for sound "${item.name}"`);
      }
      audioBuffer = await this.loadAudioBuffer(item.id, rawData);
    }

    // Create buffer source node and per-sound gain node
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const itemGainNode = ctx.createGain();
    const itemVol = (item.volume ?? 80) / 100;
    itemGainNode.gain.setValueAtTime(itemVol, ctx.currentTime);

    sourceNode.connect(itemGainNode);

    if (localOnly) {
      // 100% PRIVATE LOCAL PREVIEW:
      // Direct connection to ctx.destination only (user's audio output)
      // Completely isolated from the LiveKit transmission pipeline
      itemGainNode.connect(ctx.destination);
    } else {
      // BROADCAST TO CHANNEL:
      // Connect to soundboardBusGain (which splits to WebRTC outgoing stream and local monitor)
      if (!this.soundboardBusGain) {
        this.initializePipeline();
      }
      itemGainNode.connect(this.soundboardBusGain!);
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
      }
    };

    sourceNode.start(now, inst.pauseOffset);
    this.notifyListeners();
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
   * Emergency stop for all active sounds
   */
  public stopAllSounds(): void {
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
