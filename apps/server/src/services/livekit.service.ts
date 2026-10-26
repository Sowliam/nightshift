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

const participantCache = new Map<string, { data: Array<{ identity: string; name: string }>; timestamp: number }>();
const CACHE_TTL_MS = 2000;

export function invalidateRoomParticipantCache(roomName?: string) {
  if (roomName) {
    participantCache.delete(roomName);
  } else {
    participantCache.clear();
  }
}

export async function getLiveKitRoomParticipants(
  roomName: string
): Promise<Array<{ identity: string; name: string }>> {
  const cached = participantCache.get(roomName);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const client = getClient();
  if (!client) return cached?.data || [];

  try {
    const fetchPromise = client.listParticipants(roomName);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('LiveKit listParticipants timeout')), 1200)
    );

    const participants = await Promise.race([fetchPromise, timeoutPromise]);
    const mapped = participants.map((p) => ({
      identity: p.identity,
      name: p.name || p.identity,
    }));

    participantCache.set(roomName, { data: mapped, timestamp: now });
    return mapped;
  } catch {
    return cached?.data || [];
  }
}

export async function getLiveKitRoomParticipantsCount(roomName: string): Promise<number> {
  const participants = await getLiveKitRoomParticipants(roomName);
  return participants.length;
}

let lastHealthCheck: { result: { configured: boolean; reachable: boolean; error?: string }; timestamp: number } | null = null;
const HEALTH_CACHE_MS = 15000; // 15 seconds cache

export async function checkLiveKitHealth(): Promise<{ configured: boolean; reachable: boolean; error?: string }> {
  if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
    return { configured: false, reachable: false, error: 'Credentials missing' };
  }

  const now = Date.now();
  if (lastHealthCheck && now - lastHealthCheck.timestamp < HEALTH_CACHE_MS) {
    return lastHealthCheck.result;
  }

  const client = getClient();
  if (!client) {
    return { configured: true, reachable: false, error: 'Client init failed' };
  }

  try {
    await client.listRooms();
    const res = { configured: true, reachable: true };
    lastHealthCheck = { result: res, timestamp: now };
    return res;
  } catch (err: any) {
    const res = {
      configured: true,
      reachable: false,
      error: err?.message || 'Failed to connect to LiveKit server',
    };
    lastHealthCheck = { result: res, timestamp: now };
    return res;
  }
}

