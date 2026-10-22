import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
  CreateInvitationSchema,
  ValidateInvitationSchema,
  InvitationDto,
} from '@nightshift/shared';
import { nanoid } from 'nanoid';

export const invitationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Create an invitation
  fastify.post('/api/invitations', async (request, reply) => {
    const parseResult = CreateInvitationSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid invitation payload',
        details: parseResult.error.flatten(),
      });
    }

    const { roomId, maxUses, expiresInHours } = parseResult.data;
    const deviceId = request.headers['x-device-id'] as string;

    let createdByUserId = 'system';
    if (deviceId) {
      const user = await prisma.user.findUnique({ where: { deviceId } });
      if (user) createdByUserId = user.id;
    }

    const code = nanoid(8);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const invite = await prisma.invitation.create({
      data: {
        code,
        roomId: roomId || null,
        createdByUserId,
        maxUses,
        usesCount: 0,
        isValid: true,
        expiresAt,
      },
    });

    const inviteDto: InvitationDto = {
      id: invite.id,
      code: invite.code,
      roomId: invite.roomId,
      createdByUserId: invite.createdByUserId,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      isValid: invite.isValid,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };

    return reply.status(201).send({ invitation: inviteDto });
  });

  // Validate invitation
  fastify.get('/api/invitations/:code/validate', async (request, reply) => {
    const { code } = request.params as { code: string };

    const parseResult = ValidateInvitationSchema.safeParse({ code });
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Malformed invitation code' });
    }

    const invite = await prisma.invitation.findUnique({
      where: { code },
    });

    if (!invite) {
      return reply.status(404).send({ valid: false, reason: 'Invitation not found' });
    }

    if (!invite.isValid) {
      return reply.status(410).send({ valid: false, reason: 'Invitation has been revoked' });
    }

    if (new Date() > invite.expiresAt) {
      return reply.status(410).send({ valid: false, reason: 'Invitation has expired' });
    }

    if (invite.usesCount >= invite.maxUses) {
      return reply.status(410).send({ valid: false, reason: 'Maximum uses reached' });
    }

    let room = null;
    if (invite.roomId) {
      room = await prisma.room.findUnique({ where: { id: invite.roomId } });
    }

    return reply.status(200).send({
      valid: true,
      code: invite.code,
      roomId: invite.roomId,
      roomName: room?.name,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });

  // Claim/use an invitation
  fastify.post('/api/invitations/:code/claim', async (request, reply) => {
    const { code } = request.params as { code: string };

    const invite = await prisma.invitation.findUnique({
      where: { code },
    });

    if (!invite || !invite.isValid || new Date() > invite.expiresAt || invite.usesCount >= invite.maxUses) {
      return reply.status(400).send({ error: 'Invitation is not valid or has expired' });
    }

    const updated = await prisma.invitation.update({
      where: { id: invite.id },
      data: {
        usesCount: { increment: 1 },
      },
    });

    return reply.status(200).send({
      success: true,
      code: updated.code,
      usesCount: updated.usesCount,
      maxUses: updated.maxUses,
    });
  });
};
