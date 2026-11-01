import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { r2Service } from '../services/r2.service.js';
import { requireAuth } from '../lib/auth.js';
import fs from 'fs';
import path from 'path';

export const soundsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Get Cloudflare R2 / Cloud Storage Status
  fastify.get('/api/sounds/status', async (_request, reply) => {
    return reply.send({
      r2Configured: r2Service.isConfigured(),
      bucket: r2Service.getBucketName(),
      provider: r2Service.isConfigured() ? 'Cloud Storage (S3/R2)' : 'Local Fallback',
    });
  });

  // 2. List all Cloud Sounds
  fastify.get('/api/sounds', async (request, reply) => {
    const { category, search } = request.query as { category?: string; search?: string };

    const where: any = {};
    if (category && category !== 'All') {
      where.category = category;
    }
    if (search && search.trim()) {
      where.name = { contains: search.trim() };
    }

    const sounds = await prisma.soundItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return reply.send(sounds);
  });

  // 3. Upload a sound to Cloudflare R2
  fastify.post('/api/sounds/upload', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No audio file provided' });
    }

    const buffer = await data.toBuffer();
    if (buffer.length > 40 * 1024 * 1024) {
      return reply.status(400).send({ error: 'Audio file is too large (maximum 40MB)' });
    }

    const customName = (data.fields.name as any)?.value || data.filename.replace(/\.[^/.]+$/, '');
    const category = (data.fields.category as any)?.value || 'General';
    const duration = parseFloat((data.fields.duration as any)?.value || '0');

    let audioUrl = '';
    let storageKey = '';
    let uploadedToCloud = false;

    if (r2Service.isConfigured()) {
      // Try upload directly to Cloudflare R2
      try {
        const uploadRes = await r2Service.uploadAudio(data.filename, buffer, data.mimetype);
        storageKey = uploadRes.key;
        audioUrl = uploadRes.url;
        uploadedToCloud = true;
      } catch (err: any) {
        request.log.warn(err, `[Sounds Upload] Cloudflare R2 upload encountered error, falling back to local disk: ${err.message}`);
      }
    }

    if (!uploadedToCloud) {
      // Local disk fallback when R2 credentials are not added or temporary cloud error occurs
      const uploadsDir = path.resolve(process.cwd(), 'uploads', 'sounds');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = data.filename.split('.').pop() || 'mp3';
      storageKey = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = path.join(uploadsDir, storageKey);
      await fs.promises.writeFile(filePath, buffer);

      audioUrl = `/uploads/sounds/${storageKey}`;
    }

    // Save record in database
    const soundRecord = await prisma.soundItem.create({
      data: {
        name: customName,
        category,
        storageKey,
        audioUrl,
        duration: isNaN(duration) ? 0 : duration,
        sizeBytes: buffer.length,
        uploaderId: user.id,
        uploaderName: user.displayName || user.username,
      },
    });

    return reply.status(201).send(soundRecord);
  });

  // 4. Delete sound from Cloudflare R2 and database
  fastify.delete('/api/sounds/:id', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    const sound = await prisma.soundItem.findUnique({
      where: { id },
    });

    if (!sound) {
      return reply.status(404).send({ error: 'Sound not found' });
    }

    // Delete from Cloudflare R2 if it was stored there
    if (r2Service.isConfigured() && !sound.storageKey.startsWith('local_')) {
      await r2Service.deleteAudio(sound.storageKey);
    } else if (sound.storageKey.startsWith('local_')) {
      const localPath = path.resolve(process.cwd(), 'uploads', 'sounds', sound.storageKey);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }

    await prisma.soundItem.delete({
      where: { id },
    });

    return reply.send({ success: true, message: 'Sound deleted successfully' });
  });

  // 5. Proxy/stream audio from Cloudflare R2 or local uploads (handles single keys and sub-paths with wildcards)
  const streamHandler = async (request: any, reply: any) => {
    const rawKey = request.params['*'] || request.params.key || '';
    const decodedKey = decodeURIComponent(rawKey).replace(/^\/+/, '');

    if (!decodedKey) {
      return reply.status(400).send({ error: 'Missing audio key' });
    }

    // 1. First check if it's stored in Cloudflare R2
    if (r2Service.isConfigured()) {
      try {
        const s3Res = await r2Service.getAudioStream(decodedKey);
        if (s3Res.Body) {
          reply.header('Content-Type', s3Res.ContentType || 'audio/mpeg');
          reply.header('Accept-Ranges', 'bytes');
          if (s3Res.ContentLength) {
            reply.header('Content-Length', s3Res.ContentLength);
          }
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          return reply.send(s3Res.Body as any);
        }
      } catch (err: any) {
        request.log.warn(err, `R2 streaming lookup for "${decodedKey}" not found, checking local storage fallback...`);
      }
    }

    // 2. Check local uploads directory fallback (e.g. uploads/sounds/)
    const cleanBasename = path.basename(decodedKey);
    const possiblePaths = [
      path.resolve(process.cwd(), 'uploads', 'sounds', cleanBasename),
      path.resolve(process.cwd(), 'uploads', 'sounds', decodedKey),
      path.resolve(process.cwd(), 'uploads', cleanBasename),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const stat = fs.statSync(p);
          reply.header('Content-Type', 'audio/mpeg');
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Length', stat.size);
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
          return reply.send(fs.createReadStream(p));
        } catch (streamErr) {
          request.log.error(streamErr, `Failed to stream file from ${p}`);
        }
      }
    }

    return reply.status(404).send({ error: `Audio file "${decodedKey}" not found in cloud storage or local disk` });
  };

  fastify.get('/api/sounds/stream/:key', streamHandler);
  fastify.get('/api/sounds/stream/*', streamHandler);
};
