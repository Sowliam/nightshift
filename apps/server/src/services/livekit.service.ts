import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config, LiveKitAccountConfig } from '../config.js';

export interface LiveKitSlotState extends LiveKitAccountConfig {
  client: RoomServiceClient | null;
  isExhausted: boolean;
  exhaustedAt: number | null;
  lastError: string | null;
  lastCheckedAt: number | null;
  healthyCachedUntil: number;
}

export interface LiveKitTokenResult {
  token: string;
  livekitUrl: string;
  slot: number;
}

function isQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err?.status ?? err?.statusCode ?? err?.code;
  if (status === 429 || status === 402 || status === 8 || status === 'RESOURCE_EXHAUSTED') {
    return true;
  }
  const msg = (err?.message || err?.toString() || '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('limit exceeded') ||
    msg.includes('bandwidth limit') ||
    msg.includes('resource exhausted') ||
    msg.includes('usage limit') ||
    msg.includes('plan limit') ||
    msg.includes('credit') ||
    msg.includes('payment required') ||
    msg.includes('insufficient') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('account suspended') ||
    msg.includes('project disabled')
  );
}

class LiveKitPoolManager {
  private slots: LiveKitSlotState[] = [];
  private activeSlotIndex = 0;
  private roomSlotMap = new Map<string, number>(); // roomKey -> slot number
  private participantCache = new Map<string, { data: Array<{ identity: string; name: string }>; timestamp: number }>();
  private readonly CACHE_TTL_MS = 2000;
  private readonly RECHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes to test exhausted accounts
  private readonly HEALTH_CACHE_MS = 15000;
  private lastHealthCheck: {
    result: {
      configured: boolean;
      reachable: boolean;
      activeSlot: number;
      totalSlots: number;
      error?: string;
      pool: any;
    };
    timestamp: number;
  } | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initSlots();
  }

  private initSlots() {
    const rawAccounts: LiveKitAccountConfig[] =
      config.livekitAccounts.length > 0
        ? config.livekitAccounts
        : config.livekit.apiKey && config.livekit.apiSecret && config.livekit.url
        ? [
            {
              slot: 1,
              name: 'LiveKit Account 1 (Primary)',
              url: config.livekit.url,
              apiKey: config.livekit.apiKey,
              apiSecret: config.livekit.apiSecret,
            },
          ]
        : [];

    this.slots = rawAccounts.map((acc) => ({
      ...acc,
      client: null,
      isExhausted: false,
      exhaustedAt: null,
      lastError: null,
      lastCheckedAt: null,
      healthyCachedUntil: 0,
    }));

    if (this.slots.length > 0) {
      console.log(
        `[LiveKit Pool] Initialized with ${this.slots.length} account slot(s). Active slot: #${this.slots[0].slot} (${this.slots[0].name})`
      );
    }

    // Background timer to automatically detect monthly quota renewals or resets
    if (this.slots.length > 1) {
      this.checkInterval = setInterval(() => {
        this.recheckExhaustedSlots().catch((err) => {
          console.error('[LiveKit Pool] Periodic recharge check error:', err);
        });
      }, this.RECHECK_INTERVAL_MS);

      if (this.checkInterval.unref) {
        this.checkInterval.unref();
      }
    }
  }

  private getClient(slot: LiveKitSlotState): RoomServiceClient {
    if (!slot.client) {
      const httpUrl = slot.url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
      slot.client = new RoomServiceClient(httpUrl, slot.apiKey, slot.apiSecret);
    }
    return slot.client;
  }

  /**
   * Probe a slot via listRooms to test connectivity and quota status
   */
  public async probeSlot(slot: LiveKitSlotState, timeoutMs = 1200): Promise<boolean> {
    const client = this.getClient(slot);
    slot.lastCheckedAt = Date.now();
    let timer: NodeJS.Timeout | null = null;
    try {
      const fetchPromise = client.listRooms();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LiveKit probe timeout')), timeoutMs);
      });
      await Promise.race([fetchPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      slot.lastError = null;
      slot.healthyCachedUntil = Date.now() + 30000; // Cache 30 seconds
      return true;
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const quotaHit = isQuotaError(err);
      slot.lastError = err?.message || String(err);
      if (quotaHit) {
        slot.isExhausted = true;
        if (!slot.exhaustedAt) slot.exhaustedAt = Date.now();
        console.warn(`[LiveKit Pool] ⚠️ Account #${slot.slot} (${slot.name}) quota exhausted: ${slot.lastError}`);
      }
      return false;
    }
  }

  /**
   * Recheck any exhausted accounts in the pool to see if their quota has reset/recharged
   */
  public async recheckExhaustedSlots(): Promise<void> {
    for (const slot of this.slots) {
      if (slot.isExhausted) {
        console.log(`[LiveKit Pool] Probing exhausted Account #${slot.slot} (${slot.name}) for quota renewal...`);
        const isHealthy = await this.probeSlot(slot, 2000);
        if (isHealthy) {
          slot.isExhausted = false;
          slot.exhaustedAt = null;
          slot.lastError = null;
          console.log(`[LiveKit Pool] 🎉 Account #${slot.slot} (${slot.name}) has RECHARGED and is back online!`);
        }
      }
    }
  }

  /**
   * Rotate to the next available healthy slot in sequence (1 -> 2 -> 3 -> 1...)
   */
  public async rotateActiveSlot(reason = 'Quota exhausted'): Promise<LiveKitSlotState> {
    if (this.slots.length <= 1) {
      if (this.slots[0]) {
        this.slots[0].lastError = reason;
      }
      return this.slots[0];
    }

    const currentIdx = this.activeSlotIndex;
    const currentSlot = this.slots[currentIdx];

    if (currentSlot) {
      currentSlot.isExhausted = true;
      if (!currentSlot.exhaustedAt) currentSlot.exhaustedAt = Date.now();
      currentSlot.lastError = reason;
      console.warn(`[LiveKit Pool] ⚠️ Slot #${currentSlot.slot} (${currentSlot.name}) marked as EXHAUSTED: ${reason}`);
    }

    const total = this.slots.length;
    // Sequential failover: try next slot in order
    for (let offset = 1; offset < total; offset++) {
      const nextIdx = (currentIdx + offset) % total;
      const candidate = this.slots[nextIdx];

      // If candidate is not marked exhausted, verify with quick probe
      if (!candidate.isExhausted) {
        const isHealthy = await this.probeSlot(candidate, 1200);
        if (isHealthy) {
          this.activeSlotIndex = nextIdx;
          console.log(`[LiveKit Pool] 🔄 Switched active slot: #${candidate.slot} (${candidate.name})`);
          return candidate;
        }
      }
    }

    // All slots appear exhausted. Check if Slot 1 or any earlier slot has recharged
    console.log('[LiveKit Pool] All accounts marked exhausted. Probing all slots for quota recharge...');
    for (let i = 0; i < total; i++) {
      const slot = this.slots[i];
      const isRecharged = await this.probeSlot(slot, 1500);
      if (isRecharged) {
        slot.isExhausted = false;
        slot.exhaustedAt = null;
        slot.lastError = null;
        this.activeSlotIndex = i;
        console.log(`[LiveKit Pool] 🎉 Account #${slot.slot} (${slot.name}) has recharged! Switched to #${slot.slot}`);
        return slot;
      }
    }

    // None reachable; fallback to Slot 1
    console.error('[LiveKit Pool] ❌ All LiveKit accounts are exhausted. Fallback to primary slot.');
    this.activeSlotIndex = 0;
    return this.slots[0];
  }

  /**
   * Get the healthy slot for a specific room (maintains room affinity across participants)
   */
  public async getSlotForRoom(roomName: string): Promise<LiveKitSlotState> {
    if (this.slots.length === 0) {
      throw new Error('No LiveKit accounts configured on the server');
    }

    // 1. Check if room is already mapped to an active slot
    const boundSlotNum = this.roomSlotMap.get(roomName);
    if (boundSlotNum !== undefined) {
      const existing = this.slots.find((s) => s.slot === boundSlotNum);
      if (existing && !existing.isExhausted) {
        return existing;
      }
      // If the bound slot is marked exhausted, check if anyone is still in the room
      if (existing) {
        const activeParticipants = await this.fetchParticipantsForSlot(existing, roomName);
        if (activeParticipants.length > 0) {
          return existing; // Keep existing active call connected
        }
      }
      // Room is empty; unbind and allocate fresh slot
      this.roomSlotMap.delete(roomName);
    }

    // 2. Select active healthy slot
    let active = this.slots[this.activeSlotIndex] || this.slots[0];
    if (active.isExhausted) {
      active = await this.rotateActiveSlot('Active slot is exhausted');
    } else {
      // If health cache expired, run a fast probe before handing out token
      if (Date.now() > active.healthyCachedUntil) {
        const healthy = await this.probeSlot(active, 1000);
        if (!healthy && active.isExhausted) {
          active = await this.rotateActiveSlot(active.lastError || 'Health check failed');
        }
      }
    }

    this.roomSlotMap.set(roomName, active.slot);
    return active;
  }

  /**
   * Internal participant fetcher for a given slot
   */
  private async fetchParticipantsForSlot(
    slot: LiveKitSlotState,
    roomName: string
  ): Promise<Array<{ identity: string; name: string }>> {
    const client = this.getClient(slot);
    let timer: NodeJS.Timeout | null = null;
    try {
      const fetchPromise = client.listParticipants(roomName);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LiveKit listParticipants timeout')), 1200);
      });

      const participants = await Promise.race([fetchPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      return (participants || [])
        .filter((p: any) => {
          if (!p) return false;
          // State: 0 = JOINING, 1 = JOINED, 2 = ACTIVE, 3 = DISCONNECTED
          if (p.state === 3 || p.state === 'DISCONNECTED') return false;
          return true;
        })
        .map((p) => ({
          identity: p.identity,
          name: p.name || p.identity,
        }));
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      if (isQuotaError(err)) {
        await this.rotateActiveSlot(err.message);
      }
      return [];
    }
  }

  public invalidateCache(roomName?: string) {
    if (roomName) {
      this.participantCache.delete(roomName);
    } else {
      this.participantCache.clear();
    }
  }

  public async getParticipants(roomName: string): Promise<Array<{ identity: string; name: string }>> {
    const cached = this.participantCache.get(roomName);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    const boundSlotNum = this.roomSlotMap.get(roomName);
    const slot =
      this.slots.find((s) => s.slot === boundSlotNum) || this.slots[this.activeSlotIndex] || this.slots[0];

    if (!slot) return cached?.data || [];

    const participants = await this.fetchParticipantsForSlot(slot, roomName);
    this.participantCache.set(roomName, { data: participants, timestamp: now });

    // If channel is completely empty, unbind room to allow future joins to use updated active slot
    if (participants.length === 0) {
      this.roomSlotMap.delete(roomName);
    }

    return participants;
  }

  public async removeParticipant(roomName: string, identity: string): Promise<boolean> {
    const boundSlotNum = this.roomSlotMap.get(roomName);
    const slot =
      this.slots.find((s) => s.slot === boundSlotNum) || this.slots[this.activeSlotIndex] || this.slots[0];

    if (!slot) return false;

    const client = this.getClient(slot);
    try {
      await client.removeParticipant(roomName, identity);
      this.invalidateCache(roomName);
      return true;
    } catch (err: any) {
      if (isQuotaError(err)) {
        await this.rotateActiveSlot(err.message);
      }
      return false;
    }
  }

  public async generateToken(
    roomName: string,
    identity: string,
    displayName: string
  ): Promise<LiveKitTokenResult> {
    const slot = await this.getSlotForRoom(roomName);

    if (!slot.apiKey || !slot.apiSecret) {
      throw new Error(`LiveKit credentials missing for slot #${slot.slot}`);
    }

    const at = new AccessToken(slot.apiKey, slot.apiSecret, {
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

    const token = await at.toJwt();
    return {
      token,
      livekitUrl: slot.url,
      slot: slot.slot,
    };
  }

  public getPoolStatus() {
    const current = this.slots[this.activeSlotIndex] || this.slots[0];
    return {
      totalAccounts: this.slots.length,
      activeSlot: current ? current.slot : 1,
      activeSlotName: current ? current.name : '',
      activeRoomsCount: this.roomSlotMap.size,
      accounts: this.slots.map((s) => ({
        slot: s.slot,
        name: s.name,
        url: s.url,
        isActive: s.slot === (current?.slot ?? 1),
        isExhausted: s.isExhausted,
        exhaustedAt: s.exhaustedAt ? new Date(s.exhaustedAt).toISOString() : null,
        lastError: s.lastError,
        lastCheckedAt: s.lastCheckedAt ? new Date(s.lastCheckedAt).toISOString() : null,
      })),
    };
  }

  public async checkHealth(): Promise<{
    configured: boolean;
    reachable: boolean;
    activeSlot: number;
    totalSlots: number;
    error?: string;
    pool: ReturnType<LiveKitPoolManager['getPoolStatus']>;
  }> {
    const now = Date.now();
    if (this.lastHealthCheck && now - this.lastHealthCheck.timestamp < this.HEALTH_CACHE_MS) {
      return this.lastHealthCheck.result;
    }

    if (this.slots.length === 0) {
      const res = {
        configured: false,
        reachable: false,
        activeSlot: 0,
        totalSlots: 0,
        error: 'Credentials missing',
        pool: this.getPoolStatus(),
      };
      this.lastHealthCheck = { result: res, timestamp: now };
      return res;
    }

    const current = this.slots[this.activeSlotIndex] || this.slots[0];
    const isHealthy = await this.probeSlot(current, 1000);

    if (isHealthy) {
      const res = {
        configured: true,
        reachable: true,
        activeSlot: current.slot,
        totalSlots: this.slots.length,
        pool: this.getPoolStatus(),
      };
      this.lastHealthCheck = { result: res, timestamp: now };
      return res;
    }

    // If current slot failed due to quota, try next slot
    if (current.isExhausted && this.slots.length > 1) {
      const nextSlot = await this.rotateActiveSlot(current.lastError || 'Active slot failed health check');
      const nextHealthy = await this.probeSlot(nextSlot, 1000);
      const res = {
        configured: true,
        reachable: nextHealthy,
        activeSlot: nextSlot.slot,
        totalSlots: this.slots.length,
        error: nextHealthy ? undefined : nextSlot.lastError || 'LiveKit slots unreachable',
        pool: this.getPoolStatus(),
      };
      this.lastHealthCheck = { result: res, timestamp: now };
      return res;
    }

    const res = {
      configured: true,
      reachable: false,
      activeSlot: current.slot,
      totalSlots: this.slots.length,
      error: current.lastError || 'Failed to connect to LiveKit server',
      pool: this.getPoolStatus(),
    };
    this.lastHealthCheck = { result: res, timestamp: now };
    return res;
  }

  public dispose() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Global Singleton Pool Instance
export const livekitPool = new LiveKitPoolManager();

export async function generateLiveKitToken(
  roomName: string,
  identity: string,
  displayName: string
): Promise<LiveKitTokenResult> {
  return livekitPool.generateToken(roomName, identity, displayName);
}

export function invalidateRoomParticipantCache(roomName?: string) {
  livekitPool.invalidateCache(roomName);
}

export async function getLiveKitRoomParticipants(
  roomName: string
): Promise<Array<{ identity: string; name: string }>> {
  return livekitPool.getParticipants(roomName);
}

export async function removeLiveKitParticipant(roomName: string, identity: string): Promise<boolean> {
  return livekitPool.removeParticipant(roomName, identity);
}

export async function getLiveKitRoomParticipantsCount(roomName: string): Promise<number> {
  const participants = await getLiveKitRoomParticipants(roomName);
  return participants.length;
}

export async function checkLiveKitHealth() {
  return livekitPool.checkHealth();
}

export function getLiveKitPoolStatus() {
  return livekitPool.getPoolStatus();
}

export async function rotateLiveKitSlot(reason?: string) {
  return livekitPool.rotateActiveSlot(reason);
}

export async function recheckLiveKitExhaustedSlots() {
  return livekitPool.recheckExhaustedSlots();
}
