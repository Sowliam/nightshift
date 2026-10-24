import { SoundboardItem, soundboardStorage } from './soundboard.storage';

interface ActiveSoundInstance {
  soundId: string;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  startedAt: number;
}

export class SoundboardAudioEngine {
  private audioContext: AudioContext | null = null;
  private rawMicStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micGainNode: GainNode | null = null;
  private soundboardBusGain: GainNode | null = null;
  private localMonitorGain: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private mixedStreamTrack: MediaStreamTrack | null = null;

  private isMicMuted: boolean = false;
  private allowWhileMuted: boolean = false;
  private masterVolume: number = 0.8;
  private localMonitorVolume: number = 0.8;
  private maxConcurrentSounds: number = 4;

  private activeInstances: Map<string, ActiveSoundInstance> = new Map();
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private listeners: Set<() => void> = new Set();

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 48000 });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  /**
   * Initializes or refreshes the audio mixing pipeline with a raw microphone stream.
   * Returns the single mixed MediaStreamTrack intended for LiveKit transmission.
   */
  public initializePipeline(rawMicStream?: MediaStream | null): MediaStreamTrack {
    const ctx = this.getAudioContext();

    // Create or reuse bus gain nodes
    if (!this.soundboardBusGain) {
      this.soundboardBusGain = ctx.createGain();
      this.soundboardBusGain.gain.setValueAtTime(this.masterVolume, ctx.currentTime);
    }

    if (!this.localMonitorGain) {
      this.localMonitorGain = ctx.createGain();
      this.localMonitorGain.gain.setValueAtTime(this.localMonitorVolume, ctx.currentTime);
      // Route soundboard to local headphones/speakers
      this.soundboardBusGain.connect(this.localMonitorGain);
      this.localMonitorGain.connect(ctx.destination);
    }

    // Limiter / Dynamics compressor
    if (!this.compressorNode) {
      this.compressorNode = ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-6, ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(10, ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(12, ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, ctx.currentTime);
      this.soundboardBusGain.connect(this.compressorNode);
    }

    // Destination node that generates the outgoing WebRTC stream
    if (!this.destinationNode) {
      this.destinationNode = ctx.createMediaStreamDestination();
      this.compressorNode.connect(this.destinationNode);
      this.mixedStreamTrack = this.destinationNode.stream.getAudioTracks()[0];
    }

    // Update microphone source if stream provided
    if (rawMicStream) {
      this.setMicrophoneStream(rawMicStream);
    }

    return this.mixedStreamTrack!;
  }

  /**
   * Connects or swaps the raw microphone stream without interrupting the Soundboard
   */
  public setMicrophoneStream(stream: MediaStream | null): void {
    const ctx = this.getAudioContext();
    this.rawMicStream = stream;

    // Disconnect previous mic nodes
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }

    if (stream && stream.getAudioTracks().length > 0) {
      try {
        this.micSourceNode = ctx.createMediaStreamSource(stream);
        if (!this.micGainNode) {
          this.micGainNode = ctx.createGain();
        }
        const effectiveGain = this.isMicMuted ? 0 : 1;
        this.micGainNode.gain.setValueAtTime(effectiveGain, ctx.currentTime);

        this.micSourceNode.connect(this.micGainNode);
        if (this.compressorNode) {
          this.micGainNode.connect(this.compressorNode);
        }
      } catch (err) {
        console.warn('Could not connect microphone to soundboard audio context:', err);
      }
    }
  }

  /**
   * Sets microphone mute state. When muted, mic gain drops to 0 immediately.
   */
  public setMicrophoneMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (this.micGainNode && this.audioContext) {
      const target = muted ? 0 : 1;
      this.micGainNode.gain.setValueAtTime(target, this.audioContext.currentTime);
    }
    this.updateSoundboardTransmissionState();
  }

  public setAllowWhileMuted(allow: boolean): void {
    this.allowWhileMuted = allow;
    this.updateSoundboardTransmissionState();
  }

  private updateSoundboardTransmissionState(): void {
    if (!this.soundboardBusGain || !this.audioContext) return;
    // If mic is muted and user hasn't explicitly allowed soundboard while muted:
    // Silence outgoing soundboard transmission, but keep local monitor active.
    const shouldTransmit = !this.isMicMuted || this.allowWhileMuted;
    const targetVolume = shouldTransmit ? this.masterVolume : 0;
    this.soundboardBusGain.gain.setValueAtTime(targetVolume, this.audioContext.currentTime);
  }

  public setMasterVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(100, volumePercent));
    this.masterVolume = clamped / 100;
    if (this.soundboardBusGain && this.audioContext) {
      const shouldTransmit = !this.isMicMuted || this.allowWhileMuted;
      this.soundboardBusGain.gain.setValueAtTime(
        shouldTransmit ? this.masterVolume : 0,
        this.audioContext.currentTime
      );
    }
  }

  public setLocalMonitorVolume(volumePercent: number): void {
    const clamped = Math.max(0, Math.min(100, volumePercent));
    this.localMonitorVolume = clamped / 100;
    if (this.localMonitorGain && this.audioContext) {
      this.localMonitorGain.gain.setValueAtTime(this.localMonitorVolume, this.audioContext.currentTime);
    }
  }

  /**
   * Decodes and caches an ArrayBuffer into an AudioBuffer
   */
  public async loadAudioBuffer(soundId: string, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const cached = this.audioBufferCache.get(soundId);
    if (cached) return cached;

    const ctx = this.getAudioContext();
    // decodeAudioData consumes the arrayBuffer, so we clone it
    const cloned = arrayBuffer.slice(0);
    const audioBuffer = await ctx.decodeAudioData(cloned);
    this.audioBufferCache.set(soundId, audioBuffer);
    return audioBuffer;
  }

  /**
   * Plays a sound effect.
   * If localOnly is true, routes ONLY to user's headphones/speakers (private preview).
   * Otherwise mixes into both outgoing LiveKit stream and local headphones.
   */
  public async playSound(item: SoundboardItem, localOnly = false): Promise<void> {
    const ctx = this.getAudioContext();

    // Stop existing instance of this specific sound if playing
    if (this.activeInstances.has(item.id)) {
      this.stopSound(item.id);
    }

    // Enforce concurrency limit: stop oldest instance if max reached
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
        throw new Error(`Audio data not found for sound ${item.name}`);
      }
      audioBuffer = await this.loadAudioBuffer(item.id, rawData);
    }

    // Create per-sound source and gain nodes
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    const itemGainNode = ctx.createGain();
    const itemVol = (item.volume ?? 80) / 100;
    itemGainNode.gain.setValueAtTime(itemVol, ctx.currentTime);

    sourceNode.connect(itemGainNode);

    if (localOnly) {
      // Local preview only: connect to localMonitorGain -> ctx.destination
      if (this.localMonitorGain) {
        itemGainNode.connect(this.localMonitorGain);
      } else {
        itemGainNode.connect(ctx.destination);
      }
    } else {
      // Transmit to voice room + local monitor
      if (!this.soundboardBusGain) {
        this.initializePipeline();
      }
      itemGainNode.connect(this.soundboardBusGain!);
    }

    const instance: ActiveSoundInstance = {
      soundId: item.id,
      sourceNode,
      gainNode: itemGainNode,
      startedAt: Date.now(),
    };

    this.activeInstances.set(item.id, instance);
    this.notifyListeners();

    sourceNode.onended = () => {
      this.activeInstances.delete(item.id);
      try {
        sourceNode.disconnect();
        itemGainNode.disconnect();
      } catch {}
      this.notifyListeners();
    };

    sourceNode.start(0);
  }

  /**
   * Stops an individual sound with a smooth fade-out to prevent audio pops
   */
  public stopSound(soundId: string): void {
    const inst = this.activeInstances.get(soundId);
    if (!inst) return;

    this.activeInstances.delete(soundId);
    this.notifyListeners();

    try {
      const ctx = this.getAudioContext();
      // Smooth 30ms linear ramp to 0 before stopping
      inst.gainNode.gain.setValueAtTime(inst.gainNode.gain.value, ctx.currentTime);
      inst.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
      setTimeout(() => {
        try {
          inst.sourceNode.stop();
          inst.sourceNode.disconnect();
          inst.gainNode.disconnect();
        } catch {}
      }, 35);
    } catch {
      try {
        inst.sourceNode.stop();
      } catch {}
    }
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
    return this.activeInstances.has(soundId);
  }

  public getActivePlayingIds(): string[] {
    return Array.from(this.activeInstances.keys());
  }

  public getMixedTrack(): MediaStreamTrack | null {
    return this.mixedStreamTrack;
  }

  public cleanup(): void {
    this.stopAllSounds();
    if (this.rawMicStream) {
      this.rawMicStream = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }
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
  }
}

export const soundboardAudioEngine = new SoundboardAudioEngine();
