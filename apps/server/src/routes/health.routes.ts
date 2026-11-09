import { FastifyPluginAsync } from 'fastify';
import os from 'os';
import { prisma } from '../lib/prisma.js';
import {
  checkLiveKitHealth,
  getLiveKitPoolStatus,
  rotateLiveKitSlot,
  recheckLiveKitExhaustedSlots,
} from '../services/livekit.service.js';
import { APP_VERSION, APP_NAME } from '@nightshift/shared';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  const getHealthHandler = async () => {
    let dbStatus = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = true;
    } catch {
      dbStatus = false;
    }

    const livekitHealth = await checkLiveKitHealth();

    let lanIp = 'localhost';
    try {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            lanIp = net.address;
            break;
          }
        }
        if (lanIp !== 'localhost') break;
      }
    } catch {}

    return {
      name: APP_NAME,
      version: APP_VERSION,
      status: 'ok',
      timestamp: new Date().toISOString(),
      network: {
        lanIp,
        port: config.port,
      },
      services: {
        database: dbStatus ? 'healthy' : 'unhealthy',
        livekit: livekitHealth.reachable ? 'connected' : livekitHealth.configured ? 'unreachable' : 'unconfigured',
        livekitActiveSlot: livekitHealth.activeSlot,
        livekitTotalSlots: livekitHealth.totalSlots,
        livekitError: livekitHealth.error,
      },
      livekitPool: livekitHealth.pool,
    };
  };

  fastify.get('/api/health', getHealthHandler);
  fastify.get('/health', getHealthHandler);
  fastify.get('/', getHealthHandler);

  // LiveKit Pool Status & Rotation Endpoints
  fastify.get('/api/livekit/status', async (_request, reply) => {
    return reply.send(getLiveKitPoolStatus());
  });

  fastify.post('/api/livekit/rotate', async (request, reply) => {
    const body = (request.body as { reason?: string }) || {};
    const slot = await rotateLiveKitSlot(body.reason || 'Manual API trigger');
    return reply.send({ success: true, activeSlot: slot.slot, name: slot.name });
  });

  fastify.post('/api/livekit/recheck', async (_request, reply) => {
    await recheckLiveKitExhaustedSlots();
    return reply.send({ success: true, pool: getLiveKitPoolStatus() });
  });

  // Ultra-fast ping endpoint with Timing-Allow-Origin for real browser RTT measurement
  fastify.get('/api/ping', async (_request, reply) => {
    return reply
      .header('Timing-Allow-Origin', '*')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate')
      .send({ pong: true, time: Date.now() });
  });
};
