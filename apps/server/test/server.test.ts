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

  it('POST /api/auth/register should register a new account', async () => {
    const uniqueUsername = `runner_${Date.now().toString(36)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: uniqueUsername,
        displayName: 'GhostRunner',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe(uniqueUsername);
    expect(body.user.displayName).toBe('GhostRunner');
    expect(body.token).toBeDefined();
  });

  it('POST /api/auth/login should authenticate registered account', async () => {
    const uniqueUsername = `login_${Date.now().toString(36)}`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: uniqueUsername,
        displayName: 'LoginTest',
        password: 'Password123!',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: uniqueUsername,
        password: 'Password123!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.user.username).toBe(uniqueUsername);
    expect(body.token).toBeDefined();
  });

  it('POST /api/auth/register should reject invalid inputs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'ab', // too short
        displayName: 'a', // too short
        password: '123', // too short
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('generateLiveKitToken creates valid signed token', async () => {
    const token = await generateLiveKitToken('test-room', 'user-123', 'TestUser');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // Valid JWT structure
  });
});
