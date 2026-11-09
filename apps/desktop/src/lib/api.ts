import {
  UserDto,
  AuthResponse,
  ServerSummaryDto,
  ChannelDto,
  ServerMemberDto,
  ServerInviteDto,
  MessageDto,
  VoiceJoinResponse,
  DEFAULT_PRODUCTION_API,
  DEFAULT_PRODUCTION_WEB,
  extractInviteCode,
} from '@nightshift/shared';

export { DEFAULT_PRODUCTION_API, DEFAULT_PRODUCTION_WEB, extractInviteCode };

export const getApiBase = (): string => {
  if (typeof window !== 'undefined') {
    // 1. Support ?api=https://... or #api=https://... URL parameter for instant 1-click cloud backend connection
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryApi = searchParams.get('api');
      if (queryApi && queryApi.trim().startsWith('http')) {
        const clean = queryApi.trim().replace(/\/$/, '');
        localStorage.setItem('nightshift_api_url', clean);
        return clean;
      }

      if (window.location.hash.includes('api=')) {
        const hashApi = window.location.hash.split('api=')[1]?.split('&')[0];
        if (hashApi && decodeURIComponent(hashApi).trim().startsWith('http')) {
          const clean = decodeURIComponent(hashApi).trim().replace(/\/$/, '');
          localStorage.setItem('nightshift_api_url', clean);
          return clean;
        }
      }
    } catch {}

    // 2. Custom URL saved by user in localStorage
    const custom = localStorage.getItem('nightshift_api_url');
    if (custom && custom.trim()) {
      const cleanCustom = custom.trim().replace(/\/$/, '');
      // Purge old blocked domains (onrender.com and workers.dev)
      if (cleanCustom.includes('onrender.com') || cleanCustom.includes('workers.dev')) {
        localStorage.removeItem('nightshift_api_url');
        return DEFAULT_PRODUCTION_API;
      } else {
        return cleanCustom;
      }
    }

    // 3. Explicit VITE_API_URL from environment if not default localhost
    if (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost:3001')) {
      const envUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
      if (!envUrl.includes('onrender.com') && !envUrl.includes('workers.dev')) {
        return envUrl;
      }
    }

    // 4. In web browser on Vercel: use current origin directly
    if (window.location.origin && window.location.origin.includes('vercel.app')) {
      return window.location.origin;
    }

    // 5. Default to Vercel Anti-Filter Gateway (accessible inside Iran without VPN)
    return DEFAULT_PRODUCTION_API;
  }
  return (import.meta.env.VITE_API_URL || DEFAULT_PRODUCTION_API).replace(/\/$/, '');
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

export const getFullAvatarUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = getApiBase();
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
};

class ApiClient {
  private token: string | null = null;
  public onUnauthorized?: () => void;

  getBaseUrl(): string {
    const base = getApiBase();
    API_BASE = base;
    return base;
  }

  constructor() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        this.token = localStorage.getItem(TOKEN_KEY);
      } catch {}
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {}
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        this.token = localStorage.getItem(TOKEN_KEY);
      } catch {}
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

  private getAlternateUrl(currentUrl: string): string | null {
    // If accidentally on onrender.com or workers.dev (filtered in Iran), recover to Vercel proxy
    if (currentUrl.includes('nightshift-server-cfch.onrender.com') || currentUrl.includes('workers.dev')) {
      return currentUrl
        .replace('nightshift-server-cfch.onrender.com', 'dist-three-gray-67.vercel.app')
        .replace('nightshift-api.gemesowl.workers.dev', 'dist-three-gray-67.vercel.app');
    }
    return null;
  }

  private async fetchWithHandling(url: string, init?: RequestInit, retries = 2): Promise<Response> {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttps && url.startsWith('http://')) {
      throw new Error(
        'Browser Blocked Insecure Connection: Cannot connect to an insecure http:// address from an https:// website. Please set your Backend Server URL to your secure HTTPS URL (e.g. https://your-server.onrender.com or https://...up.railway.app).'
      );
    }

    let activeTargetUrl = url;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      // 10s timeout per attempt so users never get stuck indefinitely
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch(activeTargetUrl, {
          ...init,
          signal: init?.signal || controller.signal,
        });
        clearTimeout(timeoutId);

        // If Cloudflare/Render returned 502/503/504 because backend is waking up or failing, auto-failover
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
          const alternate = this.getAlternateUrl(activeTargetUrl);
          if (alternate && alternate !== activeTargetUrl) {
            activeTargetUrl = alternate;
          }
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        const renderRouting = res.headers.get('x-render-routing');
        if (res.status === 404 && (renderRouting === 'blocked-render-subdomain' || (activeTargetUrl.includes('.onrender.com') && !activeTargetUrl.includes('/api/health')))) {
          if (renderRouting === 'blocked-render-subdomain') {
            const alternate = this.getAlternateUrl(activeTargetUrl);
            if (alternate && alternate !== activeTargetUrl && attempt < retries) {
              activeTargetUrl = alternate;
              continue;
            }
          }
        }

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('text/html') && activeTargetUrl.includes('/api/')) {
          const alternate = this.getAlternateUrl(activeTargetUrl);
          if (alternate && alternate !== activeTargetUrl && attempt < retries) {
            activeTargetUrl = alternate;
            continue;
          }
        }

        // If failover back to Cloudflare anti-filter proxy succeeded, persist it
        if (activeTargetUrl !== url && activeTargetUrl.includes('vercel.app')) {
          try {
            const newBase = new URL(activeTargetUrl).origin;
            setApiBase(newBase);
          } catch {}
        }

        return res;
      } catch (err: any) {
        clearTimeout(timeoutId);

        // Immediate automatic failover to alternate gateway on connection error or timeout
        const alternate = this.getAlternateUrl(activeTargetUrl);
        if (alternate && alternate !== activeTargetUrl && attempt < retries) {
          activeTargetUrl = alternate;
          continue;
        }

        if (attempt < retries && !err.message?.includes('Browser Blocked')) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        if (err.name === 'AbortError') {
          // If timed out, try alternate endpoint once before giving up
          if (alternate && alternate !== activeTargetUrl) {
            try {
              const fallbackRes = await fetch(alternate, { ...init });
              if (fallbackRes.ok) {
                if (alternate && alternate.includes('vercel.app')) {
                  try {
                    setApiBase(new URL(alternate).origin);
                  } catch {}
                }
                return fallbackRes;
              }
            } catch {}
          }
          throw new Error('Backend connection timed out. Please wait a moment and try again.');
        }

        if (err.message && (err.message.includes('Browser Blocked') || err.message.includes('Backend connection') || err.message.includes('Render Error'))) {
          throw err;
        }
        throw new Error('Cannot reach backend server. The server may be waking up or offline. Please wait a moment and try again.');
      }
    }

    throw new Error(`Cannot reach backend server at ${this.getBaseUrl()}. Please ensure your backend is online.`);
  }

  private async parseError(res: Response, defaultMessage: string): Promise<Error> {
    const renderRouting = res.headers.get('x-render-routing');
    if (renderRouting === 'blocked-render-subdomain') {
      return new Error(
        `Render Error: Render blocked this subdomain (x-render-routing: blocked-render-subdomain). Check Render Dashboard: Service must not be Suspended & Render Subdomain must be Enabled in Settings.`
      );
    }

    try {
      const err = await res.json();
      if (res.status === 401) {
        this.setToken(null);
        if (this.onUnauthorized) {
          try {
            this.onUnauthorized();
          } catch {}
        }
        return new Error(err.error || 'Unauthorized: Please sign in again.');
      }
      if (err.details && typeof err.details === 'object') {
        const fieldErrors = (err.details as any).fieldErrors;
        if (fieldErrors && typeof fieldErrors === 'object') {
          const firstKey = Object.keys(fieldErrors)[0];
          if (firstKey && fieldErrors[firstKey]?.[0]) {
            return new Error(`${firstKey}: ${fieldErrors[firstKey][0]}`);
          }
        }
      }
      return new Error(err.error || err.message || defaultMessage);
    } catch {
      if (res.status === 404 && this.getBaseUrl().includes('onrender.com')) {
        return new Error(
          `Render Error (404 Not Found): The service at ${this.getBaseUrl()} was not found or is suspended on Render.`
        );
      }
      return new Error(`${defaultMessage} (Status ${res.status})`);
    }
  }

  // --- Health ---
  async getHealth() {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/health`);
    if (!res.ok) throw await this.parseError(res, `Health check failed: ${res.statusText}`);
    return res.json();
  }

  // --- Auth ---
  async registerUser(username: string, displayName: string, password: string): Promise<AuthResponse> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to register account');
    }

    const data: AuthResponse = await res.json();
    this.setToken(data.token);
    return data;
  }

  async loginUser(username: string, password: string): Promise<AuthResponse> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Invalid username or password');
    }

    const data: AuthResponse = await res.json();
    this.setToken(data.token);
    return data;
  }

  async getCurrentUser(): Promise<UserDto | null> {
    const t = this.getToken();
    if (!t) return null;

    try {
      const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/me`, {
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

  async updateProfile(displayName?: string, avatarUrl?: string | null): Promise<UserDto> {
    const payload: any = {};
    if (displayName !== undefined) payload.displayName = displayName;
    if (avatarUrl !== undefined) payload.avatarUrl = avatarUrl;

    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/profile`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to update profile');
    }

    const data = await res.json();
    return data.user;
  }

  async uploadAvatar(file: File): Promise<{ user: UserDto; url: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/avatar`, {
      method: 'POST',
      headers: this.getHeaders(false),
      body: formData,
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to upload avatar image');
    }

    return res.json();
  }

  async sendHeartbeat(): Promise<boolean> {
    try {
      const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/heartbeat`, {
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
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to fetch servers');
    }

    const data = await res.json();
    return data.servers;
  }

  async createServer(name: string, description?: string): Promise<{ server: ServerSummaryDto; channels: ChannelDto[] }> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ name, description }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to create server');
    }

    return res.json();
  }

  async deleteServer(serverId: string): Promise<boolean> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to delete server');
    }

    return true;
  }

  async leaveServer(serverId: string): Promise<boolean> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/leave`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to leave server');
    }

    return true;
  }

  // --- Channels ---
  async getChannels(serverId: string): Promise<ChannelDto[]> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/channels`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to fetch channels');
    }

    const data = await res.json();
    return data.channels;
  }

  async createChannel(serverId: string, name: string, type: 'text' | 'voice'): Promise<ChannelDto> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/channels`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ name, type }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to create channel');
    }

    const data = await res.json();
    return data.channel;
  }

  async deleteChannel(serverId: string, channelId: string): Promise<boolean> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/channels/${channelId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to delete channel');
    }

    return true;
  }

  async joinVoiceChannel(channelId: string): Promise<VoiceJoinResponse> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/channels/${channelId}/join`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to join voice channel');
    }

    return res.json();
  }

  async leaveVoiceChannel(channelId: string): Promise<boolean> {
    try {
      const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/channels/${channelId}/leave`, {
        method: 'POST',
        headers: this.getHeaders(true),
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Members & Moderation ---
  async getServerMembers(serverId: string): Promise<ServerMemberDto[]> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/members`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to load members');
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
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/members/${targetUserId}/moderate`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ action, reason }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Moderation action failed');
    }

    return res.json();
  }

  // --- Invites ---
  async createInvite(serverId: string, maxUses = 0, expiresInHours = 72): Promise<ServerInviteDto> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/invites`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ maxUses, expiresInHours }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to create invite');
    }

    const data = await res.json();
    return data.invite;
  }

  async getServerInvites(serverId: string): Promise<ServerInviteDto[]> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/invites`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to fetch invites');
    }

    const data = await res.json();
    return data.invites;
  }

  async revokeInvite(serverId: string, code: string): Promise<boolean> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/servers/${serverId}/invites/${code}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to revoke invite');
    }

    return true;
  }

  async joinServerByInvite(code: string): Promise<ServerSummaryDto> {
    const cleanCode = extractInviteCode(code);
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/invites/join`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ code: cleanCode }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to join server using this invite');
    }

    const data = await res.json();
    return data.server;
  }

  // --- Messages & Upload ---
  async getChannelMessages(channelId: string): Promise<MessageDto[]> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/channels/${channelId}/messages`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to fetch messages');
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
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ content, attachmentUrl, attachmentType }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to send message');
    }

    const data = await res.json();
    return data.message;
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const res = await this.fetchWithHandling(
      `${this.getBaseUrl()}/api/channels/${channelId}/messages/${messageId}`,
      {
        method: 'DELETE',
        headers: this.getHeaders(),
      }
    );

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to delete message');
    }
  }

  async uploadImage(file: File): Promise<{ url: string; filename: string; type: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }

    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to upload image. Must be legitimate PNG or JPEG under 5MB.');
    }

    return res.json();
  }

  // --- Cloudflare R2 Audio Library ---
  async getCloudSounds(category?: string, search?: string): Promise<CloudSoundItem[]> {
    const params = new URLSearchParams();
    if (category && category !== 'All') params.append('category', category);
    if (search && search.trim()) params.append('search', search.trim());

    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/sounds?${params.toString()}`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to fetch cloud sounds');
    }
    return res.json();
  }

  async uploadCloudSound(
    file: File,
    name: string,
    category: string = 'General',
    duration: number = 0
  ): Promise<CloudSoundItem> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('duration', duration.toString());
    formData.append('file', file);

    const headers: Record<string, string> = {};
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }

    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/sounds/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to upload audio file');
    }
    return res.json();
  }

  async deleteCloudSound(id: string): Promise<void> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/sounds/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to delete cloud sound');
    }
  }

  async getCloudStorageStatus(): Promise<CloudStorageStatus> {
    try {
      const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/sounds/status`);
      if (!res.ok) return { r2Configured: false, bucket: '', provider: 'Offline' };
      return res.json();
    } catch {
      return { r2Configured: false, bucket: '', provider: 'Offline' };
    }
  }
}

export interface CloudSoundItem {
  id: string;
  name: string;
  category: string;
  storageKey: string;
  audioUrl: string;
  duration: number;
  sizeBytes: number;
  uploaderId?: string | null;
  uploaderName?: string | null;
  createdAt: string;
}

export interface CloudStorageStatus {
  r2Configured: boolean;
  bucket: string;
  provider: string;
}

export const api = new ApiClient();
