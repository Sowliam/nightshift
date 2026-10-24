import play, { SoundCloudTrack, SoundCloudPlaylist } from 'play-dl';
import { MusicTrackDto } from '@nightshift/shared';
import { BaseMusicAdapter } from './base.adapter.js';
import { TrackValidationResult, AudioStreamResult, UserContext } from '../types.js';

export class SoundCloudAdapter extends BaseMusicAdapter {
  readonly name = 'soundcloud' as const;
  readonly displayName = 'SoundCloud';

  private static SC_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:soundcloud\.com|on\.soundcloud\.com)\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/i;
  private static SC_PLAYLIST_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?(?:soundcloud\.com)\/([a-zA-Z0-9_-]+\/sets\/[a-zA-Z0-9_-]+)/i;

  private isClientInitialized = false;

  private async ensureClientId(): Promise<void> {
    if (this.isClientInitialized) return;

    try {
      const envId = process.env.SOUNDCLOUD_CLIENT_ID;
      if (envId) {
        await play.setToken({ soundcloud: { client_id: envId } });
        this.isClientInitialized = true;
        return;
      }

      const freeId = await play.getFreeClientID();
      if (freeId) {
        await play.setToken({ soundcloud: { client_id: freeId } });
        this.isClientInitialized = true;
      }
    } catch (err: any) {
      console.warn('[SoundCloudAdapter] Failed to fetch SoundCloud client ID:', err?.message || err);
    }
  }

  canHandle(input: string): boolean {
    if (!input) return false;
    const trimmed = input.trim();
    return SoundCloudAdapter.SC_REGEX.test(trimmed) || SoundCloudAdapter.SC_PLAYLIST_REGEX.test(trimmed);
  }

  validateUrl(url: string): TrackValidationResult {
    if (!url) return { valid: false, error: 'Empty URL' };
    const trimmed = url.trim();

    if (SoundCloudAdapter.SC_PLAYLIST_REGEX.test(trimmed)) {
      return { valid: true, type: 'playlist' };
    }

    if (SoundCloudAdapter.SC_REGEX.test(trimmed)) {
      return { valid: true, type: 'track' };
    }

    return { valid: false, error: 'Not a recognized SoundCloud track or set URL' };
  }

  async search(query: string, limit = 5): Promise<MusicTrackDto[]> {
    if (!query || !query.trim()) return [];
    await this.ensureClientId();

    try {
      const results = await play.search(query.trim(), {
        source: { soundcloud: 'tracks' },
        limit: Math.min(limit, 10),
      });

      const dummyUser: UserContext = { id: 'search', displayName: 'Search', username: 'search' };
      return (results as SoundCloudTrack[]).map((track) =>
        this.createTrackDto({
          title: track.name || 'Untitled SoundCloud Track',
          artist: track.user?.name || 'SoundCloud Artist',
          thumbnailUrl: track.thumbnail || null,
          durationSeconds: track.durationInSec || 0,
          url: track.url,
          user: dummyUser,
        })
      );
    } catch (err: any) {
      console.error('[SoundCloudAdapter] Search error:', err?.message || err);
      throw new Error(`SoundCloud search failed: ${err?.message || 'Rate limit or network error'}`);
    }
  }

  async resolve(input: string, user: UserContext): Promise<MusicTrackDto[]> {
    const trimmed = input.trim();
    await this.ensureClientId();

    const isUrl = this.canHandle(trimmed);

    if (isUrl) {
      try {
        const scData = await play.soundcloud(trimmed);

        if (scData.type === 'playlist') {
          const playlist = scData as SoundCloudPlaylist;
          const tracks = await playlist.all_tracks();
          const selected = tracks.slice(0, 25);

          return selected.map((t) =>
            this.createTrackDto({
              title: t.name || 'Untitled Track',
              artist: t.user?.name || playlist.name || 'SoundCloud Playlist',
              thumbnailUrl: t.thumbnail || null,
              durationSeconds: t.durationInSec || 0,
              url: t.url,
              user,
            })
          );
        }

        const track = scData as SoundCloudTrack;
        return [
          this.createTrackDto({
            title: track.name || 'Untitled Track',
            artist: track.user?.name || 'SoundCloud Artist',
            thumbnailUrl: track.thumbnail || null,
            durationSeconds: track.durationInSec || 0,
            url: track.url,
            user,
          }),
        ];
      } catch (err: any) {
        console.error('[SoundCloudAdapter] Resolve URL error:', err);
        throw new Error(`Failed to load SoundCloud track: ${err?.message || 'Track is private, deleted, or unavailable'}`);
      }
    }

    // Otherwise search SoundCloud
    const searchResults = await this.search(trimmed, 1);
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`No SoundCloud results found for "${trimmed}"`);
    }

    return [
      {
        ...searchResults[0],
        requestingUserId: user.id,
        requestingUserName: user.displayName || user.username,
      },
    ];
  }

  async getAudioStream(track: MusicTrackDto): Promise<AudioStreamResult> {
    await this.ensureClientId();
    try {
      const stream = await play.stream(track.url, {
        quality: 2,
        discordPlayerCompatibility: false,
      });

      return {
        stream: stream.stream,
        format: stream.type,
      };
    } catch (err: any) {
      console.error('[SoundCloudAdapter] getAudioStream error:', err);
      throw new Error(`SoundCloud audio playback failed: ${err?.message || 'Stream unavailable'}`);
    }
  }
}
