import { MusicTrackDto, MusicSourceType } from '@nightshift/shared';
import { MusicSourceAdapter, TrackValidationResult, AudioStreamResult, UserContext } from '../types.js';
import { nanoid } from 'nanoid';

export abstract class BaseMusicAdapter implements MusicSourceAdapter {
  abstract readonly name: MusicSourceType;
  abstract readonly displayName: string;

  abstract canHandle(input: string): boolean;
  abstract validateUrl(url: string): TrackValidationResult;
  abstract search(query: string, limit?: number): Promise<MusicTrackDto[]>;
  abstract resolve(input: string, user: UserContext): Promise<MusicTrackDto[]>;
  abstract getAudioStream(track: MusicTrackDto): Promise<AudioStreamResult>;

  protected createTrackDto(params: {
    title: string;
    artist: string;
    thumbnailUrl?: string | null;
    durationSeconds: number;
    url: string;
    user: UserContext;
    status?: 'pending' | 'playing' | 'paused' | 'failed' | 'finished';
    errorMessage?: string;
  }): MusicTrackDto {
    return {
      id: nanoid(12),
      title: params.title.trim() || 'Untitled Track',
      artist: params.artist.trim() || 'Unknown Artist',
      thumbnailUrl: params.thumbnailUrl || null,
      durationSeconds: Math.max(0, Math.round(params.durationSeconds || 0)),
      source: this.name,
      url: params.url,
      requestingUserId: params.user.id,
      requestingUserName: params.user.displayName || params.user.username,
      status: params.status || 'pending',
      errorMessage: params.errorMessage,
      addedAt: new Date().toISOString(),
    };
  }
}
