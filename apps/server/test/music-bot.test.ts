import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YouTubeAdapter } from '../src/services/music/adapters/youtube.adapter.js';
import { SoundCloudAdapter } from '../src/services/music/adapters/soundcloud.adapter.js';
import { MusicSourceManager } from '../src/services/music/source-manager.js';
import { MusicSession } from '../src/services/music/music-session.js';
import { MusicBotService } from '../src/services/music/music-bot.service.js';
import { MusicTrackDto } from '@nightshift/shared';

describe('NIGHTSHIFT Music Bot Tests', () => {
  const dummyUser = { id: 'user_123', username: 'alex', displayName: 'Alex' };

  // 1. YouTube URL Validation Tests
  describe('YouTube Adapter URL Validation', () => {
    const yt = new YouTubeAdapter();

    it('validates standard watch URLs', () => {
      const res = yt.validateUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('track');
      expect(res.id).toBe('dQw4w9WgXcQ');
    });

    it('validates short youtu.be URLs', () => {
      const res = yt.validateUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('track');
      expect(res.id).toBe('dQw4w9WgXcQ');
    });

    it('validates YouTube Shorts URLs', () => {
      const res = yt.validateUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('track');
      expect(res.id).toBe('dQw4w9WgXcQ');
    });

    it('validates YouTube playlist URLs', () => {
      const res = yt.validateUrl('https://www.youtube.com/playlist?list=PLrAl5G_JpCgW-f0_LvhK1k6s-sV6-bT');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('playlist');
    });

    it('rejects invalid or non-YouTube URLs', () => {
      const res = yt.validateUrl('https://example.com/not-youtube');
      expect(res.valid).toBe(false);
    });

    it('detects if it can handle an input URL', () => {
      expect(yt.canHandle('https://www.youtube.com/watch?v=abc12345678')).toBe(true);
      expect(yt.canHandle('https://soundcloud.com/artist/song')).toBe(false);
    });
  });

  // 2. SoundCloud URL Validation Tests
  describe('SoundCloud Adapter URL Validation', () => {
    const sc = new SoundCloudAdapter();

    it('validates standard SoundCloud track URLs', () => {
      const res = sc.validateUrl('https://soundcloud.com/octobersveryown/drake-gods-plan');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('track');
    });

    it('validates mobile and short soundcloud URLs', () => {
      const res = sc.validateUrl('https://m.soundcloud.com/artist-name/track-name');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('track');
    });

    it('validates SoundCloud sets / playlists', () => {
      const res = sc.validateUrl('https://soundcloud.com/artist/sets/my-album');
      expect(res.valid).toBe(true);
      expect(res.type).toBe('playlist');
    });

    it('rejects invalid or non-SoundCloud URLs', () => {
      const res = sc.validateUrl('https://youtube.com/watch?v=123');
      expect(res.valid).toBe(false);
    });

    it('detects if it can handle an input URL', () => {
      expect(sc.canHandle('https://soundcloud.com/artist/track')).toBe(true);
      expect(sc.canHandle('https://youtube.com/watch?v=123')).toBe(false);
    });
  });

  // 3. MusicSourceManager Resolution & Delegation
  describe('MusicSourceManager Routing', () => {
    const manager = new MusicSourceManager();

    it('identifies YouTube URLs and delegates to YouTube adapter', () => {
      const ytAdapter = manager.getAdapter('youtube');
      expect(ytAdapter).toBeDefined();
      expect(ytAdapter?.canHandle('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('identifies SoundCloud URLs and delegates to SoundCloud adapter', () => {
      const scAdapter = manager.getAdapter('soundcloud');
      expect(scAdapter).toBeDefined();
      expect(scAdapter?.canHandle('https://soundcloud.com/artist/track')).toBe(true);
    });

    it('rejects unsupported domain URLs', async () => {
      await expect(manager.resolve('https://vimeo.com/123456', dummyUser)).rejects.toThrow(
        /Unsupported music URL/
      );
    });

    it('rejects empty queries', async () => {
      await expect(manager.resolve('   ', dummyUser)).rejects.toThrow(
        /Please provide a song name/
      );
    });
  });

  // 4. Music Session Queue and Playback State Management
  describe('MusicSession Queue Management', () => {
    let session: MusicSession;

    beforeEach(() => {
      session = new MusicSession('server_alpha');
      session.channelId = 'voice_channel_1';
      session.channelName = 'General Voice';
    });

    const createMockTrack = (title: string, duration = 180): MusicTrackDto => ({
      id: `track_${Math.random()}`,
      title,
      artist: 'Test Artist',
      thumbnailUrl: null,
      durationSeconds: duration,
      source: 'youtube',
      url: `https://youtube.com/watch?v=${title}`,
      requestingUserId: dummyUser.id,
      requestingUserName: dummyUser.displayName,
      status: 'pending',
      addedAt: new Date().toISOString(),
    });

    it('enqueues tracks and maintains FIFO ordering', async () => {
      const t1 = createMockTrack('Song One');
      const t2 = createMockTrack('Song Two');
      const t3 = createMockTrack('Song Three');

      // Mock playNext to avoid launching real LiveKit in unit test
      vi.spyOn(session, 'playNext').mockImplementation(async () => {});

      await session.enqueue([t1, t2, t3]);

      expect(session.queue.length).toBe(3);
      expect(session.queue[0].title).toBe('Song One');
      expect(session.queue[1].title).toBe('Song Two');
      expect(session.queue[2].title).toBe('Song Three');
    });

    it('removes track at 1-based index', async () => {
      vi.spyOn(session, 'playNext').mockImplementation(async () => {});

      const t1 = createMockTrack('Song 1');
      const t2 = createMockTrack('Song 2');
      const t3 = createMockTrack('Song 3');

      await session.enqueue([t1, t2, t3]);

      // Remove position 2 (Song 2)
      const removed = session.removeAt(2);
      expect(removed?.title).toBe('Song 2');
      expect(session.queue.length).toBe(2);
      expect(session.queue[0].title).toBe('Song 1');
      expect(session.queue[1].title).toBe('Song 3');

      // Invalid position returns null
      expect(session.removeAt(99)).toBeNull();
      expect(session.removeAt(0)).toBeNull();
    });

    it('clears all upcoming tracks from queue', async () => {
      vi.spyOn(session, 'playNext').mockImplementation(async () => {});

      await session.enqueue([createMockTrack('A'), createMockTrack('B')]);
      expect(session.queue.length).toBe(2);

      const clearedCount = session.clearQueue();
      expect(clearedCount).toBe(2);
      expect(session.queue.length).toBe(0);
    });

    it('clamps volume to [0, 100]', () => {
      session.setVolume(50);
      expect(session.volume).toBe(50);

      session.setVolume(-20);
      expect(session.volume).toBe(0);

      session.setVolume(150);
      expect(session.volume).toBe(100);
    });

    it('handles pause and resume states', () => {
      // Nothing playing -> pause returns false
      expect(session.pause()).toBe(false);

      session.status = 'playing';
      // Mock publisher
      (session as any).publisher = {
        pause: vi.fn(),
        resume: vi.fn(),
        isConnected: true,
      };

      expect(session.pause()).toBe(true);
      expect(session.status).toBe('paused');

      expect(session.resume()).toBe(true);
      expect(session.status).toBe('playing');
    });
  });

  // 5. Server Isolation
  describe('Multi-Server Isolation', () => {
    it('ensures sessions on different servers do not interfere with each other', () => {
      const botService = new MusicBotService();

      const sessionA = botService.getOrCreateSession('server_1');
      const sessionB = botService.getOrCreateSession('server_2');

      sessionA.setVolume(40);
      sessionB.setVolume(90);

      expect(sessionA.volume).toBe(40);
      expect(sessionB.volume).toBe(90);

      sessionA.queue.push({
        id: '1',
        title: 'Server 1 Song',
        artist: 'Artist 1',
        durationSeconds: 100,
        source: 'youtube',
        url: 'http://yt.com/1',
        requestingUserId: 'u1',
        status: 'pending',
        addedAt: new Date().toISOString(),
      });

      expect(sessionA.queue.length).toBe(1);
      expect(sessionB.queue.length).toBe(0);
    });
  });

  // 6. Slash Command Parsing
  describe('Slash Command Execution Parsing', () => {
    let botService: MusicBotService;

    beforeEach(() => {
      botService = new MusicBotService();
    });

    it('rejects non-slash command text', async () => {
      await expect(
        botService.executeSlashCommand('s1', 'c1', 'hello world', dummyUser)
      ).rejects.toThrow('Not a slash command');
    });

    it('executes /volume command with validation', async () => {
      const res = await botService.executeSlashCommand('s1', 'c1', '/volume 65', dummyUser);
      expect(res.success).toBe(true);
      expect(res.session.volume).toBe(65);
      expect(res.message).toContain('65%');
    });

    it('rejects invalid volume argument', async () => {
      await expect(
        botService.executeSlashCommand('s1', 'c1', '/volume abc', dummyUser)
      ).rejects.toThrow(/Usage: `\/volume/);
    });

    it('executes /help command returning command list', async () => {
      const res = await botService.executeSlashCommand('s1', 'c1', '/help', dummyUser);
      expect(res.success).toBe(true);
      expect(res.message).toContain('/play');
      expect(res.message).toContain('/queue');
      expect(res.message).toContain('/skip');
    });

    it('reports unknown commands clearly', async () => {
      await expect(
        botService.executeSlashCommand('s1', 'c1', '/foobar', dummyUser)
      ).rejects.toThrow(/Unknown command `\/foobar`/);
    });
  });
});
