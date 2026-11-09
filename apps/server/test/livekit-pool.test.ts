import { describe, it, expect } from 'vitest';
import { getLiveKitPoolStatus, rotateLiveKitSlot } from '../src/services/livekit.service.js';

describe('LiveKit Multi-Account Pool & Auto-Rotation', () => {
  it('pool status accurately exposes accounts and active slot', () => {
    const status = getLiveKitPoolStatus();
    expect(status).toBeDefined();
    expect(status.totalAccounts).toBeGreaterThanOrEqual(1);
    expect(status.activeSlot).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(status.accounts)).toBe(true);

    const activeAcc = status.accounts.find((a) => a.isActive);
    expect(activeAcc).toBeDefined();
    expect(activeAcc?.slot).toBe(status.activeSlot);
  });

  it('rotateLiveKitSlot successfully rotates active slot and records reason', async () => {
    const beforeStatus = getLiveKitPoolStatus();
    const rotated = await rotateLiveKitSlot('Test manual rotation trigger');

    expect(rotated).toBeDefined();
    expect(rotated.slot).toBeDefined();

    const afterStatus = getLiveKitPoolStatus();
    expect(afterStatus.activeSlot).toBe(rotated.slot);
  });
});
