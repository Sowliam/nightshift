import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import {
  RegisterUserSchema,
  LoginUserSchema,
  UpdateProfileSchema,
  UserDto,
  AuthResponse,
} from '@nightshift/shared';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  requireAuth,
  getAuthenticatedUser,
} from '../lib/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register a new user
  fastify.post('/api/auth/register', async (request, reply) => {
    const parseResult = RegisterUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid registration input',
        details: parseResult.error.flatten(),
      });
    }

    const { username, displayName, password } = parseResult.data;
    const normalizedUsername = username.toLowerCase();

    // Check for existing username
    const existing = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (existing) {
      return reply.status(409).send({ error: 'This username is already taken. Please choose another.' });
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        displayName: displayName.trim(),
        passwordHash,
      },
    });

    const userDto: UserDto = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
      isOnline: true,
    };

    const token = generateToken(user.id, user.username);
    const response: AuthResponse = { user: userDto, token };

    return reply.status(201).send(response);
  });

  // Login existing user
  fastify.post('/api/auth/login', async (request, reply) => {
    const parseResult = LoginUserSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid login credentials format',
        details: parseResult.error.flatten(),
      });
    }

    const { username, password } = parseResult.data;
    const normalizedUsername = username.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    const isMatch = verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const userDto: UserDto = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: new Date().toISOString(),
      isOnline: true,
    };

    const token = generateToken(user.id, user.username);
    const response: AuthResponse = { user: userDto, token };

    return reply.status(200).send(response);
  });

  // Get currently logged-in user profile
  fastify.get('/api/auth/me', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    return reply.status(200).send({ user });
  });

  // Update display name (nickname)
  fastify.patch('/api/auth/profile', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parseResult = UpdateProfileSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid profile input',
        details: parseResult.error.flatten(),
      });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: parseResult.data.displayName.trim(),
        lastSeenAt: new Date(),
      },
    });

    const userDto: UserDto = {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      createdAt: updated.createdAt.toISOString(),
      lastSeenAt: updated.lastSeenAt.toISOString(),
      isOnline: true,
    };

    return reply.status(200).send({ user: userDto });
  });

  // Client presence heartbeat
  fastify.post('/api/auth/heartbeat', async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });
      return reply.status(200).send({ success: true });
    }
    return reply.status(200).send({ success: false });
  });
};
