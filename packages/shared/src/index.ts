import { z } from 'zod';

// ==========================================
// Product Constants & Theme
// ==========================================

export const APP_NAME = 'NIGHTSHIFT';
export const APP_VERSION = '0.1.2';

export const THEME = {
  bgMain: '#0A0908',
  bgSecondary: '#121110',
  bgElevated: '#1C1A18',
  border: '#292623',
  textPrimary: '#F1FAEE',
  textSecondary: '#A8A39D',
  textMuted: '#736E68',
  highlight: '#F1FAEE',
  highlightText: '#0A0908',
  accentBright: '#52B788',
  destructive: '#E05252',
} as const;

// ==========================================
// Zod Schemas
// ==========================================

export const RegisterUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username cannot exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(32, 'Display name cannot exceed 32 characters'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password cannot exceed 100 characters'),
});

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

export const LoginUserSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginUserInput = z.infer<typeof LoginUserSchema>;

export const UpdateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Display name must be at least 2 characters')
    .max(32, 'Display name cannot exceed 32 characters')
    .optional(),
  avatarUrl: z.string().nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const CreateServerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Server name must be at least 2 characters')
    .max(50, 'Server name cannot exceed 50 characters'),
  description: z.string().trim().max(200).optional(),
});

export type CreateServerInput = z.infer<typeof CreateServerSchema>;

export const CreateChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Channel name must be at least 2 characters')
    .max(50, 'Channel name cannot exceed 50 characters'),
  type: z.enum(['text', 'voice']).default('text'),
});

export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;

export const CreateInviteSchema = z.object({
  maxUses: z.number().int().min(0).default(0), // 0 = unlimited
  expiresInHours: z.number().int().min(0).default(72), // 0 = never expire
});

export type CreateInviteInput = z.infer<typeof CreateInviteSchema>;

export const JoinInviteSchema = z.object({
  code: z.string().trim().min(4, 'Invalid invitation code'),
});

export type JoinInviteInput = z.infer<typeof JoinInviteSchema>;

export const ModerateMemberSchema = z.object({
  action: z.enum(['mute', 'unmute', 'deafen', 'undeafen', 'kick', 'ban', 'unban']),
  reason: z.string().trim().max(200).optional(),
});

export type ModerateMemberInput = z.infer<typeof ModerateMemberSchema>;

export const SendMessageSchema = z.object({
  content: z.string().trim().max(2000, 'Message cannot exceed 2000 characters').default(''),
  attachmentUrl: z.string().optional(),
  attachmentType: z.string().optional(),
}).refine(data => data.content.length > 0 || !!data.attachmentUrl, {
  message: 'Message must have text or an attachment',
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ==========================================
// Shared DTOs and Interfaces
// ==========================================

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
  lastSeenAt: string;
  isOnline?: boolean;
}

export interface AuthResponse {
  user: UserDto;
  token: string;
}

export interface ServerSummaryDto {
  id: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  ownerId: string;
  channelCount: number;
  memberCount: number;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}

export interface VoiceParticipantDto {
  identity: string;
  name: string;
  isScreenSharing?: boolean;
}

export interface ChannelDto {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  order: number;
  createdAt: string;
  unreadCount?: number;
  hasMention?: boolean;
  participantCount?: number;
  voiceParticipants?: VoiceParticipantDto[];
}

export interface ServerMemberDto {
  id: string;
  serverId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'owner' | 'admin' | 'member';
  isServerMuted: boolean;
  isServerDeafened: boolean;
  isOnline: boolean;
  isSpeaking?: boolean;
  joinedAt: string;
}

export interface ServerInviteDto {
  id: string;
  code: string;
  serverId: string;
  serverName: string;
  creatorId: string;
  creatorName: string;
  maxUses: number;
  usesCount: number;
  expiresAt?: string | null;
  isValid: boolean;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  content: string;
  channelId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  createdAt: string;
  isMine?: boolean;
}

export interface VoiceJoinResponse {
  channel: ChannelDto;
  server: ServerSummaryDto;
  livekitUrl: string;
  token: string;
  user: UserDto;
}

export type ScreenShareResolution = '720p' | '1080p' | '1440p' | '4k' | 'source';
export type ScreenShareFramerate = 15 | 30 | 60;
export type ScreenShareContentPreset = 'motion' | 'detail';

export interface ScreenShareOptions {
  resolution?: ScreenShareResolution;
  frameRate?: ScreenShareFramerate;
  preset?: ScreenShareContentPreset;
  includeAudio?: boolean;
}

export interface DesktopScreenSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl?: string;
  displayId?: string;
  isWindow: boolean;
}

export type InputProfileType = 'voice-isolation' | 'studio' | 'custom';

export interface UserVoiceSettings {
  inputProfile: InputProfileType;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  autoSensitivity: boolean;
  sensitivityThreshold: number; // 0-100
  noiseSuppression: 'none' | 'standard' | 'krisp';
  echoCancellation: boolean;
  pushToTalk: boolean;
  pushToTalkKey: string;
  isSelfMuted: boolean;
  isSelfDeafened: boolean;
}

export const DEFAULT_VOICE_SETTINGS: UserVoiceSettings = {
  inputProfile: 'custom',
  audioInputDeviceId: 'default',
  audioOutputDeviceId: 'default',
  inputVolume: 100,
  outputVolume: 100,
  autoSensitivity: true,
  sensitivityThreshold: 40,
  noiseSuppression: 'standard',
  echoCancellation: true,
  pushToTalk: false,
  pushToTalkKey: 'Space',
  isSelfMuted: false,
  isSelfDeafened: false,
};

// Production deployment constants
export const DEFAULT_PRODUCTION_API = 'https://dist-three-gray-67.vercel.app';
export const VERCEL_PROXY_API = 'https://dist-three-gray-67.vercel.app';
export const CLOUDFLARE_PROXY_API = 'https://nightshift-api.gemesowl.workers.dev';
export const RENDER_DIRECT_API = 'https://nightshift-server-cfch.onrender.com';
export const DEFAULT_PRODUCTION_WEB = 'https://dist-three-gray-67.vercel.app';

/**
 * Extracts a clean 8-character invite code from raw codes, URLs, hash links, query parameters, or deep links.
 * Examples:
 *   - "k8X9mP21" -> "k8X9mP21"
 *   - "https://dist-three-gray-67.vercel.app#invite=k8X9mP21" -> "k8X9mP21"
 *   - "http://localhost:5173#invite=k8X9mP21" -> "k8X9mP21"
 *   - "https://dist-three-gray-67.vercel.app?invite=k8X9mP21" -> "k8X9mP21"
 *   - "https://dist-three-gray-67.vercel.app/invite/k8X9mP21" -> "k8X9mP21"
 *   - "nightshift://invite/k8X9mP21" -> "k8X9mP21"
 */
export function extractInviteCode(input: string): string {
  if (!input) return '';
  let clean = input.trim();

  // Strip prefixes like "Private Code: ", "Code: ", "Invite: ", or Persian "کد: "
  clean = clean.replace(/^(private\s*code|invite\s*code|code|invite|کد|کد دعوت)[\s:=]+/i, '').trim();

  if (clean.includes('#invite=')) {
    clean = clean.split('#invite=')[1].split('&')[0];
  } else if (clean.includes('?invite=')) {
    clean = clean.split('?invite=')[1].split('&')[0];
  } else if (clean.includes('&invite=')) {
    clean = clean.split('&invite=')[1].split('&')[0];
  } else if (clean.includes('/invite/')) {
    clean = clean.split('/invite/')[1].split(/[/?&#]/)[0];
  } else if (clean.includes('nightshift://invite/')) {
    clean = clean.split('nightshift://invite/')[1].split(/[/?&#]/)[0];
  }

  // Remove any lingering URL fragments or trailing slashes
  clean = clean.split(/[?&#/]/)[0].trim();
  return clean;
}
