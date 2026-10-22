import { create } from 'zustand';
import {
  ServerSummaryDto,
  ChannelDto,
  ServerMemberDto,
  ServerInviteDto,
} from '@nightshift/shared';
import { api } from '../lib/api';

interface ServerState {
  servers: ServerSummaryDto[];
  activeServerId: string | null;
  channels: ChannelDto[];
  activeChannelId: string | null;
  activeVoiceChannelId: string | null;
  joiningVoiceChannelId: string | null;
  members: ServerMemberDto[];
  invites: ServerInviteDto[];
  unreadMentions: Set<string>; // channelIds with unread mentions
  isLoading: boolean;
  error: string | null;

  fetchServers: () => Promise<void>;
  selectServer: (serverId: string) => Promise<void>;
  createServer: (name: string, description?: string) => Promise<ServerSummaryDto | null>;
  deleteServer: (serverId: string) => Promise<boolean>;
  leaveServer: (serverId: string) => Promise<boolean>;

  fetchChannels: (serverId: string) => Promise<void>;
  createChannel: (serverId: string, name: string, type: 'text' | 'voice') => Promise<ChannelDto | null>;
  deleteChannel: (serverId: string, channelId: string) => Promise<boolean>;
  selectChannel: (channelId: string) => void;

  setActiveVoiceChannel: (channelId: string | null) => void;
  setJoiningVoiceChannel: (channelId: string | null) => void;

  fetchMembers: (serverId: string) => Promise<void>;
  moderateMember: (
    serverId: string,
    targetUserId: string,
    action: 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'kick' | 'ban' | 'unban',
    reason?: string
  ) => Promise<boolean>;

  fetchInvites: (serverId: string) => Promise<void>;
  createInvite: (serverId: string, maxUses?: number, expiresInHours?: number) => Promise<ServerInviteDto | null>;
  revokeInvite: (serverId: string, code: string) => Promise<boolean>;
  joinByInvite: (code: string) => Promise<ServerSummaryDto | null>;

  addMention: (channelId: string) => void;
  clearMention: (channelId: string) => void;
  clearMentions: (channelId: string) => void;
  getActiveServer: () => ServerSummaryDto | null;
  getActiveChannel: () => ChannelDto | null;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  channels: [],
  activeChannelId: null,
  activeVoiceChannelId: null,
  joiningVoiceChannelId: null,
  members: [],
  invites: [],
  unreadMentions: new Set(),
  isLoading: false,
  error: null,

  fetchServers: async () => {
    try {
      const servers = await api.getServers();
      set({ servers });

      const { activeServerId } = get();
      if (!activeServerId && servers.length > 0) {
        await get().selectServer(servers[0].id);
      } else if (activeServerId && !servers.some((s) => s.id === activeServerId)) {
        if (servers.length > 0) {
          await get().selectServer(servers[0].id);
        } else {
          set({
            activeServerId: null,
            channels: [],
            activeChannelId: null,
            members: [],
            invites: [],
          });
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch servers:', err);
    }
  },

  selectServer: async (serverId: string) => {
    set({ activeServerId: serverId });
    await Promise.all([get().fetchChannels(serverId), get().fetchMembers(serverId)]);

    const { channels } = get();
    const defaultText = channels.find((c) => c.type === 'text') || channels[0];
    if (defaultText) {
      get().selectChannel(defaultText.id);
    }
  },

  createServer: async (name: string, description?: string) => {
    try {
      const { server } = await api.createServer(name, description);
      await get().fetchServers();
      await get().selectServer(server.id);
      return server;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create server' });
      return null;
    }
  },

  deleteServer: async (serverId: string) => {
    try {
      await api.deleteServer(serverId);
      await get().fetchServers();
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete server' });
      return false;
    }
  },

  leaveServer: async (serverId: string) => {
    try {
      await api.leaveServer(serverId);
      await get().fetchServers();
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to leave server' });
      return false;
    }
  },

  fetchChannels: async (serverId: string) => {
    try {
      const channels = await api.getChannels(serverId);
      set({ channels });
    } catch (err: any) {
      console.warn('Failed to fetch channels:', err);
    }
  },

  createChannel: async (serverId: string, name: string, type: 'text' | 'voice') => {
    try {
      const channel = await api.createChannel(serverId, name, type);
      await get().fetchChannels(serverId);
      return channel;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create channel' });
      return null;
    }
  },

  deleteChannel: async (serverId: string, channelId: string) => {
    try {
      await api.deleteChannel(serverId, channelId);
      const { activeChannelId } = get();
      await get().fetchChannels(serverId);
      if (activeChannelId === channelId) {
        const { channels } = get();
        const next = channels.find((c) => c.type === 'text') || channels[0];
        if (next) {
          get().selectChannel(next.id);
        } else {
          set({ activeChannelId: null });
        }
      }
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete channel' });
      return false;
    }
  },

  selectChannel: (channelId: string) => {
    set({ activeChannelId: channelId });
    get().clearMention(channelId);
  },

  setActiveVoiceChannel: (channelId: string | null) => {
    set({ activeVoiceChannelId: channelId });
  },

  setJoiningVoiceChannel: (channelId: string | null) => {
    set({ joiningVoiceChannelId: channelId });
  },

  fetchMembers: async (serverId: string) => {
    try {
      const members = await api.getServerMembers(serverId);
      set({ members });
    } catch (err: any) {
      console.warn('Failed to fetch members:', err);
    }
  },

  moderateMember: async (
    serverId: string,
    targetUserId: string,
    action: 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'kick' | 'ban' | 'unban',
    reason?: string
  ) => {
    try {
      await api.moderateMember(serverId, targetUserId, action, reason);
      await get().fetchMembers(serverId);
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to execute moderation action' });
      return false;
    }
  },

  fetchInvites: async (serverId: string) => {
    try {
      const invites = await api.getServerInvites(serverId);
      set({ invites });
    } catch (err: any) {
      console.warn('Failed to fetch invites:', err);
    }
  },

  createInvite: async (serverId: string, maxUses = 0, expiresInHours = 72) => {
    try {
      const invite = await api.createInvite(serverId, maxUses, expiresInHours);
      await get().fetchInvites(serverId);
      return invite;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create invite' });
      return null;
    }
  },

  revokeInvite: async (serverId: string, code: string) => {
    try {
      await api.revokeInvite(serverId, code);
      await get().fetchInvites(serverId);
      return true;
    } catch (err: any) {
      set({ error: err.message || 'Failed to revoke invite' });
      return false;
    }
  },

  joinByInvite: async (code: string) => {
    try {
      const server = await api.joinServerByInvite(code);
      await get().fetchServers();
      await get().selectServer(server.id);
      return server;
    } catch (err: any) {
      set({ error: err.message || 'Failed to join server' });
      return null;
    }
  },

  addMention: (channelId: string) => {
    set((state) => {
      const next = new Set(state.unreadMentions);
      next.add(channelId);
      return { unreadMentions: next };
    });
  },

  clearMention: (channelId: string) => {
    set((state) => {
      const next = new Set(state.unreadMentions);
      next.delete(channelId);
      return { unreadMentions: next };
    });
  },

  clearMentions: (channelId: string) => {
    get().clearMention(channelId);
  },

  getActiveServer: () => {
    const { servers, activeServerId } = get();
    return servers.find((s) => s.id === activeServerId) || null;
  },

  getActiveChannel: () => {
    const { channels, activeChannelId } = get();
    return channels.find((c) => c.id === activeChannelId) || null;
  },
}));
