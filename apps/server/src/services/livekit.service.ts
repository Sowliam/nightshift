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
    
    // Explicitly filter for ACTIVE (2) or JOINED (1) participants.
    // Discard any participant marked as DISCONNECTED (3)
    const mapped = (participants || [])
      .filter((p: any) => {
        if (!p) return false;
        // ParticipantInfo_State: 0 = JOINING, 1 = JOINED, 2 = ACTIVE, 3 = DISCONNECTED
        if (p.state === 3 || p.state === 'DISCONNECTED') return false;
        return true;
      })
      .map((p) => ({
        identity: p.identity,
        name: p.name || p.identity,
      }));

    participantCache.set(roomName, { data: mapped, timestamp: now });
    return mapped;
  } catch (err: any) {
    const msg = (err?.message || '').toLowerCase();
    // If room doesn't exist on LiveKit (or 404 / not found / empty), there are 0 participants.
    // Invalidate the cache so ghost users are never shown!
    if (msg.includes('not found') || msg.includes('does not exist') || err?.status === 404 || err?.code === 5) {
      participantCache.set(roomName, { data: [], timestamp: now });
      return [];
    }
    // For other transient errors, if cache is expired, return empty array
    if (!cached || now - cached.timestamp > 5000) {
      return [];
    }
    return cached.data;
  }
}

export async function removeLiveKitParticipant(roomName: string, identity: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await client.removeParticipant(roomName, identity);
    invalidateRoomParticipantCache(roomName);
    return true;
  } catch {
    return false;
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

