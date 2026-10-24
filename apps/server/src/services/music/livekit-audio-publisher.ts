import {
  Room,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import ffmpegPath from 'ffmpeg-static';
import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { generateLiveKitToken } from '../livekit.service.js';
import { config } from '../../config.js';
import { MusicTrackDto } from '@nightshift/shared';
import { AudioStreamResult } from './types.js';

export interface LiveKitAudioPublisherCallbacks {
  onProgress?: (positionSeconds: number) => void;
  onTrackFinished?: () => void;
  onError?: (err: Error) => void;
}

export class LiveKitAudioPublisher {
  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private pumpInterval: ReturnType<typeof setInterval> | null = null;

  private pcmBuffer: Buffer = Buffer.alloc(0);
  private isPaused = false;
  private isDestroyed = false;
  private currentVolume = 80;
  private positionSeconds = 0;
  private isStreamEnded = false;

  private readonly SAMPLE_RATE = 48000;
  private readonly NUM_CHANNELS = 2; // Stereo
  private readonly FRAME_DURATION_MS = 20; // 20ms frame
  private readonly SAMPLES_PER_CHANNEL = 960; // 48000 * 0.02
  private readonly BYTES_PER_FRAME = 3840; // 960 * 2 channels * 2 bytes (16-bit)

  constructor(
    private readonly serverId: string,
    private readonly channelId: string,
    private readonly callbacks: LiveKitAudioPublisherCallbacks = {}
  ) {}

  get isConnected(): boolean {
    return this.room !== null && !this.isDestroyed;
  }

  get currentPosition(): number {
    return Math.floor(this.positionSeconds);
  }

  setVolume(vol: number): void {
    this.currentVolume = Math.max(0, Math.min(100, vol));
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  /**
   * Connects to the LiveKit voice room for this channel.
   */
  async connect(): Promise<void> {
    if (this.room) return;

    const roomName = `ns_${this.serverId}_${this.channelId}`;
    const botIdentity = `music-bot_${this.serverId}`;
    const botDisplayName = 'NIGHTSHIFT Music';

    const token = await generateLiveKitToken(roomName, botIdentity, botDisplayName);

    this.room = new Room();
    await this.room.connect(config.livekit.url, token);

    // Create 48kHz Stereo AudioSource
    this.audioSource = new AudioSource(this.SAMPLE_RATE, this.NUM_CHANNELS);
    this.audioTrack = LocalAudioTrack.createAudioTrack('music-audio', this.audioSource);

    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;

    if (!this.room || !this.room.localParticipant) {
      throw new Error('LiveKit room connection failed to initialize localParticipant');
    }

    await this.room.localParticipant.publishTrack(this.audioTrack, publishOptions);
  }

  /**
   * Starts playing an audio stream into the published LiveKit track.
   */
  async playStream(audioResult: AudioStreamResult, track: MusicTrackDto, startVolume = 80): Promise<void> {
    await this.connect();

    this.stopPlaybackProcess();
    this.pcmBuffer = Buffer.alloc(0);
    this.positionSeconds = 0;
    this.isPaused = false;
    this.isStreamEnded = false;
    this.currentVolume = startVolume;

    const ffExecutable = ffmpegPath || 'ffmpeg';

    // Spawn FFmpeg to convert arbitrary audio stream to raw 48kHz 16-bit stereo PCM (s16le)
    const ffmpegArgs = [
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ac', String(this.NUM_CHANNELS),
      '-ar', String(this.SAMPLE_RATE),
      '-loglevel', 'error',
      'pipe:1',
    ];

    try {
      this.ffmpegProcess = spawn(ffExecutable, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch (err: any) {
      console.error('[LiveKitAudioPublisher] Failed to spawn FFmpeg:', err);
      throw new Error(`Audio decoder initialization failed: ${err?.message}`);
    }

    // Pipe source audio to FFmpeg stdin
    audioResult.stream.on('error', (err) => {
      console.warn('[LiveKitAudioPublisher] Source audio stream error:', err.message);
      this.callbacks.onError?.(err);
    });

    audioResult.stream.pipe(this.ffmpegProcess.stdin!);

    // Receive decoded PCM from FFmpeg stdout
    this.ffmpegProcess.stdout!.on('data', (chunk: Buffer) => {
      if (this.isDestroyed) return;
      this.pcmBuffer = Buffer.concat([this.pcmBuffer, chunk]);
    });

    this.ffmpegProcess.stdout!.on('end', () => {
      this.isStreamEnded = true;
    });

    this.ffmpegProcess.on('error', (err) => {
      console.error('[LiveKitAudioPublisher] FFmpeg process error:', err);
      this.callbacks.onError?.(err);
    });

    // Start precision 20ms audio frame pump
    this.startPump();
  }

  private startPump(): void {
    if (this.pumpInterval) clearInterval(this.pumpInterval);

    this.pumpInterval = setInterval(async () => {
      if (this.isDestroyed || !this.audioSource) return;

      if (this.isPaused) {
        return;
      }

      if (this.pcmBuffer.length >= this.BYTES_PER_FRAME) {
        // Slice 20ms frame (3840 bytes)
        const frameBuf = this.pcmBuffer.subarray(0, this.BYTES_PER_FRAME);
        this.pcmBuffer = this.pcmBuffer.subarray(this.BYTES_PER_FRAME);

        // Convert Buffer to Int16Array
        const int16Array = new Int16Array(
          frameBuf.buffer,
          frameBuf.byteOffset,
          frameBuf.length / Int16Array.BYTES_PER_ELEMENT
        );

        // Apply volume attenuation in-place if not 100%
        if (this.currentVolume !== 100) {
          const factor = this.currentVolume / 100;
          for (let i = 0; i < int16Array.length; i++) {
            const scaled = Math.round(int16Array[i] * factor);
            int16Array[i] = Math.max(-32768, Math.min(32767, scaled));
          }
        }

        const audioFrame = new AudioFrame(
          int16Array,
          this.SAMPLE_RATE,
          this.NUM_CHANNELS,
          this.SAMPLES_PER_CHANNEL
        );

        try {
          await this.audioSource.captureFrame(audioFrame);
          this.positionSeconds += this.FRAME_DURATION_MS / 1000;
          this.callbacks.onProgress?.(this.positionSeconds);
        } catch (err: any) {
          console.warn('[LiveKitAudioPublisher] captureFrame error:', err?.message);
        }
      } else if (this.isStreamEnded && this.pcmBuffer.length < this.BYTES_PER_FRAME) {
        // End of track reached
        this.stopPlaybackProcess();
        this.callbacks.onTrackFinished?.();
      }
    }, this.FRAME_DURATION_MS);
  }

  private stopPlaybackProcess(): void {
    if (this.pumpInterval) {
      clearInterval(this.pumpInterval);
      this.pumpInterval = null;
    }

    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.stdin?.destroy();
        this.ffmpegProcess.stdout?.destroy();
        this.ffmpegProcess.kill('SIGKILL');
      } catch {}
      this.ffmpegProcess = null;
    }
  }

  /**
   * Completely stops playback and disconnects from LiveKit room.
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.stopPlaybackProcess();
    this.pcmBuffer = Buffer.alloc(0);

    if (this.audioSource) {
      try {
        this.audioSource.close();
      } catch {}
      this.audioSource = null;
    }

    if (this.room) {
      try {
        await this.room.disconnect();
      } catch {}
      this.room = null;
    }
  }
}
