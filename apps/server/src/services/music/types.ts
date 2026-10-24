import { MusicTrackDto, MusicSourceType } from '@nightshift/shared';
import { Readable } from 'stream';

export interface AudioStreamResult {
  stream: Readable;
  format?: string;
  bitrate?: number;
}

export interface TrackValidationResult {
  valid: boolean;
  id?: string;
  type?: 'track' | 'playlist' | 'search';
  error?: string;
}

export interface UserContext {
  id: string;
  displayName: string;
  username: string;
}

export interface MusicSourceAdapter {
  readonly name: MusicSourceType;
  readonly displayName: string;

  canHandle(input: string): boolean;
  validateUrl(url: string): TrackValidationResult;
  search(query: string, limit?: number): Promise<MusicTrackDto[]>;
  resolve(input: string, user: UserContext): Promise<MusicTrackDto[]>;
  getAudioStream(track: MusicTrackDto): Promise<AudioStreamResult>;
}
