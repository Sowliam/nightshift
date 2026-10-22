import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { checkLiveKitHealth } from '../services/livekit.service.js';
import { APP_VERSION, APP_NAME } from '@nightshift/shared';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => {
    let dbStatus = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = true;
    } catch {
      dbStatus = false;
    }

    const livekitHealth = await checkLiveKitHealth();

    return {
      name: APP_NAME,
      version: APP_VERSION,
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus ? 'healthy' : 'unhealthy',
        livekit: livekitHealth.reachable ? 'connected' : livekitHealth.configured ? 'unreachable' : 'unconfigured',
        livekitError: livekitHealth.error,
      },
    };
  });
};
