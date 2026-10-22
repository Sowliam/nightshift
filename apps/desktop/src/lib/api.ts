import {
  UserDto,
  AuthResponse,
  ServerSummaryDto,
  ChannelDto,
  ServerMemberDto,
  ServerInviteDto,
  MessageDto,
  VoiceJoinResponse,
} from '@nightshift/shared';

export const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('nightshift_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/$/, '');
    }
  }
  return (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
};

export const setApiBase = (url: string | null) => {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('nightshift_api_url', url.trim().replace(/\/$/, ''));
    } else {
      localStorage.removeItem('nightshift_api_url');
    }
  }
  API_BASE = getApiBase();
};

export let API_BASE = getApiBase();
const TOKEN_KEY = 'nightshift_auth_token';

class ApiClient {
  private token: string | null = null;

  getBaseUrl(): string {
    const base = getApiBase();
    API_BASE = base;
    return base;
  }

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem(TOKEN_KEY);
    }
    return this.token;
  }

  private getHeaders(hasBody = false): HeadersInit {
    const headers: Record<string, string> = {};
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
  }

  // --- Health ---
  async getHealth() {
    const res = await fetch(`${this.getBaseUrl()}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  }

  // --- Auth ---
  async registerUser(username: string, displayName: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.getBaseUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to register account');
    }

    const data: AuthResponse = await res.json();
    this.setToken(data.token);
    return data;
  }

  async loginUser(username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${this.getBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Invalid username or password');
    }

    const data: AuthResponse = await res.json();
    this.setToken(data.token);
    return data;
  }

  async getCurrentUser(): Promise<UserDto | null> {
    const t = this.getToken();
    if (!t) return null;

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/me`, {
        headers: this.getHeaders(),
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.setToken(null);
        }
        return null;
      }

      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }

  async updateProfile(displayName: string): Promise<UserDto> {
    const res = await fetch(`${this.getBaseUrl()}/api/auth/profile`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update profile');
    }

    const data = await res.json();
    return data.user;
  }

  async sendHeartbeat(): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/heartbeat`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Servers ---
  async getServers(): Promise<ServerSummaryDto[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch servers');
    }

    const data = await res.json();
    return data.servers;
  }

  async createServer(name: string, description?: string): Promise<{ server: ServerSummaryDto; channels: ChannelDto[] }> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create server');
    }

    return res.json();
  }

  async deleteServer(serverId: string): Promise<boolean> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete server');
    }

    return true;
  }

  async leaveServer(serverId: string): Promise<boolean> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/leave`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Failed to leave server');
    }

    return true;
  }

  // --- Channels ---
  async getChannels(serverId: string): Promise<ChannelDto[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/channels`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch channels');
    }

    const data = await res.json();
    return data.channels;
  }

  async createChannel(serverId: string, name: string, type: 'text' | 'voice'): Promise<ChannelDto> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/channels`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ name, type }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create channel');
    }

    const data = await res.json();
    return data.channel;
  }

  async deleteChannel(serverId: string, channelId: string): Promise<boolean> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/channels/${channelId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete channel');
    }

    return true;
  }

  async joinVoiceChannel(channelId: string): Promise<VoiceJoinResponse> {
    const res = await fetch(`${this.getBaseUrl()}/api/channels/${channelId}/join`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Failed to join voice channel');
    }

    return res.json();
  }

  // --- Members & Moderation ---
  async getServerMembers(serverId: string): Promise<ServerMemberDto[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/members`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load members');
    }

    const data = await res.json();
    return data.members;
  }

  async moderateMember(
    serverId: string,
    targetUserId: string,
    action: 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'kick' | 'ban' | 'unban',
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/members/${targetUserId}/moderate`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ action, reason }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Moderation action failed');
    }

    return res.json();
  }

  // --- Invites ---
  async createInvite(serverId: string, maxUses = 0, expiresInHours = 72): Promise<ServerInviteDto> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/invites`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ maxUses, expiresInHours }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create invite');
    }

    const data = await res.json();
    return data.invite;
  }

  async getServerInvites(serverId: string): Promise<ServerInviteDto[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/invites`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch invites');
    }

    const data = await res.json();
    return data.invites;
  }

  async revokeInvite(serverId: string, code: string): Promise<boolean> {
    const res = await fetch(`${this.getBaseUrl()}/api/servers/${serverId}/invites/${code}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to revoke invite');
    }

    return true;
  }

  async joinServerByInvite(code: string): Promise<ServerSummaryDto> {
    const res = await fetch(`${this.getBaseUrl()}/api/invites/join`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ code: code.trim() }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Failed to join server using this invite');
    }

    const data = await res.json();
    return data.server;
  }

  // --- Messages & Upload ---
  async getChannelMessages(channelId: string): Promise<MessageDto[]> {
    const res = await fetch(`${this.getBaseUrl()}/api/channels/${channelId}/messages`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Failed to fetch messages');
    }

    const data = await res.json();
    return data.messages;
  }

  async sendMessage(
    channelId: string,
    content: string,
    attachmentUrl?: string,
    attachmentType?: string
  ): Promise<MessageDto> {
    const res = await fetch(`${this.getBaseUrl()}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ content, attachmentUrl, attachmentType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to send message');
    }

    const data = await res.json();
    return data.message;
  }

  async uploadImage(file: File): Promise<{ url: string; filename: string; type: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }

    const res = await fetch(`${this.getBaseUrl()}/api/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to upload image. Must be legitimate PNG or JPEG under 5MB.');
    }

    return res.json();
  }
}

export const api = new ApiClient();
