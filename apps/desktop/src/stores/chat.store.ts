import { create } from 'zustand';
import { MessageDto } from '@nightshift/shared';
import { api } from '../lib/api';

interface ChatState {
  messagesByChannel: Record<string, MessageDto[]>;
  isLoading: boolean;
  loadMessages: (channelId: string) => Promise<void>;
  addMessage: (channelId: string, message: MessageDto) => void;
  sendMessage: (
    channelId: string,
    content: string,
    attachmentUrl?: string,
    attachmentType?: string
  ) => Promise<MessageDto | null>;
  uploadImage: (file: File) => Promise<{ url: string; filename: string } | null>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByChannel: {},
  isLoading: false,

  loadMessages: async (channelId: string) => {
    try {
      const messages = await api.getChannelMessages(channelId);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: messages,
        },
      }));
    } catch (err) {
      console.warn('Failed to load channel messages:', err);
    }
  },

  addMessage: (channelId: string, message: MessageDto) => {
    set((state) => {
      const currentList = state.messagesByChannel[channelId] || [];
      if (currentList.some((m) => m.id === message.id)) {
        return state;
      }
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...currentList, message],
        },
      };
    });
  },

  sendMessage: async (
    channelId: string,
    content: string,
    attachmentUrl?: string,
    attachmentType?: string
  ) => {
    try {
      const message = await api.sendMessage(channelId, content, attachmentUrl, attachmentType);
      get().addMessage(channelId, message);
      return message;
    } catch (err) {
      console.error('Failed to send message:', err);
      return null;
    }
  },

  uploadImage: async (file: File) => {
    try {
      const res = await api.uploadImage(file);
      return { url: res.url, filename: res.filename };
    } catch (err) {
      console.error('Failed to upload image:', err);
      return null;
    }
  },
}));
