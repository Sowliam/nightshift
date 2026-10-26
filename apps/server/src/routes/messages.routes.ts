import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { SendMessageSchema, MessageDto } from '@nightshift/shared';
import { requireAuth } from '../lib/auth.js';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';

// Ensure uploads directory exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Magic bytes validation for PNG and JPEG
function isValidImageMagicBytes(buffer: Buffer): { valid: boolean; ext: string; mime: string } {
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

async function removeLocalUploadIfUnused(url: string | null) {
  if (!url || !url.startsWith('/uploads/') || url.includes('..')) return;

  const fileName = path.basename(url);
  if (!fileName || fileName === '.' || fileName === '..') return;

  const [stillAttached, usedAsAvatar] = await Promise.all([
    prisma.message.count({ where: { attachmentUrl: url } }),
    prisma.user.count({ where: { avatarUrl: url } }),
  ]);
  if (stillAttached > 0 || usedAsAvatar > 0) return;

  const filePath = path.resolve(UPLOADS_DIR, fileName);
  const relative = path.relative(UPLOADS_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;

  await fs.promises.unlink(filePath).catch(() => undefined);
}

export const messagesRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Get messages for a channel
  fastify.get('/api/channels/:channelId/messages', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params as { channelId: string };

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    // Verify user is a member of the server
    const isMember = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId: user.id } },
    });

    if (!isMember) {
      return reply.status(403).send({ error: 'Access denied: Must be a member of this server' });
    }

    const messages = await prisma.message.findMany({
      where: { channelId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const messageDtos: MessageDto[] = messages.map((m) => ({
      id: m.id,
      content: m.content,
      channelId: m.channelId,
      userId: m.userId,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      attachmentUrl: m.attachmentUrl,
      attachmentType: m.attachmentType,
      createdAt: m.createdAt.toISOString(),
      isMine: m.userId === user.id,
    }));

    return reply.status(200).send({ messages: messageDtos });
  });

  // 2. Post a message to a channel
  fastify.post('/api/channels/:channelId/messages', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params as { channelId: string };

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const isMember = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId: channel.serverId, userId: user.id } },
    });

    if (!isMember) {
      return reply.status(403).send({ error: 'Access denied: Must be a member of this server' });
    }

    const parseResult = SendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid message data',
        details: parseResult.error.flatten(),
      });
    }

    const { content, attachmentUrl, attachmentType } = parseResult.data;

    const message = await prisma.message.create({
      data: {
        content: content || '',
        channelId,
        userId: user.id,
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
      },
      include: {
        user: true,
      },
    });

    const messageDto: MessageDto = {
      id: message.id,
      content: message.content,
      channelId: message.channelId,
      userId: message.userId,
      username: message.user.username,
      displayName: message.user.displayName,
      avatarUrl: message.user.avatarUrl,
      attachmentUrl: message.attachmentUrl,
      attachmentType: message.attachmentType,
      createdAt: message.createdAt.toISOString(),
      isMine: true,
    };

    return reply.status(201).send({ message: messageDto });
  });

  // 3. Delete a text-channel message. Only the server owner may do this.
  fastify.delete('/api/channels/:channelId/messages/:messageId', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId, messageId } = request.params as { channelId: string; messageId: string };

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { server: true },
    });

    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (channel.type !== 'text') {
      return reply.status(400).send({ error: 'Only text channel messages can be deleted' });
    }

    if (channel.server.ownerId !== user.id) {
      return reply.status(403).send({ error: 'Only the server owner can delete messages' });
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, channelId },
    });

    if (!message) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    await prisma.message.delete({ where: { id: message.id } });
    await removeLocalUploadIfUnused(message.attachmentUrl);

    return reply.status(200).send({ success: true, messageId: message.id });
  });

  // 4. Strict Image Upload (JPEG, JPG, PNG with Magic Bytes validation & 5MB size limit)
  fastify.post('/api/upload', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const data = await request.file({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    });

    if (!data) {
      return reply.status(400).send({ error: 'No image file uploaded' });
    }

    const buffer = await data.toBuffer();

    // Verify magic bytes
    const verification = isValidImageMagicBytes(buffer);
    if (!verification.valid) {
      return reply.status(400).send({
        error: 'Invalid file format: Only legitimate JPEG, JPG, and PNG images are supported. File content failed signature check.',
      });
    }

    const fileName = `${nanoid(16)}${verification.ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    await fs.promises.writeFile(filePath, buffer);

    const publicUrl = `/uploads/${fileName}`;

    return reply.status(201).send({
      url: publicUrl,
      filename: fileName,
      type: verification.mime,
      size: buffer.length,
    });
  });
};
