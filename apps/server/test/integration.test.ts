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

  it('Simulates complete user flow: register -> list rooms -> join room -> invite friend -> validate invite', async () => {
    // 1. User registers device
    const deviceId = `sim-device-${Date.now()}`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'Kian',
        deviceId,
      },
    });
    expect(regRes.statusCode).toBe(200);
    const { user } = JSON.parse(regRes.body);
    expect(user.displayName).toBe('Kian');

    // 2. User lists rooms
    const roomsRes = await app.inject({
      method: 'GET',
      url: '/api/rooms',
    });
    expect(roomsRes.statusCode).toBe(200);
    const { rooms } = JSON.parse(roomsRes.body);
    expect(rooms.length).toBeGreaterThanOrEqual(4);
    const targetRoom = rooms[0];

    // 3. User joins room and receives LiveKit token
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/rooms/${targetRoom.id}/join`,
      payload: {
        userId: user.id,
      },
    });
    expect(joinRes.statusCode).toBe(200);
    const joinData = JSON.parse(joinRes.body);
    expect(joinData.room.name).toBe(targetRoom.name);
    expect(joinData.livekitUrl).toContain('livekit.cloud');
    expect(joinData.token).toBeDefined();

    // 4. User generates an invitation link
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/invitations',
      headers: {
        'x-device-id': deviceId,
      },
      payload: {
        roomId: targetRoom.id,
        maxUses: 10,
        expiresInHours: 48,
      },
    });
    expect(inviteRes.statusCode).toBe(201);
    const { invitation } = JSON.parse(inviteRes.body);
    expect(invitation.code).toBeDefined();

    // 5. Friend validates the invitation code
    const valRes = await app.inject({
      method: 'GET',
      url: `/api/invitations/${invitation.code}/validate`,
    });
    expect(valRes.statusCode).toBe(200);
    const valData = JSON.parse(valRes.body);
    expect(valData.valid).toBe(true);
    expect(valData.roomName).toBe(targetRoom.name);

    // 6. User updates profile display name
    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/auth/profile',
      headers: {
        'x-device-id': deviceId,
      },
      payload: {
        displayName: 'Kian V2',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updatedUser = JSON.parse(updateRes.body).user;
    expect(updatedUser.displayName).toBe('Kian V2');
  });
});
