import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
  VoiceJoinResponse,
  ChannelDto,
  ServerSummaryDto,
  UserDto,
} from '@nightshift/shared';
import {
  generateLiveKitToken,
  invalidateRoomParticipantCache,
  removeLiveKitParticipant,
} from '../services/livekit.service.js';
import { enterVoice, getVoice, leaveVoice, listVoice } from '../services/voice-presence.js';
import { config } from '../config.js';
import { requireAuth } from '../lib/auth.js';

export const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  // Join voice channel and issue short-lived LiveKit token
  fastify.post('/api/channels/:channelId/join', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params as { channelId: string };

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        server: {
          include: {
            _count: {
              select: { channels: true, members: true },
            },
          },
        },
      },
    });

    if (!channel) {
      return reply.status(404).send({ error: 'Voice channel not found' });
    }

    if (channel.type !== 'voice') {
      return reply.status(400).send({ error: 'The requested channel is not a voice channel' });
    }

    // Verify membership
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId: user.id } },
    });

    if (!membership) {
      return reply.status(403).send({ error: 'You must be a member of this server to join voice' });
    }

    // Check if banned
    const isBanned = await prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId: user.id } },
    });

    if (isBanned) {
      return reply.status(403).send({ error: 'You are banned from this server' });
    }

    // Drop the previous seat in the background. The client already leaves the
    // old room locally, so the move does not wait on every other channel.
    const previous = getVoice(user.id);
    if (previous && previous.channelId !== channel.id) {
      const previousKey = `ns_${previous.serverId}_${previous.channelId}`;
      void removeLiveKitParticipant(previousKey, user.id).catch(() => {});
    }

    // LiveKit room key
    const roomKey = `ns_${channel.serverId}_${channel.id}`;

    let token: string;
    let livekitUrl: string;
    try {
      const result = await generateLiveKitToken(roomKey, user.id, user.displayName);
      token = result.token;
      livekitUrl = result.livekitUrl;
      enterVoice({
        identity: user.id,
        name: user.displayName || user.username,
        channelId: channel.id,
        serverId: channel.serverId,
      });
      invalidateRoomParticipantCache(roomKey);
    } catch (err: any) {
      console.error('Failed to generate LiveKit token:', err);
      return reply.status(500).send({
        error: 'LiveKit server error',
        details: err?.message,
      });
    }

    const participants = listVoice(channel.id);

    const channelDto: ChannelDto = {
      id: channel.id,
      serverId: channel.serverId,
      name: channel.name,
      type: 'voice',
      order: channel.order,
      createdAt: channel.createdAt.toISOString(),
      participantCount: participants.length,
    };

    const serverDto: ServerSummaryDto = {
      id: channel.server.id,
      name: channel.server.name,
      description: channel.server.description,
      iconUrl: channel.server.iconUrl,
      ownerId: channel.server.ownerId,
      channelCount: channel.server._count.channels,
      memberCount: channel.server._count.members,
      role: membership.role as 'owner' | 'admin' | 'member',
      createdAt: channel.server.createdAt.toISOString(),
    };

    const userDto: UserDto = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      isOnline: true,
    };

    const response: VoiceJoinResponse = {
      channel: channelDto,
      server: serverDto,
      livekitUrl,
      token,
      user: userDto,
    };

    return reply.status(200).send(response);
  });

  // Explicit leave endpoint to purge participant from LiveKit immediately
  fastify.post('/api/channels/:channelId/leave', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params as { channelId: string };
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    const seat = getVoice(user.id);
    if (!seat || seat.channelId === channelId) {
      leaveVoice(user.id);
    }
    if (channel) {
      const roomKey = `ns_${channel.serverId}_${channel.id}`;
      await removeLiveKitParticipant(roomKey, user.id);
      invalidateRoomParticipantCache(roomKey);
    }

    return reply.status(200).send({ success: true });
  });
};
