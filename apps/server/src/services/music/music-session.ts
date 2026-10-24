import { MusicTrackDto, MusicSessionDto } from '@nightshift/shared';
import { LiveKitAudioPublisher } from './livekit-audio-publisher.js';
import { musicSourceManager } from './source-manager.js';
import { prisma } from '../../lib/prisma.js';

export interface MusicSessionEvents {
  onStateChanged?: (session: MusicSessionDto) => void;
  onTrackStarted?: (track: MusicTrackDto) => void;
  onTrackError?: (track: MusicTrackDto, error: string) => void;
}

export class MusicSession {
  readonly serverId: string;
  channelId: string | null = null;
  channelName: string | null = null;

  currentTrack: MusicTrackDto | null = null;
  queue: MusicTrackDto[] = [];
  status: 'idle' | 'searching' | 'playing' | 'paused' | 'error' = 'idle';
  volume = 80;
  errorMessage: string | null = null;

  private publisher: LiveKitAudioPublisher | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isProcessingNext = false;

  constructor(serverId: string, private readonly events: MusicSessionEvents = {}) {
    this.serverId = serverId;
  }

  get positionSeconds(): number {
    return this.publisher?.currentPosition || 0;
  }

  get isLiveKitConnected(): boolean {
    return this.publisher?.isConnected || false;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Auto-disconnect from LiveKit after 5 minutes of idle
    this.idleTimer = setTimeout(async () => {
      if (this.status === 'idle') {
        console.log(`[MusicSession:${this.serverId}] Inactive timeout reached. Disconnecting worker.`);
        await this.cleanupPublisher();
        this.notifyState();
      }
    }, 5 * 60 * 1000);
  }

  private async cleanupPublisher(): Promise<void> {
    if (this.publisher) {
      await this.publisher.destroy();
      this.publisher = null;
    }
  }

  private notifyState(): void {
    this.events.onStateChanged?.(this.toDto());
  }

  /**
   * Sets the target voice channel for this music session.
   */
  async setChannel(channelId: string): Promise<void> {
    if (this.channelId === channelId) return;

    // If already playing in another channel, clean up current connection
    if (this.publisher) {
      await this.cleanupPublisher();
    }

    this.channelId = channelId;
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { name: true },
    });
    this.channelName = channel?.name || 'Voice Channel';
  }

  /**
   * Enqueues one or more tracks into the session.
   */
  async enqueue(tracks: MusicTrackDto[], targetChannelId?: string): Promise<{ addedCount: number; willPlayImmediately: boolean }> {
    if (targetChannelId) {
      await this.setChannel(targetChannelId);
    }

    if (!this.channelId) {
      throw new Error('No voice channel specified for music playback. Please join a voice channel or specify one.');
    }

    if (tracks.length === 0) return { addedCount: 0, willPlayImmediately: false };

    this.queue.push(...tracks);

    const willPlayImmediately = !this.currentTrack && (this.status === 'idle' || this.status === 'error');

    if (willPlayImmediately) {
      this.playNext();
    } else {
      this.notifyState();
    }

    return { addedCount: tracks.length, willPlayImmediately };
  }

  /**
   * Plays the next track from the queue.
   */
  async playNext(): Promise<void> {
    if (this.isProcessingNext) return;
    this.isProcessingNext = true;

    try {
      if (this.queue.length === 0) {
        this.currentTrack = null;
        this.status = 'idle';
        this.resetIdleTimer();
        this.notifyState();
        return;
      }

      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }

      const nextTrack = this.queue.shift()!;
      this.currentTrack = nextTrack;
      this.status = 'searching';
      this.errorMessage = null;
      this.notifyState();

      if (!this.channelId) {
        throw new Error('Channel ID missing');
      }

      // Initialize publisher if not already active
      if (!this.publisher || !this.publisher.isConnected) {
        this.publisher = new LiveKitAudioPublisher(this.serverId, this.channelId, {
          onTrackFinished: () => {
            console.log(`[MusicSession:${this.serverId}] Track finished: ${nextTrack.title}`);
            this.playNext();
          },
          onError: (err) => {
            console.error(`[MusicSession:${this.serverId}] Audio playback error:`, err);
            this.events.onTrackError?.(nextTrack, err.message);
            // Skip to next track on stream failure
            this.playNext();
          },
        });
      }

      // Obtain audio stream from source adapter
      const audioResult = await musicSourceManager.getAudioStream(nextTrack);

      // Start pumping audio into LiveKit
      await this.publisher.playStream(audioResult, nextTrack, this.volume);
      this.status = 'playing';
      this.currentTrack.status = 'playing';
      this.events.onTrackStarted?.(this.currentTrack);
      this.notifyState();
    } catch (err: any) {
      console.error(`[MusicSession:${this.serverId}] Failed to play track:`, err);
      this.status = 'error';
      this.errorMessage = err?.message || 'Playback failed';
      if (this.currentTrack) {
        this.events.onTrackError?.(this.currentTrack, this.errorMessage!);
      }
      // If there are still items in queue, attempt next
      if (this.queue.length > 0) {
        setTimeout(() => this.playNext(), 1500);
      } else {
        this.resetIdleTimer();
      }
      this.notifyState();
    } finally {
      this.isProcessingNext = false;
    }
  }

  pause(): boolean {
    if (this.status !== 'playing' || !this.publisher) return false;
    this.publisher.pause();
    this.status = 'paused';
    if (this.currentTrack) this.currentTrack.status = 'paused';
    this.notifyState();
    return true;
  }

  resume(): boolean {
    if (this.status !== 'paused' || !this.publisher) return false;
    this.publisher.resume();
    this.status = 'playing';
    if (this.currentTrack) this.currentTrack.status = 'playing';
    this.notifyState();
    return true;
  }

  async skip(): Promise<MusicTrackDto | null> {
    const skipped = this.currentTrack;
    if (this.publisher) {
      // Stopping current stream causes publisher to advance or playNext
      await this.playNext();
    } else {
      await this.playNext();
    }
    return skipped;
  }

  async stop(): Promise<void> {
    this.queue = [];
    this.currentTrack = null;
    this.status = 'idle';
    this.errorMessage = null;
    await this.cleanupPublisher();
    this.resetIdleTimer();
    this.notifyState();
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.publisher) {
      this.publisher.setVolume(this.volume);
    }
    this.notifyState();
  }

  removeAt(position: number): MusicTrackDto | null {
    const index = position - 1;
    if (index < 0 || index >= this.queue.length) {
      return null;
    }
    const [removed] = this.queue.splice(index, 1);
    this.notifyState();
    return removed;
  }

  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    this.notifyState();
    return count;
  }

  toDto(): MusicSessionDto {
    return {
      serverId: this.serverId,
      channelId: this.channelId,
      channelName: this.channelName,
      status: this.status,
      currentTrack: this.currentTrack,
      queue: [...this.queue],
      volume: this.volume,
      positionSeconds: this.positionSeconds,
      isLiveKitConnected: this.isLiveKitConnected,
      error: this.errorMessage,
    };
  }
}
