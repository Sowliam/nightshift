import React, { useState } from 'react';
import { MicOff, Headphones, Monitor, Radio, Loader2, LogIn, Play, X, VolumeX, Volume2, MoreVertical, PhoneOff, Music, Square } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { useServerStore } from '../../stores/server.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { UserContextMenu, UserContextMenuTarget } from '../common/UserContextMenu';
import { Track } from 'livekit-client';
import { getFullAvatarUrl } from '../../lib/api';
import { PingIndicator } from '../common/PingIndicator';

interface VoiceParticipant {
  identity: string;
  name: string;
  avatarUrl?: string | null;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
}

interface VoiceGridProps {
  onOpenScreenShareModal: () => void;
  onJoinVoice?: () => void;
  isRoomActive?: boolean;
}

export const VoiceGrid: React.FC<VoiceGridProps> = ({
  onOpenScreenShareModal,
  onJoinVoice,
  isRoomActive,
}) => {
  const { user } = useAuthStore();
  const {
    localParticipant,
    remoteParticipants,
    activeSpeakers,
    isLocallySpeaking,
    isMuted,
    isDeafened,
    isScreenSharing,
    availableScreenShares,
    watchedScreenShareIds,
    startWatchingStream,
    stopWatchingStream,
    stopScreenShare,
    disconnect,
    activeSoundboardPlayers,
    currentPing,
    participantPings,
    canPlaybackAudio,
    startAudio,
  } = useLiveKitStore();
  const { getActiveRoom, getSelectedRoom, joiningRoomId } = useRoomStore();
  const members = useServerStore((s) => s.members);
  const localMutedUsers = useSettingsStore((s) => s.localMutedUsers);
  const participantVolumes = useSettingsStore((s) => s.participantVolumes);
  const soundboardVolumes = useSettingsStore((s) => s.soundboardVolumes);
  const localMutedSoundboards = useSettingsStore((s) => s.localMutedSoundboards);
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const stopAllSounds = useSoundboardStore((s) => s.stopAll);

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    target: UserContextMenuTarget | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    target: null,
  });

  const activeRoom = getActiveRoom();
  const selectedRoom = getSelectedRoom();
  const currentRoom = activeRoom || selectedRoom;

  // Build the list of real connected participants
  const participants: VoiceParticipant[] = [];

  // Local user
  if (localParticipant) {
    const localIdentity = localParticipant.identity || user?.id || 'local-user';
    const localSpeaking =
      isLocallySpeaking ||
      activeSpeakers.has(localIdentity) ||
      localParticipant.isSpeaking;

    const localMember = members.find((m) => m.userId === localIdentity || m.username === user?.username);

    participants.push({
      identity: localIdentity,
      name: user?.displayName || localParticipant.name || 'You',
      avatarUrl: user?.avatarUrl || localMember?.avatarUrl,
      isLocal: true,
      isSpeaking: !isMuted && localSpeaking,
      isMuted: isMuted,
      isDeafened: isDeafened,
      isScreenSharing: isScreenSharing,
    });
  }

  // Remote participants
  remoteParticipants.forEach((p) => {
    const isRemoteMuted = !Array.from(p.audioTrackPublications.values()).some(
      (pub) => pub.isSubscribed && !pub.isMuted
    );
    const isRemoteSharing = Array.from(p.videoTrackPublications.values()).some(
      (pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted
    );

    const remoteMember = members.find((m) => m.userId === p.identity || m.username === p.name || m.displayName === p.name);

    participants.push({
      identity: p.identity,
      name: p.name || p.identity,
      avatarUrl: remoteMember?.avatarUrl,
      isLocal: false,
      isSpeaking: activeSpeakers.has(p.identity) || p.isSpeaking,
      isMuted: isRemoteMuted,
      isDeafened: false,
      isScreenSharing: isRemoteSharing,
    });
  });

  // Stable ordering: Local user first, then sorted by identity
  participants.sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    return a.identity.localeCompare(b.identity);
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const count = participants.length;

  // If no one is connected or still joining
  if (count === 0) {
    const isConnectingVoice = !!joiningRoomId || !!useServerStore.getState().joiningVoiceChannelId;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-3xl bg-bg-elevated border border-border-subtle flex items-center justify-center text-text-muted mb-4 shadow-card">
          <Radio className="w-8 h-8 text-highlight animate-pulse" />
        </div>
        <h3 className="text-base font-semibold text-text-primary mb-1">
          {isConnectingVoice ? 'Connecting to Voice...' : 'Voice Channel is Empty'}
        </h3>
        <p className="text-xs text-text-secondary max-w-sm leading-relaxed mb-6">
          {isConnectingVoice
            ? 'Establishing secure WebRTC voice connection to the server.'
            : `Click below or select #${currentRoom?.name || 'channel'} in the sidebar to join the conversation.`}
        </p>

        {!isRoomActive && onJoinVoice && (
          <div className="flex items-center gap-2">
            <button
              onClick={onJoinVoice}
              disabled={isConnectingVoice}
              className="px-6 py-2.5 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {isConnectingVoice ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Join Voice Channel</span>
                </>
              )}
            </button>
            {isConnectingVoice && (
              <button
                onClick={() => disconnect()}
                className="px-4 py-2.5 rounded-xl bg-destructive/15 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Cancel Connection / Disconnect"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Determine grid layout classes based on user count
  let gridLayoutClass = '';
  if (count === 1) {
    gridLayoutClass = 'flex items-center justify-center';
  } else if (count === 2) {
    gridLayoutClass = 'grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-fr';
  } else if (count <= 4) {
    gridLayoutClass = 'grid grid-cols-2 gap-4 auto-rows-fr';
  } else if (count <= 6) {
    gridLayoutClass = 'grid grid-cols-2 md:grid-cols-3 gap-4 auto-rows-fr';
  } else {
    gridLayoutClass = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-fr';
  }

  const unwatchedShares = availableScreenShares.filter(
    (s) => !s.isLocal && !watchedScreenShareIds.has(s.participantIdentity)
  );

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto select-none min-h-0 bg-bg-main">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between mb-4 shrink-0 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-primary tracking-wide">
            {currentRoom?.name || 'Voice'}
          </span>
          <span className="text-[10px] text-text-muted font-medium bg-bg-elevated px-2 py-0.5 rounded-full border border-border-subtle">
            {count} {count === 1 ? 'member' : 'members'}
          </span>
        </div>

        <button
          onClick={onOpenScreenShareModal}
          className="px-3.5 py-1.5 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
          title="Share screen or application window"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Share Screen</span>
        </button>
      </div>

      {/* Browser Autoplay Blocked Banner */}
      {!canPlaybackAudio && (
        <div
          onClick={startAudio}
          className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-between shrink-0 shadow-lg cursor-pointer hover:bg-amber-500/20 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <VolumeX className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300">
                  صدا توسط مرورگر مسدود شده است (Autoplay Blocked)
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                برای فعال‌سازی صدای اعضا و موزیک، روی این نوار یا هر جای صفحه کلیک کنید.
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              startAudio();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
          >
            <Volume2 className="w-4 h-4" />
            <span>فعال‌سازی صدا</span>
          </button>
        </div>
      )}

      {/* Unwatched Screen Share Notification Banner */}
      {unwatchedShares.length > 0 && (
        <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-red-500/15 via-highlight/10 to-bg-elevated border border-red-500/30 flex items-center justify-between shrink-0 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
              <Monitor className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary">
                  {unwatchedShares.map((s) => s.participantName).join(', ')}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-red-500/30 text-red-400 border border-red-500/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {unwatchedShares.length === 1
                  ? 'is sharing screen. You can choose to join and watch their live stream.'
                  : 'are sharing screens. Click below to watch their live stream.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unwatchedShares.map((s) => (
              <button
                key={s.participantIdentity}
                onClick={() => startWatchingStream(s.participantIdentity)}
                className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                title={`Watch ${s.participantName}'s screen share`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Watch {s.participantName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`w-full flex-1 min-h-0 ${gridLayoutClass}`}>
        {participants.map((p) => {
          const isLocallyMuted = !!localMutedUsers[p.identity];
          const customVolume = participantVolumes[p.identity];
          const hasCustomVolume = customVolume !== undefined && customVolume !== 100 && !isLocallyMuted;

          const remotePlaying = !p.isLocal ? activeSoundboardPlayers[p.identity] : null;
          const isPlayingSound = p.isLocal ? localActiveSounds.length > 0 : !!remotePlaying;
          const soundTitle = p.isLocal ? localActiveSounds[0]?.name : remotePlaying?.soundName;
          const isSoundboardMuted = !p.isLocal && !!localMutedSoundboards[p.identity];
          const customSoundboardVol = soundboardVolumes[p.identity];
          const hasCustomSoundboardVol = customSoundboardVol !== undefined && customSoundboardVol !== 100 && !isSoundboardMuted;

          const openUserMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              isOpen: true,
              x: e.clientX,
              y: e.clientY,
              target: {
                identity: p.identity,
                name: p.name,
                isLocal: p.isLocal,
                isScreenSharing: p.isScreenSharing,
              },
            });
          };

          return (
            <div
              key={p.identity}
              onContextMenu={openUserMenu}
              className={`relative rounded-2xl bg-bg-elevated border flex flex-col items-center justify-center overflow-hidden transition-all duration-200 cursor-context-menu ${
                count === 1
                  ? 'w-full max-w-xl h-[340px] md:h-[400px] shadow-card'
                  : 'w-full h-full min-h-[160px] shadow-subtle'
              } ${
                isPlayingSound
                  ? 'border-accent-bright/70 ring-2 ring-accent-bright/40 shadow-[0_0_20px_rgba(82,183,136,0.3)]'
                  : p.isSpeaking
                  ? 'border-online ring-2 ring-online/50 shadow-[0_0_16px_rgba(82,183,136,0.25)]'
                  : 'border-border-subtle hover:border-border-strong'
              }`}
            >
              {/* Top-Left Now Playing Sound / Music Badge */}
              {isPlayingSound && (
                <div
                  onClick={openUserMenu}
                  className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-accent-bright/20 backdrop-blur-md border border-accent-bright/50 text-accent-bright font-bold text-[11px] shadow-lg animate-pulse z-10 cursor-pointer hover:bg-accent-bright/30 transition-all max-w-[65%]"
                  title={p.isLocal ? `You are playing: ${soundTitle}` : `${p.name} is playing: ${soundTitle} (Right-click to adjust volume)`}
                >
                  <Music className="w-3.5 h-3.5 animate-bounce shrink-0" />
                  <span className="truncate">{soundTitle}</span>
                  {p.isLocal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopAllSounds();
                      }}
                      className="ml-1 p-0.5 rounded bg-destructive hover:bg-destructive/80 text-white cursor-pointer shrink-0"
                      title="Stop playing sound"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                    </button>
                  )}
                </div>
              )}

              {/* Top-Right Quick Menu Button for easy touch/mouse access */}
              <button
                onClick={openUserMenu}
                className="absolute top-2.5 right-2.5 p-1 rounded-lg bg-black/40 hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors cursor-pointer z-10"
                title="User Options (Right-click or click)"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {/* Center Avatar with Speaking Glow */}
              <div className="relative">
                <div
                  className={`rounded-full flex items-center justify-center font-black tracking-wider transition-all duration-150 select-none overflow-hidden ${
                    count === 1 ? 'w-24 h-24 text-2xl' : count <= 4 ? 'w-20 h-20 text-xl' : 'w-14 h-14 text-sm'
                  } ${
                    p.isSpeaking
                      ? 'bg-highlight text-highlight-text ring-4 ring-online shadow-[0_0_20px_rgba(82,183,136,0.4)]'
                      : 'bg-bg-main border border-border-subtle text-highlight'
                  }`}
                >
                  {p.avatarUrl ? (
                    <img
                      src={getFullAvatarUrl(p.avatarUrl)!}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(p.name)
                  )}
                </div>

                {/* Speaking Wave Pulse */}
                {p.isSpeaking && (
                  <span className="absolute -inset-1 rounded-full border-2 border-accent-bright/60 animate-ping pointer-events-none" />
                )}
              </div>

              {/* Bottom Info Bar inside Card */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                {/* User Name Pill */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-border-subtle/80 max-w-[80%] pointer-events-auto">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {p.name} {p.isLocal && <span className="text-[10px] text-text-muted font-normal">(You)</span>}
                  </span>
                  <PingIndicator ping={p.isLocal ? currentPing : (participantPings[p.identity] ?? participantPings[p.name])} />
                </div>

                {/* Status Badges: Local Mute, Custom Volume, Screen Share, Deafen, Mic Muted */}
                <div className="flex items-center gap-1.5 pointer-events-auto">
                  {/* Local Soundboard Mute Badge */}
                  {isSoundboardMuted && !p.isLocal && (
                    <div
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-destructive/25 border border-destructive/50 text-destructive text-[10px] font-bold"
                      title="Music/Sound effects muted for you"
                    >
                      <Music className="w-3 h-3 line-through" />
                      <span className="hidden sm:inline">Sounds Muted</span>
                    </div>
                  )}

                  {/* Custom Soundboard Volume Badge */}
                  {hasCustomSoundboardVol && !p.isLocal && (
                    <div
                      className="px-1.5 py-0.5 rounded-lg bg-accent-bright/15 border border-accent-bright/30 text-[10px] font-mono text-accent-bright flex items-center gap-0.5"
                      title={`Soundboard volume set to ${customSoundboardVol}%`}
                    >
                      <Music className="w-3 h-3" />
                      <span>{customSoundboardVol}%</span>
                    </div>
                  )}

                  {/* Local Mute Badge (Muted only for me) */}
                  {isLocallyMuted && !p.isLocal && (
                    <div
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-destructive/25 border border-destructive/50 text-destructive text-[10px] font-bold"
                      title="Muted for you (بی‌صدا شده برای شما)"
                    >
                      <VolumeX className="w-3 h-3" />
                      <span className="hidden sm:inline">Muted</span>
                    </div>
                  )}

                  {/* Custom Volume Badge */}
                  {hasCustomVolume && !p.isLocal && (
                    <div
                      className="px-1.5 py-0.5 rounded-lg bg-bg-main/80 border border-border-subtle text-[10px] font-mono text-text-secondary flex items-center gap-0.5"
                      title={`Volume set to ${customVolume}%`}
                    >
                      <Volume2 className="w-3 h-3 text-highlight" />
                      <span>{customVolume}%</span>
                    </div>
                  )}

                  {p.isScreenSharing && (
                    p.isLocal ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        <span>Streaming</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stopScreenShare();
                          }}
                          className="ml-1 text-text-muted hover:text-white p-0.5"
                          title="Stop streaming"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : watchedScreenShareIds.has(p.identity) ? (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        <span>Watching</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stopWatchingStream(p.identity);
                          }}
                          className="ml-1 text-text-muted hover:text-white p-0.5"
                          title="Stop watching stream"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startWatchingStream(p.identity);
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                        title="Click to watch live stream"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Watch Stream</span>
                      </button>
                    )
                  )}

                  {p.isDeafened && (
                    <div
                      className="w-6 h-6 rounded-lg bg-destructive/20 border border-destructive/40 flex items-center justify-center text-destructive"
                      title="Deafened"
                    >
                      <Headphones className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {p.isMuted && (
                    <div
                      className="w-6 h-6 rounded-lg bg-destructive/20 border border-destructive/40 flex items-center justify-center text-destructive"
                      title="Muted"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Right-Click / Tap User Context Menu */}
      <UserContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        target={contextMenu.target}
        onClose={() => setContextMenu((c) => ({ ...c, isOpen: false }))}
      />
    </div>
  );
};
