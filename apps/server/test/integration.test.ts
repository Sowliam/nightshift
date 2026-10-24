import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';

describe('NIGHTSHIFT End-to-End Client Simulation', () => {
  let app: FastifyInstance;
  let token: string;
  let user: any;
  let server: any;
  let voiceChannel: any;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('Simulates complete user flow: register -> create server & voice channel -> configure music bot -> play command', async () => {
    // 1. User registers
    const username = `sim_user_${Date.now()}`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username,
        displayName: 'Kian Pilot',
        password: 'securePassword123',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regData = JSON.parse(regRes.body);
    token = regData.token;
    user = regData.user;
    expect(user.displayName).toBe('Kian Pilot');

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 2. User creates a server
    const serverRes = await app.inject({
      method: 'POST',
      url: '/api/servers',
      headers: authHeaders,
      payload: {
        name: 'The Lounge',
        description: 'Music & Gaming Lounge',
      },
    });
    expect(serverRes.statusCode).toBe(201);
    server = JSON.parse(serverRes.body).server;
    expect(server.name).toBe('The Lounge');

    // 3. User creates a voice channel
    const channelRes = await app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/channels`,
      headers: authHeaders,
      payload: {
        name: 'Chill Music',
        type: 'voice',
      },
    });
    expect(channelRes.statusCode).toBe(201);
    voiceChannel = JSON.parse(channelRes.body).channel;
    expect(voiceChannel.type).toBe('voice');

    // 4. User queries bot status and configures it
    const botRes = await app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/bot`,
      headers: authHeaders,
    });
    expect(botRes.statusCode).toBe(200);
    const { bot } = JSON.parse(botRes.body);
    expect(bot.botType).toBe('music');
    expect(bot.isEnabled).toBe(true);

    // 5. Update bot settings (set default channel and volume)
    const updateBotRes = await app.inject({
      method: 'PATCH',
      url: `/api/servers/${server.id}/bot`,
      headers: authHeaders,
      payload: {
        defaultChannelId: voiceChannel.id,
        volume: 75,
      },
    });
    expect(updateBotRes.statusCode).toBe(200);
    const updatedBot = JSON.parse(updateBotRes.body).bot;
    expect(updatedBot.volume).toBe(75);
    expect(updatedBot.defaultChannelId).toBe(voiceChannel.id);

    // 6. User checks music session state
    const sessionRes = await app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/music/session`,
      headers: authHeaders,
    });
    expect(sessionRes.statusCode).toBe(200);
    const { session } = JSON.parse(sessionRes.body);
    expect(session.serverId).toBe(server.id);
    expect(session.queue).toEqual([]);

    // 7. Test slash command dispatch via text channel command endpoint
    const textChannel = await prisma.channel.findFirst({
      where: { serverId: server.id, type: 'text' },
    });
    expect(textChannel).toBeDefined();

    const cmdRes = await app.inject({
      method: 'POST',
      url: `/api/servers/${server.id}/channels/${textChannel!.id}/command`,
      headers: authHeaders,
      payload: {
        command: '/volume 85',
      },
    });
    expect(cmdRes.statusCode).toBe(200);
    const cmdBody = JSON.parse(cmdRes.body);
    expect(cmdBody.result.success).toBe(true);
    expect(cmdBody.botMessage.content).toContain('85%');
  });
});
