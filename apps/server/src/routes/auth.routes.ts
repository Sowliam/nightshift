import { FastifyPluginAsync } from 'fastify';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
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

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Magic bytes validation for genuine PNG and JPEG/JPG
function isValidAvatarMagicBytes(buffer: Buffer): { valid: boolean; ext: string; mime: string } {
  if (buffer.length < 8) return { valid: false, ext: '', mime: '' };

  // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, ext: '.png', mime: 'image/png' };
  }

  // JPEG / JPG magic number: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, ext: '.jpg', mime: 'image/jpeg' };
  }

  return { valid: false, ext: '', mime: '' };
}

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

  // Update display name (nickname) and avatar
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

    const dataToUpdate: any = {
      lastSeenAt: new Date(),
    };
    if (parseResult.data.displayName !== undefined) {
      dataToUpdate.displayName = parseResult.data.displayName.trim();
    }
    if (parseResult.data.avatarUrl !== undefined) {
      dataToUpdate.avatarUrl = parseResult.data.avatarUrl;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: dataToUpdate,
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

  // Upload avatar image (JPG, JPEG, PNG only)
  fastify.post('/api/auth/avatar', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No image file uploaded' });
    }

    const buffer = await data.toBuffer();

    // Verify magic bytes: strictly JPG, JPEG, and PNG
    const verification = isValidAvatarMagicBytes(buffer);
    if (!verification.valid) {
      return reply.status(400).send({
        error: 'Invalid file format: Only JPG, JPEG, and PNG images are allowed.',
      });
    }

    const fileName = `avatar_${user.id}_${nanoid(8)}${verification.ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    await fs.promises.writeFile(filePath, buffer);

    const publicUrl = `/uploads/${fileName}`;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl: publicUrl,
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

    return reply.status(200).send({ user: userDto, url: publicUrl });
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
