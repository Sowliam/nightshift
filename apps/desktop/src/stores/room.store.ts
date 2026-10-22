import { create } from 'zustand';

export interface RoomDto {
  id: string;
  name: string;
  description?: string | null;
  type?: 'text' | 'voice';
  participantCount?: number;
}

interface RoomState {
  rooms: RoomDto[];
  activeRoomId: string | null;
  selectedRoomId: string | null;
  joiningRoomId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchRooms: () => Promise<void>;
  selectRoom: (roomId: string) => void;
  setActiveRoom: (roomId: string | null) => void;
  setJoiningRoom: (roomId: string | null) => void;
  createRoom: (name: string, description?: string) => Promise<RoomDto | null>;
  getActiveRoom: () => RoomDto | undefined;
  getSelectedRoom: () => RoomDto | undefined;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  selectedRoomId: null,
  joiningRoomId: null,
  isLoading: false,
  error: null,

  fetchRooms: async () => {
    set({ rooms: [], isLoading: false, error: null });
  },

  selectRoom: (roomId: string) => {
    set({ selectedRoomId: roomId });
  },

  setActiveRoom: (roomId: string | null) => {
    set({ activeRoomId: roomId });
    if (roomId) {
      set({ selectedRoomId: roomId, joiningRoomId: null });
    }
  },

  setJoiningRoom: (roomId: string | null) => {
    set({ joiningRoomId: roomId });
  },

  createRoom: async () => {
    return null;
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
