import { z } from 'zod';

// ==========================================
// Product Constants & Theme
// ==========================================

export const APP_NAME = 'NIGHTSHIFT';
export const APP_VERSION = '0.1.0';

export const THEME = {
  bgMain: '#17191C',
  bgSecondary: '#1D2024',
  bgElevated: '#24282D',
  border: '#30343A',
  textPrimary: '#F0F1ED',
  textSecondary: '#969CA5',
  accent: '#C4D36A',
  accentHover: '#D5E57B',
  destructive: '#E05252',
  destructiveHover: '#F06868',
} as const;

export const DEFAULT_ROOMS = [
  {
    name: 'Late lobby',
    description: 'Casual nighttime hanging out and gaming',
  },
  {
    name: 'Ranked queue',
    description: 'Competitive comms, low distraction',
  },
  {
    name: 'Watch party',
    description: 'Stream screens, YouTube, and movies',
  },
  {
    name: 'Just chatting',
    description: 'Open mic discussions and banter',
  },
] as const;

// ==========================================
// Zod Schemas
// ==========================================

export const RegisterUserSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(32, 'Display name cannot exceed 32 characters'),
  deviceId: z.string().trim().min(8, 'Invalid device identifier'),
});

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

export const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(32, 'Display name cannot exceed 32 characters'),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const CreateRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Room name must be at least 2 characters')
    .max(50, 'Room name cannot exceed 50 characters'),
  description: z.string().trim().max(200).optional(),
});

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const CreateInvitationSchema = z.object({
  roomId: z.string().optional(),
  maxUses: z.number().int().positive().default(10),
  expiresInHours: z.number().int().positive().default(72),
});

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

export const ValidateInvitationSchema = z.object({
  code: z.string().trim().min(4, 'Invalid invitation code'),
});

export type ValidateInvitationInput = z.infer<typeof ValidateInvitationSchema>;

// ==========================================
// Shared DTOs and Interfaces
// ==========================================

export interface UserDto {
  id: string;
  displayName: string;
  deviceId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  participantCount: number;
  createdAt: string;
}

export interface InvitationDto {
  id: string;
  code: string;
  roomId?: string | null;
  createdByUserId: string;
  maxUses: number;
  usesCount: number;
  isValid: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface JoinRoomResponse {
  room: RoomDto;
  livekitUrl: string;
  token: string;
  user: UserDto;
}

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  audioLevel: number;
  joinedAt?: string;
}

export interface DesktopScreenSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  displayId?: string;
  isWindow: boolean;
}

export interface UserSettings {
  displayName: string;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  isDeafened: boolean;
  theme: 'dark';
  inputVolume: number;
  outputVolume: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: '',
  audioInputDeviceId: 'default',
  audioOutputDeviceId: 'default',
  isDeafened: false,
  theme: 'dark',
  inputVolume: 100,
  outputVolume: 100,
  noiseSuppression: true,
  echoCancellation: true,
};
