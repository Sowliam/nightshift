import React from 'react';
import { MicOff, Headphones, Monitor, Radio, Loader2, LogIn, Play, X } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { useServerStore } from '../../stores/server.store';
import { Track } from 'livekit-client';

interface VoiceParticipant {
  identity: string;
  name: string;
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
  } = useLiveKitStore();
  const { getActiveRoom, getSelectedRoom, joiningRoomId } = useRoomStore();

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

    participants.push({
      identity: localIdentity,
      name: user?.displayName || localParticipant.name || 'You',
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

    participants.push({
      identity: p.identity,
      name: p.name || p.identity,
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
          return (
            <div
              key={p.identity}
              className={`relative rounded-2xl bg-bg-elevated border flex flex-col items-center justify-center overflow-hidden transition-all duration-200 ${
                count === 1
                  ? 'w-full max-w-xl h-[340px] md:h-[400px] shadow-card'
                  : 'w-full h-full min-h-[160px] shadow-subtle'
              } ${
                p.isSpeaking
                  ? 'border-online ring-2 ring-online/50 shadow-[0_0_16px_rgba(82,183,136,0.25)]'
                  : 'border-border-subtle hover:border-border-strong'
              }`}
            >
              {/* Center Avatar with Speaking Glow */}
              <div className="relative">
                <div
                  className={`rounded-full flex items-center justify-center font-black tracking-wider transition-all duration-150 select-none ${
                    count === 1 ? 'w-24 h-24 text-2xl' : count <= 4 ? 'w-20 h-20 text-xl' : 'w-14 h-14 text-sm'
                  } ${
                    p.isSpeaking
                      ? 'bg-highlight text-highlight-text ring-4 ring-online shadow-[0_0_20px_rgba(82,183,136,0.4)]'
                      : 'bg-bg-main border border-border-subtle text-highlight'
                  }`}
                >
                  {getInitials(p.name)}
                </div>

                {/* Speaking Wave Pulse */}
                {p.isSpeaking && (
                  <span className="absolute -inset-1 rounded-full border-2 border-accent-bright/60 animate-ping pointer-events-none" />
                )}
              </div>

              {/* Bottom Info Bar inside Card */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                {/* User Name Pill */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md border border-border-subtle/80 max-w-[80%]">
                  <span className="text-xs font-semibold text-text-primary truncate">
                    {p.name} {p.isLocal && <span className="text-[10px] text-text-muted font-normal">(You)</span>}
                  </span>
                </div>

                {/* Status Badges: Muted, Deafen, Screen Share / Watch button */}
                <div className="flex items-center gap-1.5 pointer-events-auto">
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
    </div>
  );
};
