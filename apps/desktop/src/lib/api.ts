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

export const DEFAULT_PRODUCTION_API = 'https://nightshift-server-cfch.onrender.com';

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
      // If user had previously stored vercel origin or same-origin, upgrade them to the real backend
      if (cleanCustom !== window.location.origin && !cleanCustom.includes('vercel.app')) {
        return cleanCustom;
      }
    }

    // 3. Prevent Mixed Content block on HTTPS deployments (e.g. Vercel)
    // Default to the live Render cloud backend
    if (
      window.location.protocol === 'https:' ||
      window.location.hostname.includes('vercel.app')
    ) {
      return DEFAULT_PRODUCTION_API;
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

  private async fetchWithHandling(url: string, init?: RequestInit): Promise<Response> {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (isHttps && url.startsWith('http://')) {
      throw new Error(
        'Browser Blocked Insecure Connection: Cannot connect to an insecure http:// address from an https:// website. Please set your Backend Server URL to your secure HTTPS URL (e.g. https://your-server.onrender.com or https://...up.railway.app).'
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        ...init,
        signal: init?.signal || controller.signal,
      });
      clearTimeout(timeoutId);

      const renderRouting = res.headers.get('x-render-routing');
      if (res.status === 404 && (renderRouting === 'blocked-render-subdomain' || (url.includes('.onrender.com') && !url.includes('/api/health')))) {
        // If it's a blocked subdomain on Render
        if (renderRouting === 'blocked-render-subdomain') {
          throw new Error(
            `Render Error: Render is blocking requests to this URL (x-render-routing: blocked-render-subdomain). In your Render Dashboard: 1) Verify the service is not Suspended, 2) In Settings -> Custom Domains, ensure 'Render Subdomain' is Enabled, 3) Confirm the exact URL.`
          );
        }
      }

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('text/html') && url.includes('/api/')) {
        throw new Error(
          `Backend connection error: Received HTML instead of API JSON. Please configure your Backend API URL (Render or Railway) in Settings or click "Change URL" above.`
        );
      }
      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(
          `Backend connection timed out (20s). Render free instances take ~50s to wake up on first request, or the backend is currently offline.`
        );
      }
      if (err.message && (err.message.includes('Browser Blocked') || err.message.includes('Backend connection') || err.message.includes('Render Error'))) {
        throw err;
      }
      if (isHttps && url.startsWith('http://')) {
        throw new Error(
          'Browser security blocked connection to http:// backend. Please change Backend URL to your HTTPS deployment.'
        );
      }
      throw new Error(
        `Cannot reach backend server at ${this.getBaseUrl()}. Please ensure your backend is online and the URL is correct.`
      );
    }
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

  async updateProfile(displayName: string): Promise<UserDto> {
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/auth/profile`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify({ displayName }),
    });

    if (!res.ok) {
      throw await this.parseError(res, 'Failed to update profile');
    }

    const data = await res.json();
    return data.user;
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
    const res = await this.fetchWithHandling(`${this.getBaseUrl()}/api/invites/join`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: JSON.stringify({ code: code.trim() }),
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
}

export const api = new ApiClient();
