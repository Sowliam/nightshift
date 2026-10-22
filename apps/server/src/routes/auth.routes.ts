import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { RegisterUserSchema, UpdateProfileSchema, UserDto } from '@nightshift/shared';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register or restore user by deviceId
  fastify.post('/api/auth/register', async (request, reply) => {
    const parseResult = RegisterUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid registration input',
        details: parseResult.error.flatten(),
      });
    }

    const { displayName, deviceId } = parseResult.data;

    const user = await prisma.user.upsert({
      where: { deviceId },
      update: {
        displayName,
        lastSeenAt: new Date(),
      },
      create: {
        displayName,
        deviceId,
      },
    });

    const userDto: UserDto = {
      id: user.id,
      displayName: user.displayName,
      deviceId: user.deviceId,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
    };

    return reply.status(200).send({ user: userDto });
  });

  // Get current user by deviceId
  fastify.get('/api/auth/me', async (request, reply) => {
    const deviceId =
      (request.headers['x-device-id'] as string) ||
      (request.query as Record<string, string>)['deviceId'];

    if (!deviceId) {
      return reply.status(401).send({ error: 'Device ID required' });
    }

    const user = await prisma.user.findUnique({
      where: { deviceId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const userDto: UserDto = {
      id: user.id,
      displayName: user.displayName,
      deviceId: user.deviceId,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
    };

    return reply.status(200).send({ user: userDto });
  });

  // Update profile
  fastify.patch('/api/auth/profile', async (request, reply) => {
    const deviceId = request.headers['x-device-id'] as string;
    if (!deviceId) {
      return reply.status(401).send({ error: 'Device ID required' });
    }

    const parseResult = UpdateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid profile input',
        details: parseResult.error.flatten(),
      });
    }

    const user = await prisma.user.update({
      where: { deviceId },
      data: {
        displayName: parseResult.data.displayName,
        lastSeenAt: new Date(),
      },
    });

    const userDto: UserDto = {
      id: user.id,
      displayName: user.displayName,
      deviceId: user.deviceId,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
    };

    return reply.status(200).send({ user: userDto });
  });
};
