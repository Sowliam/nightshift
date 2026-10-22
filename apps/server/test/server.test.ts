import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';
import { generateLiveKitToken } from '../src/services/livekit.service.js';

describe('NIGHTSHIFT Server API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /api/health should return ok status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.name).toBe('NIGHTSHIFT');
    expect(body.services).toBeDefined();
  });

  it('POST /api/auth/register should register a user', async () => {
    const testDeviceId = `test-device-${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'GhostRunner',
        deviceId: testDeviceId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.displayName).toBe('GhostRunner');
    expect(body.user.deviceId).toBe(testDeviceId);
  });

  it('POST /api/auth/register should reject empty display name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        displayName: 'a',
        deviceId: 'device-12345678',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /api/invitations should create a valid invitation code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/invitations',
      payload: {
        maxUses: 5,
        expiresInHours: 24,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.invitation).toBeDefined();
    expect(body.invitation.code).toBeDefined();

    // Validate the invitation code
    const valRes = await app.inject({
      method: 'GET',
      url: `/api/invitations/${body.invitation.code}/validate`,
    });

    expect(valRes.statusCode).toBe(200);
    const valBody = JSON.parse(valRes.body);
    expect(valBody.valid).toBe(true);
  });

  it('generateLiveKitToken creates valid signed token', async () => {
    const token = await generateLiveKitToken('test-room', 'user-123', 'TestUser');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // Valid JWT structure
  });
});
