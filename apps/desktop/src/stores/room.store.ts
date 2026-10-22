import { create } from 'zustand';
import { RoomDto } from '@nightshift/shared';
import { api } from '../lib/api';

interface RoomState {
  rooms: RoomDto[];
  activeRoomId: string | null;
  selectedRoomId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchRooms: () => Promise<void>;
  selectRoom: (roomId: string) => void;
  setActiveRoom: (roomId: string | null) => void;
  createRoom: (name: string, description?: string) => Promise<RoomDto | null>;
  getActiveRoom: () => RoomDto | undefined;
  getSelectedRoom: () => RoomDto | undefined;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  selectedRoomId: null,
  isLoading: false,
  error: null,

  fetchRooms: async () => {
    set({ isLoading: true, error: null });
    try {
      const rooms = await api.getRooms();
      set({ rooms, isLoading: false });

      // If no room is selected yet, select the first room
      if (!get().selectedRoomId && rooms.length > 0) {
        set({ selectedRoomId: rooms[0].id });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to load rooms', isLoading: false });
    }
  },

  selectRoom: (roomId: string) => {
    set({ selectedRoomId: roomId });
  },

  setActiveRoom: (roomId: string | null) => {
    set({ activeRoomId: roomId });
    if (roomId) {
      set({ selectedRoomId: roomId });
    }
  },

  createRoom: async (name: string, description?: string) => {
    set({ isLoading: true, error: null });
    try {
      // Direct API create
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create room');
      }
      const data = await res.json();
      const newRoom = data.room;
      set((state) => ({
        rooms: [...state.rooms, newRoom],
        selectedRoomId: newRoom.id,
        isLoading: false,
      }));
      return newRoom;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create room', isLoading: false });
      return null;
    }
  },

  getActiveRoom: () => {
    const { rooms, activeRoomId } = get();
    return rooms.find((r) => r.id === activeRoomId);
  },

  getSelectedRoom: () => {
    const { rooms, selectedRoomId } = get();
    return rooms.find((r) => r.id === selectedRoomId);
  },
}));
