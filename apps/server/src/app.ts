import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { roomsRoutes } from './routes/rooms.routes.js';
import { invitationsRoutes } from './routes/invitations.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: true, // Allow desktop app and local dev
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Register API routes
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(roomsRoutes);
  await app.register(invitationsRoutes);

  return app;
}
