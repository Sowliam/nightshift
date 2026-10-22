import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { nanoid } from 'nanoid';
import {
  CreateServerSchema,
  CreateChannelSchema,
  CreateInviteSchema,
  JoinInviteSchema,
  ModerateMemberSchema,
  ServerSummaryDto,
  ChannelDto,
  ServerMemberDto,
  ServerInviteDto,
  extractInviteCode,
} from '@nightshift/shared';
import { requireAuth } from '../lib/auth.js';
import { getLiveKitRoomParticipants } from '../services/livekit.service.js';

export const serversRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. List all servers current user belongs to
  fastify.get('/api/servers', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const memberships = await prisma.serverMember.findMany({
      where: { userId: user.id },
      include: {
        server: {
          include: {
            _count: {
              select: {
                channels: true,
                members: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const serverSummaries: ServerSummaryDto[] = memberships.map((m) => ({
      id: m.server.id,
      name: m.server.name,
      description: m.server.description,
      iconUrl: m.server.iconUrl,
      ownerId: m.server.ownerId,
      channelCount: m.server._count.channels,
      memberCount: m.server._count.members,
      role: m.role as 'owner' | 'admin' | 'member',
      createdAt: m.server.createdAt.toISOString(),
    }));

    return reply.status(200).send({ servers: serverSummaries });
  });

  // 2. Create a new server
  fastify.post('/api/servers', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parseResult = CreateServerSchema.safeParse(request.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || 'Invalid server details';
      return reply.status(400).send({
        error: firstError,
        details: parseResult.error.flatten(),
      });
    }

    const { name, description } = parseResult.data;

    // Create server with creator as owner and initial channels
    const server = await prisma.server.create({
      data: {
        name,
        description,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
        channels: {
          create: [
            {
              name: 'general',
              type: 'text',
              order: 0,
            },
            {
              name: 'Lounge',
              type: 'voice',
              order: 1,
            },
          ],
        },
      },
      include: {
        channels: true,
        _count: {
          select: { members: true, channels: true },
        },
      },
    });

    const summary: ServerSummaryDto = {
      id: server.id,
      name: server.name,
      description: server.description,
      iconUrl: server.iconUrl,
      ownerId: server.ownerId,
      channelCount: server._count.channels,
      memberCount: server._count.members,
      role: 'owner',
      createdAt: server.createdAt.toISOString(),
    };

    return reply.status(201).send({ server: summary, channels: server.channels });
  });

  // 3. Delete server (Owner only)
  fastify.delete('/api/servers/:serverId', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const server = await prisma.server.findUnique({ where: { id: serverId } });

    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    if (server.ownerId !== user.id) {
      return reply.status(403).send({ error: 'Only the server owner can delete this server' });
    }

    await prisma.server.delete({ where: { id: serverId } });
    return reply.status(200).send({ success: true, message: 'Server deleted successfully' });
  });

  // 4. Leave server
  fastify.post('/api/servers/:serverId/leave', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership) {
      return reply.status(404).send({ error: 'You are not a member of this server' });
    }

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (server?.ownerId === user.id) {
      // Find next candidate for owner
      const nextMember = await prisma.serverMember.findFirst({
        where: { serverId, userId: { not: user.id } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      });

      if (nextMember) {
        await prisma.server.update({
          where: { id: serverId },
          data: { ownerId: nextMember.userId },
        });
        await prisma.serverMember.update({
          where: { id: nextMember.id },
          data: { role: 'owner' },
        });
      } else {
        // No other members, delete the server
        await prisma.server.delete({ where: { id: serverId } });
        return reply.status(200).send({ success: true, message: 'Server deleted as you were the sole member' });
      }
    }

    await prisma.serverMember.delete({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    return reply.status(200).send({ success: true });
  });

  // 5. Get channels for server
  fastify.get('/api/servers/:serverId/channels', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };

    const isMember = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });
    if (!isMember) {
      return reply.status(403).send({ error: 'Access denied: You must be a member of this server' });
    }

    const channels = await prisma.channel.findMany({
      where: { serverId },
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });

    const channelDtos: ChannelDto[] = await Promise.all(
      channels.map(async (c) => {
        let participantCount = 0;
        if (c.type === 'voice') {
          const roomKey = `${serverId}_${c.id}`;
          const parts = await getLiveKitRoomParticipants(roomKey);
          participantCount = parts.length;
        }
        return {
          id: c.id,
          serverId: c.serverId,
          name: c.name,
          type: c.type as 'text' | 'voice',
          order: c.order,
          createdAt: c.createdAt.toISOString(),
          participantCount,
        };
      })
    );

    return reply.status(200).send({ channels: channelDtos });
  });

  // 6. Create channel in server
  fastify.post('/api/servers/:serverId/channels', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return reply.status(403).send({ error: 'Permission denied: Administrator rights required to create channels' });
    }

    const parseResult = CreateChannelSchema.safeParse(request.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || 'Invalid channel details';
      return reply.status(400).send({
        error: firstError,
        details: parseResult.error.flatten(),
      });
    }

    const { name, type } = parseResult.data;
    const cleanName = type === 'text' ? name.toLowerCase().replace(/\s+/g, '-') : name.trim();

    const channel = await prisma.channel.create({
      data: {
        serverId,
        name: cleanName,
        type,
      },
    });

    const channelDto: ChannelDto = {
      id: channel.id,
      serverId: channel.serverId,
      name: channel.name,
      type: channel.type as 'text' | 'voice',
      order: channel.order,
      createdAt: channel.createdAt.toISOString(),
      participantCount: 0,
    };

    return reply.status(201).send({ channel: channelDto });
  });

  // 7. Delete channel in server
  fastify.delete('/api/servers/:serverId/channels/:channelId', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId, channelId } = request.params as { serverId: string; channelId: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return reply.status(403).send({ error: 'Permission denied: Administrator rights required to delete channels' });
    }

    await prisma.channel.delete({ where: { id: channelId } });
    return reply.status(200).send({ success: true });
  });

  // 8. List real server members
  fastify.get('/api/servers/:serverId/members', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };

    const isMember = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });
    if (!isMember) {
      return reply.status(403).send({ error: 'Access denied: Must be a member to view server members' });
    }

    const members = await prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: true,
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const threshold = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes presence threshold

    const memberDtos: ServerMemberDto[] = members.map((m) => {
      const isOnline = m.user.lastSeenAt >= threshold;
      return {
        id: m.id,
        serverId: m.serverId,
        userId: m.userId,
        username: m.user.username,
        displayName: m.user.displayName,
        role: m.role as 'owner' | 'admin' | 'member',
        isServerMuted: m.isServerMuted,
        isServerDeafened: m.isServerDeafened,
        isOnline,
        joinedAt: m.joinedAt.toISOString(),
      };
    });

    return reply.status(200).send({ members: memberDtos });
  });

  // 9. Member moderation (Server Mute, Server Deafen, Kick, Ban)
  fastify.post('/api/servers/:serverId/members/:targetUserId/moderate', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId, targetUserId } = request.params as { serverId: string; targetUserId: string };

    const parseResult = ModerateMemberSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid moderation action',
        details: parseResult.error.flatten(),
      });
    }

    const { action, reason } = parseResult.data;

    const actorMembership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!actorMembership || (actorMembership.role !== 'owner' && actorMembership.role !== 'admin')) {
      return reply.status(403).send({ error: 'Permission denied: Moderation rights required' });
    }

    if (action === 'unban') {
      await prisma.serverBan.deleteMany({
        where: { serverId, userId: targetUserId },
      });
      return reply.status(200).send({ success: true, message: 'User unbanned' });
    }

    const targetMembership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: targetUserId } },
    });

    if (!targetMembership) {
      return reply.status(404).send({ error: 'Target member not found in this server' });
    }

    // Role hierarchy: Admin cannot moderate owner or another admin
    if (actorMembership.role !== 'owner' && targetMembership.role !== 'member') {
      return reply.status(403).send({ error: 'Cannot moderate a member with equal or higher permissions' });
    }

    if (action === 'mute') {
      await prisma.serverMember.update({
        where: { id: targetMembership.id },
        data: { isServerMuted: true },
      });
      return reply.status(200).send({ success: true, message: 'Member server-muted' });
    }

    if (action === 'unmute') {
      await prisma.serverMember.update({
        where: { id: targetMembership.id },
        data: { isServerMuted: false },
      });
      return reply.status(200).send({ success: true, message: 'Member server-unmuted' });
    }

    if (action === 'deafen') {
      await prisma.serverMember.update({
        where: { id: targetMembership.id },
        data: { isServerDeafened: true },
      });
      return reply.status(200).send({ success: true, message: 'Member server-deafened' });
    }

    if (action === 'undeafen') {
      await prisma.serverMember.update({
        where: { id: targetMembership.id },
        data: { isServerDeafened: false },
      });
      return reply.status(200).send({ success: true, message: 'Member server-undeafened' });
    }

    if (action === 'kick') {
      await prisma.serverMember.delete({
        where: { id: targetMembership.id },
      });
      return reply.status(200).send({ success: true, message: 'Member kicked from server' });
    }

    if (action === 'ban') {
      await prisma.$transaction([
        prisma.serverBan.upsert({
          where: { serverId_userId: { serverId, userId: targetUserId } },
          create: {
            serverId,
            userId: targetUserId,
            reason: reason || 'Banned by server administrator',
            bannedBy: user.id,
          },
          update: {
            reason: reason || 'Banned by server administrator',
            bannedBy: user.id,
          },
        }),
        prisma.serverMember.delete({
          where: { id: targetMembership.id },
        }),
      ]);
      return reply.status(200).send({ success: true, message: 'Member banned from server' });
    }

    return reply.status(400).send({ error: 'Unknown moderation action' });
  });

  // 10. Create invite code for server
  fastify.post('/api/servers/:serverId/invites', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership) {
      return reply.status(403).send({ error: 'Must be a member to create an invite' });
    }

    const parseResult = CreateInviteSchema.safeParse(request.body);
    const maxUses = parseResult.success ? parseResult.data.maxUses : 0;
    const expiresInHours = parseResult.success ? parseResult.data.expiresInHours : 72;
    // 0 means never expires (expiresAt = null)
    const expiresAt = (expiresInHours > 0)
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    const code = nanoid(8);

    const invite = await prisma.serverInvite.create({
      data: {
        code,
        serverId,
        creatorId: user.id,
        maxUses,
        expiresAt,
      },
      include: {
        server: true,
        creator: true,
      },
    });

    const inviteDto: ServerInviteDto = {
      id: invite.id,
      code: invite.code,
      serverId: invite.serverId,
      serverName: invite.server.name,
      creatorId: invite.creatorId,
      creatorName: invite.creator.displayName,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
      isValid: invite.isValid,
      createdAt: invite.createdAt.toISOString(),
    };

    return reply.status(201).send({ invite: inviteDto });
  });

  // 11. List active invites for server
  fastify.get('/api/servers/:serverId/invites', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params as { serverId: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership) {
      return reply.status(403).send({ error: 'Must be a member to view invites' });
    }

    const invites = await prisma.serverInvite.findMany({
      where: { serverId, isValid: true },
      include: { server: true, creator: true },
      orderBy: { createdAt: 'desc' },
    });

    const inviteDtos: ServerInviteDto[] = invites.map((inv) => ({
      id: inv.id,
      code: inv.code,
      serverId: inv.serverId,
      serverName: inv.server.name,
      creatorId: inv.creatorId,
      creatorName: inv.creator.displayName,
      maxUses: inv.maxUses,
      usesCount: inv.usesCount,
      expiresAt: inv.expiresAt ? inv.expiresAt.toISOString() : null,
      isValid: inv.isValid,
      createdAt: inv.createdAt.toISOString(),
    }));

    return reply.status(200).send({ invites: inviteDtos });
  });

  // 12. Revoke invite code
  fastify.delete('/api/servers/:serverId/invites/:code', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId, code } = request.params as { serverId: string; code: string };
    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId: user.id } },
    });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return reply.status(403).send({ error: 'Permission denied: Administrator rights required to revoke invites' });
    }

    await prisma.serverInvite.update({
      where: { code },
      data: { isValid: false },
    });

    return reply.status(200).send({ success: true });
  });

  // 13. Join a server using an invite code
  fastify.post('/api/invites/join', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parseResult = JoinInviteSchema.safeParse(request.body);
    if (!parseResult.success) {
      const fieldErrors = parseResult.error.flatten().fieldErrors;
      const firstError = Object.values(fieldErrors).flat()[0] || 'Invalid invite code format';
      return reply.status(400).send({
        error: firstError,
        details: parseResult.error.flatten(),
      });
    }

    const rawCode = parseResult.data.code;
    const code = extractInviteCode(rawCode);

    const invite = await prisma.serverInvite.findUnique({
      where: { code },
      include: { server: true },
    });

    if (!invite || !invite.isValid) {
      return reply.status(404).send({ error: 'This invitation code is invalid or has been revoked.' });
    }

    // Check expiration
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return reply.status(410).send({ error: 'This invitation has expired.' });
    }

    // Check max uses
    if (invite.maxUses > 0 && invite.usesCount >= invite.maxUses) {
      return reply.status(410).send({ error: 'This invitation has reached its maximum number of uses.' });
    }

    // Check ban list
    const isBanned = await prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId: user.id } },
    });

    if (isBanned) {
      return reply.status(403).send({
        error: `You are banned from ${invite.server.name}. Reason: ${isBanned.reason || 'No reason provided'}`,
      });
    }

    // Check if already a member
    const existingMember = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: invite.serverId, userId: user.id } },
    });

    if (!existingMember) {
      await prisma.$transaction([
        prisma.serverMember.create({
          data: {
            serverId: invite.serverId,
            userId: user.id,
            role: 'member',
          },
        }),
        prisma.serverInvite.update({
          where: { id: invite.id },
          data: { usesCount: { increment: 1 } },
        }),
      ]);
    }

    const serverSummary: ServerSummaryDto = {
      id: invite.server.id,
      name: invite.server.name,
      description: invite.server.description,
      iconUrl: invite.server.iconUrl,
      ownerId: invite.server.ownerId,
      channelCount: 0,
      memberCount: 0,
      role: 'member',
      createdAt: invite.server.createdAt.toISOString(),
    };

    return reply.status(200).send({ server: serverSummary });
  });
};
