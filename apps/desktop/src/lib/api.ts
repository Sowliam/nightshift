import {
  UserDto,
  RoomDto,
  JoinRoomResponse,
  InvitationDto,
} from '@nightshift/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private getHeaders(deviceId?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (deviceId) {
      headers['x-device-id'] = deviceId;
    }
    return headers;
  }

  async getHealth(): Promise<{
    name: string;
    version: string;
    status: string;
    services: { database: string; livekit: string; livekitError?: string };
  }> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  }

  async registerUser(displayName: string, deviceId: string): Promise<UserDto> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: this.getHeaders(deviceId),
      body: JSON.stringify({ displayName, deviceId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to register user');
    }

    const data = await res.json();
    return data.user;
  }

  async getCurrentUser(deviceId: string): Promise<UserDto | null> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: this.getHeaders(deviceId),
      });

      if (res.status === 404 || res.status === 401) {
        return null;
      }
      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }

  async updateProfile(displayName: string, deviceId: string): Promise<UserDto> {
    const res = await fetch(`${API_BASE}/api/auth/profile`, {
      method: 'PATCH',
      headers: this.getHeaders(deviceId),
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update profile');
    }

    const data = await res.json();
    return data.user;
  }

  async getRooms(): Promise<RoomDto[]> {
    const res = await fetch(`${API_BASE}/api/rooms`);
    if (!res.ok) {
      throw new Error('Failed to load rooms from server');
    }
    const data = await res.json();
    return data.rooms;
  }

  async getRoom(id: string): Promise<RoomDto> {
    const res = await fetch(`${API_BASE}/api/rooms/${id}`);
    if (!res.ok) {
      throw new Error('Room not found');
    }
    const data = await res.json();
    return data.room;
  }

  async joinRoom(roomId: string, userId: string): Promise<JoinRoomResponse> {
    const res = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to join room');
    }

    return res.json();
  }

  async createInvitation(roomId?: string, deviceId?: string): Promise<InvitationDto> {
    const res = await fetch(`${API_BASE}/api/invitations`, {
      method: 'POST',
      headers: this.getHeaders(deviceId),
      body: JSON.stringify({ roomId, maxUses: 20, expiresInHours: 72 }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate invitation');
    }

    const data = await res.json();
    return data.invitation;
  }

  async validateInvitation(code: string): Promise<{
    valid: boolean;
    code?: string;
    roomId?: string | null;
    roomName?: string;
    reason?: string;
  }> {
    const res = await fetch(`${API_BASE}/api/invitations/${code}/validate`);
    return res.json();
  }
}

export const api = new ApiClient();
