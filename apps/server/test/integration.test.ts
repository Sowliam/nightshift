import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';

describe('NIGHTSHIFT End-to-End Client Simulation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
  
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('Simulates complete user flow: register -> list servers -> join voice -> update profile', async () => {
    // 1. User registers account
    const username = `kian_${Date.now().toString(36)}`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username,
        displayName: 'Kian',
        password: 'Password123!',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const { user, token } = JSON.parse(regRes.body);
    expect(user.displayName).toBe('Kian');
    expect(token).toBeDefined();

    // 2. User creates a server
    const serverRes = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        name: 'Kian Realm',
      },
    });
    expect(serverRes.statusCode).toBe(201);
    const { server } = JSON.parse(serverRes.body);
    expect(server.name).toBe('Kian Realm');

    // 3. User lists channels for the server
    const channelsRes = await app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/channels`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(channelsRes.statusCode).toBe(200);
    const { channels } = JSON.parse(channelsRes.body);
    const voiceChannel = channels.find((c: any) => c.type === 'voice');
    expect(voiceChannel).toBeDefined();

    // 4. User joins voice channel and receives LiveKit token
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/channels/${voiceChannel.id}/join`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinData = JSON.parse(joinRes.body);
    expect(joinData.channel.id).toBe(voiceChannel.id);
    expect(joinData.livekitUrl).toBeDefined();
    expect(joinData.token).toBeDefined();

    // 5. User updates profile display name
    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {
        displayName: 'Kian Prime',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updatedUser = JSON.parse(updateRes.body).user;
    expect(updatedUser.displayName).toBe('Kian Prime');
  }, 30000);
});
