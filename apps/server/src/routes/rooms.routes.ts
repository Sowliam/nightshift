import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
  CreateRoomSchema,
  JoinRoomSchema,
  RoomDto,
  JoinRoomResponse,
  UserDto,
} from '@nightshift/shared';
import {
  generateLiveKitToken,
  getLiveKitRoomParticipantsCount,
} from '../services/livekit.service.js';
import { config } from '../config.js';

export const roomsRoutes: FastifyPluginAsync = async (fastify) => {
  // List all rooms with active participant counts
  fastify.get('/api/rooms', async (_request, reply) => {
    const rooms = await prisma.room.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const roomDtos: RoomDto[] = await Promise.all(
      rooms.map(async (r) => {
        const participantCount = await getLiveKitRoomParticipantsCount(r.name);
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          isDefault: r.isDefault,
          participantCount,
          createdAt: r.createdAt.toISOString(),
        };
      })
    );

    return reply.status(200).send({ rooms: roomDtos });
  });

  // Get single room by ID
  fastify.get('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    const participantCount = await getLiveKitRoomParticipantsCount(room.name);
    const roomDto: RoomDto = {
      id: room.id,
      name: room.name,
      description: room.description,
      isDefault: room.isDefault,
      participantCount,
      createdAt: room.createdAt.toISOString(),
    };

    return reply.status(200).send({ room: roomDto });
  });

  // Create room
  fastify.post('/api/rooms', async (request, reply) => {
    const parseResult = CreateRoomSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid room creation data',
        details: parseResult.error.flatten(),
      });
    }

    const { name, description } = parseResult.data;

    const existing = await prisma.room.findUnique({
      where: { name },
    });

    if (existing) {
      return reply.status(409).send({ error: 'A room with this name already exists' });
    }

    const room = await prisma.room.create({
      data: {
        name,
        description,
        isDefault: false,
      },
    });

    const roomDto: RoomDto = {
      id: room.id,
      name: room.name,
      description: room.description,
      isDefault: room.isDefault,
      participantCount: 0,
      createdAt: room.createdAt.toISOString(),
    };

    return reply.status(201).send({ room: roomDto });
  });

  // Join room and issue short-lived LiveKit access token
  fastify.post('/api/rooms/:id/join', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = JoinRoomSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid join request',
        details: parseResult.error.flatten(),
      });
    }

    const { userId } = parseResult.data;

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not registered. Please register first.' });
    }

    // Verify room exists
    const room = await prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    // Generate real LiveKit JWT token
    let token: string;
    try {
      token = await generateLiveKitToken(room.name, user.id, user.displayName);
    } catch (err: any) {
      request.log.error(err, 'Failed to generate LiveKit access token');
      return reply.status(500).send({
        error: 'Failed to generate room media token. Ensure LiveKit is configured.',
        details: err?.message,
      });
    }

    const participantCount = await getLiveKitRoomParticipantsCount(room.name);

    const userDto: UserDto = {
      id: user.id,
      displayName: user.displayName,
      deviceId: user.deviceId,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
    };

    const roomDto: RoomDto = {
      id: room.id,
      name: room.name,
      description: room.description,
      isDefault: room.isDefault,
      participantCount,
      createdAt: room.createdAt.toISOString(),
    };

    const response: JoinRoomResponse = {
      room: roomDto,
      livekitUrl: config.livekit.url,
      token,
      user: userDto,
    };

    return reply.status(200).send(response);
  });
};
