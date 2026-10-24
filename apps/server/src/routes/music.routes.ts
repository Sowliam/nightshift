import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { musicBotService } from '../services/music/music-bot.service.js';
import {
  PlayMusicSchema,
  VolumeMusicSchema,
  RemoveQueueItemSchema,
  ConfigureBotSchema,
  MUSIC_BOT_USER,
} from '@nightshift/shared';

export const musicRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper to verify server membership and return role
  async function checkMembership(serverId: string, userId: string) {
    const member = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
    });
    return member;
  }

  // 1. Get Bot Configuration and Session State for a server
  fastify.get('/api/servers/:serverId/bot', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied: You are not a member of this server' });
    }

    try {
      const bot = await musicBotService.ensureBotRecord(serverId);
      return reply.status(200).send({ bot });
    } catch (err: any) {
      console.error('[musicRoutes] Failed to get bot record:', err);
      return reply.status(500).send({ error: err?.message || 'Failed to retrieve bot' });
    }
  });

  // 2. Configure Bot (Enable/Disable, default channel, default volume) - Admin/Owner only
  fastify.patch('/api/servers/:serverId/bot', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return reply.status(403).send({ error: 'Access denied: Only server owners and admins can configure bots' });
    }

    const parseResult = ConfigureBotSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid bot settings', details: parseResult.error.flatten() });
    }

    try {
      const updated = await musicBotService.updateBotSettings(serverId, parseResult.data);
      return reply.status(200).send({ bot: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message || 'Failed to update bot settings' });
    }
  });

  // 3. Get Current Music Session
  fastify.get('/api/servers/:serverId/music/session', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied: You are not a member of this server' });
    }

    const session = musicBotService.getSessionDto(serverId);
    return reply.status(200).send({ session });
  });

  // 4. Play Track (/play)
  fastify.post('/api/servers/:serverId/music/play', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied: You are not a member of this server' });
    }

    const parseResult = PlayMusicSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parseResult.error.flatten() });
    }

    try {
      const result = await musicBotService.play(
        serverId,
        parseResult.data.query,
        { id: user.id, displayName: user.displayName, username: user.username },
        parseResult.data.channelId
      );
      return reply.status(200).send(result);
    } catch (err: any) {
      console.error('[musicRoutes] Play error:', err);
      return reply.status(400).send({ error: err?.message || 'Failed to play track' });
    }
  });

  // 5. Pause Playback (/pause)
  fastify.post('/api/servers/:serverId/music/pause', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = musicBotService.pause(serverId);
    return reply.status(200).send(result);
  });

  // 6. Resume Playback (/resume)
  fastify.post('/api/servers/:serverId/music/resume', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = musicBotService.resume(serverId);
    return reply.status(200).send(result);
  });

  // 7. Skip Track (/skip)
  fastify.post('/api/servers/:serverId/music/skip', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = await musicBotService.skip(serverId);
    return reply.status(200).send(result);
  });

  // 8. Stop Playback (/stop)
  fastify.post('/api/servers/:serverId/music/stop', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = await musicBotService.stop(serverId);
    return reply.status(200).send(result);
  });

  // 9. Adjust Volume (/volume)
  fastify.post('/api/servers/:serverId/music/volume', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const parseResult = VolumeMusicSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Volume must be between 0 and 100' });
    }

    const result = musicBotService.setVolume(serverId, parseResult.data.volume);
    return reply.status(200).send(result);
  });

  // 10. Remove Track from Queue (/remove)
  fastify.post('/api/servers/:serverId/music/remove', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const parseResult = RemoveQueueItemSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid position' });
    }

    const result = musicBotService.removeTrack(serverId, parseResult.data.position);
    return reply.status(200).send(result);
  });

  // 11. Clear Queue (/clearqueue)
  fastify.post('/api/servers/:serverId/music/clear', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const result = musicBotService.clearQueue(serverId);
    return reply.status(200).send(result);
  });

  // 12. Generic Slash Command Handler (from chat or UI)
  fastify.post('/api/servers/:serverId/channels/:channelId/command', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId, channelId } = request.params as { serverId: string; channelId: string };
    const member = await checkMembership(serverId, user.id);
    if (!member) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const { command } = (request.body as { command: string }) || {};
    if (!command || !command.trim()) {
      return reply.status(400).send({ error: 'Command text required' });
    }

    try {
      const result = await musicBotService.executeSlashCommand(
        serverId,
        channelId,
        command,
        { id: user.id, displayName: user.displayName, username: user.username }
      );

      // Create bot response message in channel
      const botMsg = await prisma.message.create({
        data: {
          content: result.message,
          channelId,
          userId: MUSIC_BOT_USER.id,
        },
      });

      return reply.status(200).send({
        result,
        botMessage: {
          id: botMsg.id,
          content: botMsg.content,
          channelId: botMsg.channelId,
          userId: MUSIC_BOT_USER.id,
          username: MUSIC_BOT_USER.username,
          displayName: MUSIC_BOT_USER.displayName,
          avatarUrl: MUSIC_BOT_USER.avatarUrl,
          createdAt: botMsg.createdAt.toISOString(),
          isMine: false,
        },
      });
    } catch (err: any) {
      return reply.status(400).send({ error: err?.message || 'Command failed' });
    }
  });
};
