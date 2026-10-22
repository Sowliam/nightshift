import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config.js';

let roomServiceClient: RoomServiceClient | null = null;

function getClient(): RoomServiceClient | null {
  if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
    return null;
  }
  if (!roomServiceClient) {
    const httpUrl = config.livekit.url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    roomServiceClient = new RoomServiceClient(
      httpUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
  }
  return roomServiceClient;
}

export async function generateLiveKitToken(
  roomName: string,
  identity: string,
  displayName: string
): Promise<string> {
  if (!config.livekit.apiKey || !config.livekit.apiSecret) {
    throw new Error('LiveKit API key or secret not configured on the server');
  }

  const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
    identity,
    name: displayName,
    ttl: '6h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}

export async function getLiveKitRoomParticipantsCount(roomName: string): Promise<number> {
  const client = getClient();
  if (!client) return 0;

  try {
    const participants = await client.listParticipants(roomName);
    return participants.length;
  } catch {
    // If room hasn't been created yet or cloud is temporarily unreachable, participant count is 0
    return 0;
  }
}

export async function checkLiveKitHealth(): Promise<{ configured: boolean; reachable: boolean; error?: string }> {
  if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
    return { configured: false, reachable: false, error: 'Credentials missing' };
  }

  const client = getClient();
  if (!client) {
    return { configured: true, reachable: false, error: 'Client init failed' };
  }

  try {
    await client.listRooms();
    return { configured: true, reachable: true };
  } catch (err: any) {
    return {
      configured: true,
      reachable: false,
      error: err?.message || 'Failed to connect to LiveKit server',
    };
  }
}
