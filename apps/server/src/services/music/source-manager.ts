import { MusicTrackDto, MusicSourceType } from '@nightshift/shared';
import { MusicSourceAdapter, AudioStreamResult, UserContext } from './types.js';
import { YouTubeAdapter } from './adapters/youtube.adapter.js';
import { SoundCloudAdapter } from './adapters/soundcloud.adapter.js';

export class MusicSourceManager {
  private adapters = new Map<MusicSourceType, MusicSourceAdapter>();

  constructor() {
    const yt = new YouTubeAdapter();
    const sc = new SoundCloudAdapter();
    this.adapters.set('youtube', yt);
    this.adapters.set('soundcloud', sc);
  }

  getAdapter(source: MusicSourceType): MusicSourceAdapter | undefined {
    return this.adapters.get(source);
  }

  /**
   * Resolves a query or URL into one or more normalized MusicTrackDto objects.
   */
  async resolve(input: string, user: UserContext): Promise<MusicTrackDto[]> {
    if (!input || !input.trim()) {
      throw new Error('Please provide a song name, YouTube URL, or SoundCloud URL.');
    }

    const trimmed = input.trim();

    // 1. Explicit source prefixes: "sc: <query>" or "yt: <query>"
    if (trimmed.toLowerCase().startsWith('sc:')) {
      const clean = trimmed.substring(3).trim();
      const sc = this.adapters.get('soundcloud')!;
      return await sc.resolve(clean, user);
    }

    if (trimmed.toLowerCase().startsWith('yt:')) {
      const clean = trimmed.substring(3).trim();
      const yt = this.adapters.get('youtube')!;
      return await yt.resolve(clean, user);
    }

    // 2. Check if any adapter recognizes this as their supported URL
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(trimmed)) {
        return await adapter.resolve(trimmed, user);
      }
    }

    // 3. If it looks like a generic HTTP URL that didn't match
    if (/^https?:\/\//i.test(trimmed)) {
      throw new Error(
        'Unsupported music URL. Supported sources: YouTube (youtube.com, youtu.be) and SoundCloud (soundcloud.com).'
      );
    }

    // 4. Default search fallback: Try YouTube first, then SoundCloud
    const yt = this.adapters.get('youtube')!;
    try {
      return await yt.resolve(trimmed, user);
    } catch (ytErr: any) {
      console.warn(`[MusicSourceManager] YouTube search failed for "${trimmed}", attempting SoundCloud fallback:`, ytErr?.message);
      const sc = this.adapters.get('soundcloud')!;
      try {
        return await sc.resolve(trimmed, user);
      } catch (scErr: any) {
        throw new Error(`Track not found on YouTube or SoundCloud for "${trimmed}".`);
      }
    }
  }

  /**
   * Retrieves audio stream for a track from its corresponding adapter.
   */
  async getAudioStream(track: MusicTrackDto): Promise<AudioStreamResult> {
    const adapter = this.adapters.get(track.source);
    if (!adapter) {
      throw new Error(`Unsupported source adapter: ${track.source}`);
    }
    return await adapter.getAudioStream(track);
  }
}

export const musicSourceManager = new MusicSourceManager();
