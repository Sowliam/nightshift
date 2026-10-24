import {
  MusicSessionDto,
  ServerBotDto,
  MusicTrackDto,
  MUSIC_BOT_USER,
} from '@nightshift/shared';
import { MusicSession } from './music-session.js';
import { musicSourceManager } from './source-manager.js';
import { UserContext } from './types.js';
import { prisma } from '../../lib/prisma.js';

export interface CommandExecutionResult {
  success: boolean;
  message: string;
  session: MusicSessionDto;
  track?: MusicTrackDto | null;
}

export class MusicBotService {
  private sessions = new Map<string, MusicSession>();

  /**
   * Retrieves or initializes the music session for a given server.
   */
  getOrCreateSession(serverId: string): MusicSession {
    let session = this.sessions.get(serverId);
    if (!session) {
      session = new MusicSession(serverId, {
        onStateChanged: (state) => {
          // Can be hooked to websocket broadcaster or notification
        },
        onTrackStarted: async (track) => {
          await this.notifyTrackStarted(serverId, track);
        },
        onTrackError: async (track, error) => {
          await this.notifyTrackError(serverId, track, error);
        },
      });
      this.sessions.set(serverId, session);
    }
    return session;
  }

  getSessionDto(serverId: string): MusicSessionDto {
    const session = this.sessions.get(serverId);
    if (!session) {
      return {
        serverId,
        channelId: null,
        status: 'idle',
        currentTrack: null,
        queue: [],
        volume: 80,
        positionSeconds: 0,
        isLiveKitConnected: false,
      };
    }
    return session.toDto();
  }

  /**
   * Ensures the built-in bot user and membership exist for a server.
   */
  async ensureBotRecord(serverId: string): Promise<ServerBotDto> {
    // 1. Ensure Bot User exists in User table
    let botUser = await prisma.user.findUnique({
      where: { username: MUSIC_BOT_USER.username },
    });

    if (!botUser) {
      botUser = await prisma.user.create({
        data: {
          id: MUSIC_BOT_USER.id,
          username: MUSIC_BOT_USER.username,
          displayName: MUSIC_BOT_USER.displayName,
          passwordHash: 'BOT_INTERNAL_NO_LOGIN',
          avatarUrl: MUSIC_BOT_USER.avatarUrl,
        },
      });
    }

    // 2. Ensure Bot is a member of the server
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: botUser.id } },
    });

    if (!membership) {
      await prisma.serverMember.create({
        data: {
          serverId,
          userId: botUser.id,
          role: 'member',
        },
      });
    }

    // 3. Ensure ServerBot configuration record exists
    let serverBot = await prisma.serverBot.findUnique({
      where: { serverId_botType: { serverId, botType: 'music' } },
    });

    if (!serverBot) {
      serverBot = await prisma.serverBot.create({
        data: {
          serverId,
          botType: 'music',
          isEnabled: true,
          volume: 80,
        },
      });
    }

    return {
      id: serverBot.id,
      serverId: serverBot.serverId,
      botType: 'music',
      name: MUSIC_BOT_USER.username,
      displayName: MUSIC_BOT_USER.displayName,
      avatarUrl: MUSIC_BOT_USER.avatarUrl,
      isEnabled: serverBot.isEnabled,
      defaultChannelId: serverBot.defaultChannelId,
      volume: serverBot.volume,
      session: this.getSessionDto(serverId),
    };
  }

  /**
   * Updates bot configuration (enabled/disabled, default voice channel, volume).
   */
  async updateBotSettings(
    serverId: string,
    settings: { isEnabled?: boolean; defaultChannelId?: string | null; volume?: number }
  ): Promise<ServerBotDto> {
    await this.ensureBotRecord(serverId);

    const updated = await prisma.serverBot.update({
      where: { serverId_botType: { serverId, botType: 'music' } },
      data: {
        ...(settings.isEnabled !== undefined ? { isEnabled: settings.isEnabled } : {}),
        ...(settings.defaultChannelId !== undefined ? { defaultChannelId: settings.defaultChannelId } : {}),
        ...(settings.volume !== undefined ? { volume: settings.volume } : {}),
      },
    });

    // If volume was updated, apply to active session
    if (settings.volume !== undefined) {
      const session = this.sessions.get(serverId);
      if (session) {
        session.setVolume(settings.volume);
      }
    }

    // If disabled, stop playback and disconnect
    if (settings.isEnabled === false) {
      const session = this.sessions.get(serverId);
      if (session) {
        await session.stop();
      }
    }

    return {
      id: updated.id,
      serverId: updated.serverId,
      botType: 'music',
      name: MUSIC_BOT_USER.username,
      displayName: MUSIC_BOT_USER.displayName,
      avatarUrl: MUSIC_BOT_USER.avatarUrl,
      isEnabled: updated.isEnabled,
      defaultChannelId: updated.defaultChannelId,
      volume: updated.volume,
      session: this.getSessionDto(serverId),
    };
  }

  /**
   * Core Command: /play <query>
   */
  async play(
    serverId: string,
    query: string,
    user: UserContext,
    targetChannelId?: string
  ): Promise<CommandExecutionResult> {
    const bot = await this.ensureBotRecord(serverId);
    if (!bot.isEnabled) {
      throw new Error('Music Bot is currently disabled on this server. An admin can enable it in Server Settings.');
    }

    const session = this.getOrCreateSession(serverId);

    // Resolve channel to join
    const channelId = targetChannelId || session.channelId || bot.defaultChannelId;
    if (!channelId) {
      // Find the first voice channel in this server as fallback
      const voiceChannel = await prisma.channel.findFirst({
        where: { serverId, type: 'voice' },
        orderBy: { order: 'asc' },
      });
      if (!voiceChannel) {
        throw new Error('No voice channels exist on this server to play music in.');
      }
      await session.setChannel(voiceChannel.id);
    } else {
      await session.setChannel(channelId);
    }

    // Resolve track or playlist
    const resolvedTracks = await musicSourceManager.resolve(query, user);
    if (resolvedTracks.length === 0) {
      throw new Error(`Could not find any playable tracks for: ${query}`);
    }

    const { addedCount, willPlayImmediately } = await session.enqueue(resolvedTracks);

    let message = '';
    if (addedCount === 1) {
      const track = resolvedTracks[0];
      const sourceBadge = track.source === 'youtube' ? 'YouTube' : 'SoundCloud';
      const durationStr = this.formatDuration(track.durationSeconds);
      if (willPlayImmediately) {
        message = `🎶 **Now Playing:** [${track.title}](${track.url}) (${durationStr}) via ${sourceBadge}`;
      } else {
        const pos = session.queue.length;
        message = `➕ Added **${track.title}** to queue at position **#${pos}** (${durationStr})`;
      }
    } else {
      message = `📚 Added **${addedCount} tracks** to the queue from playlist.`;
    }

    return {
      success: true,
      message,
      session: session.toDto(),
      track: resolvedTracks[0],
    };
  }

  /**
   * Core Command: /pause
   */
  pause(serverId: string): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const ok = session.pause();
    return {
      success: ok,
      message: ok ? '⏸ Playback paused.' : '⚠️ Nothing is currently playing to pause.',
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /resume
   */
  resume(serverId: string): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const ok = session.resume();
    return {
      success: ok,
      message: ok ? '▶️ Playback resumed.' : '⚠️ Playback is not paused.',
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /skip
   */
  async skip(serverId: string): Promise<CommandExecutionResult> {
    const session = this.getOrCreateSession(serverId);
    if (!session.currentTrack && session.queue.length === 0) {
      return {
        success: false,
        message: '⚠️ There are no tracks in the queue to skip.',
        session: session.toDto(),
      };
    }
    const skipped = await session.skip();
    return {
      success: true,
      message: skipped ? `⏭ Skipped: **${skipped.title}**` : '⏭ Skipped to next track.',
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /stop
   */
  async stop(serverId: string): Promise<CommandExecutionResult> {
    const session = this.getOrCreateSession(serverId);
    await session.stop();
    return {
      success: true,
      message: '⏹ Playback stopped, queue cleared, and bot disconnected from voice channel.',
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /queue
   */
  getQueue(serverId: string): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const current = session.currentTrack;
    const queue = session.queue;

    if (!current && queue.length === 0) {
      return {
        success: true,
        message: '📭 The queue is currently empty. Use `/play <query>` to add songs!',
        session: session.toDto(),
      };
    }

    let text = `📜 **Music Queue for ${session.channelName || 'Voice Channel'}**\n`;
    if (current) {
      const pos = this.formatDuration(session.positionSeconds);
      const total = this.formatDuration(current.durationSeconds);
      text += `▶️ **Now Playing:** ${current.title} (${pos} / ${total}) [${current.source}]\n\n`;
    }

    if (queue.length > 0) {
      text += `**Upcoming Tracks (${queue.length}):**\n`;
      const preview = queue.slice(0, 10);
      preview.forEach((t, i) => {
        text += `${i + 1}. **${t.title}** — \`${this.formatDuration(t.durationSeconds)}\` (requested by ${t.requestingUserName})\n`;
      });
      if (queue.length > 10) {
        text += `...and ${queue.length - 10} more tracks.\n`;
      }
    } else {
      text += '_No upcoming tracks in queue._\n';
    }

    return {
      success: true,
      message: text.trim(),
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /nowplaying
   */
  nowPlaying(serverId: string): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const track = session.currentTrack;

    if (!track) {
      return {
        success: true,
        message: '💤 Nothing is currently playing. Use `/play <song>` to start music!',
        session: session.toDto(),
      };
    }

    const pos = this.formatDuration(session.positionSeconds);
    const total = this.formatDuration(track.durationSeconds);
    const stateIcon = session.status === 'playing' ? '▶️' : '⏸';

    const bar = this.generateProgressBar(session.positionSeconds, track.durationSeconds);

    const text = [
      `${stateIcon} **Now Playing:**`,
      `**Title:** [${track.title}](${track.url})`,
      `**Artist:** ${track.artist}`,
      `**Source:** ${track.source.toUpperCase()}`,
      `**Progress:** \`${pos}\` ${bar} \`${total}\``,
      `**Volume:** ${session.volume}%`,
      `**Requested by:** ${track.requestingUserName || 'Member'}`,
    ].join('\n');

    return {
      success: true,
      message: text,
      session: session.toDto(),
      track,
    };
  }

  /**
   * Core Command: /volume <0-100>
   */
  setVolume(serverId: string, volume: number): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const cleanVol = Math.max(0, Math.min(100, volume));
    session.setVolume(cleanVol);

    // Save volume to database setting as well
    prisma.serverBot
      .update({
        where: { serverId_botType: { serverId, botType: 'music' } },
        data: { volume: cleanVol },
      })
      .catch(() => {});

    return {
      success: true,
      message: `🔊 Volume set to **${cleanVol}%**`,
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /remove <position>
   */
  removeTrack(serverId: string, position: number): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const removed = session.removeAt(position);
    if (!removed) {
      return {
        success: false,
        message: `⚠️ No track found at queue position **#${position}**.`,
        session: session.toDto(),
      };
    }
    return {
      success: true,
      message: `🗑 Removed **${removed.title}** from position #${position}.`,
      session: session.toDto(),
    };
  }

  /**
   * Core Command: /clearqueue
   */
  clearQueue(serverId: string): CommandExecutionResult {
    const session = this.getOrCreateSession(serverId);
    const count = session.clearQueue();
    return {
      success: true,
      message: `🧹 Cleared **${count} track(s)** from the queue.`,
      session: session.toDto(),
    };
  }

  /**
   * Slash command parser and dispatcher.
   * Supports: /play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /volume, /remove, /clearqueue
   */
  async executeSlashCommand(
    serverId: string,
    channelId: string,
    rawText: string,
    user: UserContext
  ): Promise<CommandExecutionResult> {
    const trimmed = rawText.trim();
    if (!trimmed.startsWith('/')) {
      throw new Error('Not a slash command');
    }

    const [cmdWithSlash, ...args] = trimmed.split(/\s+/);
    const cmd = cmdWithSlash.substring(1).toLowerCase();
    const argStr = args.join(' ').trim();

    switch (cmd) {
      case 'play':
      case 'p': {
        if (!argStr) {
          throw new Error('Usage: `/play <song-name-or-url>`');
        }
        return await this.play(serverId, argStr, user);
      }
      case 'pause':
        return this.pause(serverId);

      case 'resume':
        return this.resume(serverId);

      case 'skip':
      case 's':
        return await this.skip(serverId);

      case 'stop':
        return await this.stop(serverId);

      case 'queue':
      case 'q':
        return this.getQueue(serverId);

      case 'nowplaying':
      case 'np':
        return this.nowPlaying(serverId);

      case 'volume':
      case 'vol': {
        const num = parseInt(argStr, 10);
        if (isNaN(num)) {
          throw new Error('Usage: `/volume <0-100>`');
        }
        return this.setVolume(serverId, num);
      }

      case 'remove': {
        const pos = parseInt(argStr, 10);
        if (isNaN(pos) || pos < 1) {
          throw new Error('Usage: `/remove <queue-position>` (e.g. `/remove 2`)');
        }
        return this.removeTrack(serverId, pos);
      }

      case 'clearqueue':
      case 'clear':
        return this.clearQueue(serverId);

      case 'help':
        return {
          success: true,
          message: [
            '🎵 **NIGHTSHIFT Music Bot Commands:**',
            '• `/play <query|url>` — Play music from YouTube or SoundCloud',
            '• `/pause` — Pause current playback',
            '• `/resume` — Resume playback',
            '• `/skip` — Skip current track',
            '• `/stop` — Stop and clear session',
            '• `/queue` — View track queue',
            '• `/nowplaying` — View current track info',
            '• `/volume <0-100>` — Adjust bot volume',
            '• `/remove <number>` — Remove song from queue',
            '• `/clearqueue` — Clear upcoming songs',
          ].join('\n'),
          session: this.getSessionDto(serverId),
        };

      default:
        throw new Error(`Unknown command \`/${cmd}\`. Type \`/help\` for a list of music commands.`);
    }
  }

  private async notifyTrackStarted(serverId: string, track: MusicTrackDto): Promise<void> {
    // Post a message in the channel if possible
    const session = this.sessions.get(serverId);
    if (!session || !session.channelId) return;

    try {
      const channel = await prisma.channel.findFirst({
        where: { serverId, type: 'text' },
        orderBy: { order: 'asc' },
      });
      if (channel) {
        await prisma.message.create({
          data: {
            content: `🎶 **Now Playing:** **${track.title}** by ${track.artist} \`[${this.formatDuration(track.durationSeconds)}]\``,
            channelId: channel.id,
            userId: MUSIC_BOT_USER.id,
          },
        });
      }
    } catch {}
  }

  private async notifyTrackError(serverId: string, track: MusicTrackDto, error: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session || !session.channelId) return;

    try {
      const channel = await prisma.channel.findFirst({
        where: { serverId, type: 'text' },
        orderBy: { order: 'asc' },
      });
      if (channel) {
        await prisma.message.create({
          data: {
            content: `⚠️ Failed to play **${track.title}**: ${error}`,
            channelId: channel.id,
            userId: MUSIC_BOT_USER.id,
          },
        });
      }
    } catch {}
  }

  private formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  private generateProgressBar(current: number, total: number, barLength = 12): string {
    if (!total || total <= 0) return '▬'.repeat(barLength);
    const ratio = Math.min(1, Math.max(0, current / total));
    const filled = Math.round(ratio * barLength);
    const empty = barLength - filled;
    return '▬'.repeat(filled) + '🔘' + '▬'.repeat(empty);
  }
}

export const musicBotService = new MusicBotService();
