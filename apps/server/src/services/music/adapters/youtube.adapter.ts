import play from 'play-dl';
import { MusicTrackDto } from '@nightshift/shared';
import { BaseMusicAdapter } from './base.adapter.js';
import { TrackValidationResult, AudioStreamResult, UserContext } from '../types.js';

export class YouTubeAdapter extends BaseMusicAdapter {
  readonly name = 'youtube' as const;
  readonly displayName = 'YouTube';

  private static YT_REGEX = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  private static YT_PLAYLIST_REGEX = /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/i;

  canHandle(input: string): boolean {
    if (!input) return false;
    const trimmed = input.trim();
    if (YouTubeAdapter.YT_REGEX.test(trimmed) || YouTubeAdapter.YT_PLAYLIST_REGEX.test(trimmed)) {
      return true;
    }
    try {
      const type = play.yt_validate(trimmed);
      return type === 'video' || type === 'playlist';
    } catch {
      return false;
    }
  }

  validateUrl(url: string): TrackValidationResult {
    if (!url) return { valid: false, error: 'Empty URL' };
    const trimmed = url.trim();

    const playlistMatch = trimmed.match(YouTubeAdapter.YT_PLAYLIST_REGEX);
    if (playlistMatch) {
      return { valid: true, id: playlistMatch[1], type: 'playlist' };
    }

    const videoMatch = trimmed.match(YouTubeAdapter.YT_REGEX);
    if (videoMatch) {
      return { valid: true, id: videoMatch[1], type: 'track' };
    }

    try {
      const validation = play.yt_validate(trimmed);
      if (validation === 'video') {
        return { valid: true, type: 'track' };
      }
      if (validation === 'playlist') {
        return { valid: true, type: 'playlist' };
      }
      return { valid: false, error: 'Not a recognized YouTube video or playlist URL' };
    } catch (err: any) {
      return { valid: false, error: err?.message || 'Invalid YouTube URL' };
    }
  }

  async search(query: string, limit = 5): Promise<MusicTrackDto[]> {
    if (!query || !query.trim()) return [];

    try {
      const results = await play.search(query.trim(), {
        source: { youtube: 'video' },
        limit: Math.min(limit, 10),
      });

      const dummyUser: UserContext = { id: 'search', displayName: 'Search', username: 'search' };
      return results.map((video) =>
        this.createTrackDto({
          title: video.title || 'Untitled Track',
          artist: video.channel?.name || 'YouTube',
          thumbnailUrl: video.thumbnails?.[0]?.url || null,
          durationSeconds: video.durationInSec || 0,
          url: video.url,
          user: dummyUser,
        })
      );
    } catch (err: any) {
      console.error('[YouTubeAdapter] Search error:', err?.message || err);
      throw new Error(`YouTube search failed: ${err?.message || 'Rate limit or network error'}`);
    }
  }

  async resolve(input: string, user: UserContext): Promise<MusicTrackDto[]> {
    const trimmed = input.trim();
    const validation = this.validateUrl(trimmed);

    // If it's a playlist URL
    if (validation.valid && validation.type === 'playlist') {
      try {
        const playlist = await play.playlist_info(trimmed, { incomplete: true });
        const videos = await playlist.all_videos();
        const maxTracks = 25; // Limit to 25 items for safety
        const selected = videos.slice(0, maxTracks);

        return selected.map((v) =>
          this.createTrackDto({
            title: v.title || 'Untitled Track',
            artist: v.channel?.name || playlist.title || 'YouTube Playlist',
            thumbnailUrl: v.thumbnails?.[0]?.url || playlist.thumbnail?.url || null,
            durationSeconds: v.durationInSec || 0,
            url: v.url,
            user,
          })
        );
      } catch (err: any) {
        console.error('[YouTubeAdapter] Playlist resolve error:', err);
        throw new Error(`Could not load YouTube playlist: ${err?.message || 'Private or unavailable'}`);
      }
    }

    // If it's a direct video URL
    if (validation.valid && validation.type === 'track') {
      try {
        const info = await play.video_basic_info(trimmed);
        const details = info.video_details;

        return [
          this.createTrackDto({
            title: details.title || 'Untitled Video',
            artist: details.channel?.name || 'YouTube',
            thumbnailUrl: details.thumbnails?.[0]?.url || null,
            durationSeconds: details.durationInSec || 0,
            url: details.url,
            user,
          }),
        ];
      } catch (err: any) {
        console.error('[YouTubeAdapter] Video resolve error:', err);
        if (err?.message?.includes('Sign in') || err?.message?.includes('age-restricted')) {
          throw new Error('This YouTube video is age-restricted or requires account verification.');
        }
        if (err?.message?.includes('Private') || err?.message?.includes('unavailable')) {
          throw new Error('This YouTube video is private, deleted, or region-restricted.');
        }
        throw new Error(`Failed to load YouTube track: ${err?.message || 'Track unavailable'}`);
      }
    }

    // If it's not a URL, perform a search and pick top result
    const searchResults = await this.search(trimmed, 1);
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`No YouTube results found for "${trimmed}"`);
    }

    // Set the actual user who requested
    return [
      {
        ...searchResults[0],
        requestingUserId: user.id,
        requestingUserName: user.displayName || user.username,
      },
    ];
  }

  async getAudioStream(track: MusicTrackDto): Promise<AudioStreamResult> {
    try {
      const stream = await play.stream(track.url, {
        quality: 2, // High audio quality
        discordPlayerCompatibility: false,
      });

      return {
        stream: stream.stream,
        format: stream.type,
      };
    } catch (err: any) {
      console.error('[YouTubeAdapter] getAudioStream error:', err);
      if (err?.message?.includes('Sign in') || err?.message?.includes('age-restricted')) {
        throw new Error('Cannot play audio: Video is age-restricted on YouTube.');
      }
      throw new Error(`YouTube audio playback failed: ${err?.message || 'Access error'}`);
    }
  }
}
