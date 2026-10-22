import React from 'react';
import { Mic, MicOff, Monitor, VolumeX, Shield, Radio } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useAuthStore } from '../../stores/auth.store';
import { useRoomStore } from '../../stores/room.store';
import { Track, ConnectionState } from 'livekit-client';

export const ParticipantPanel: React.FC = () => {
  const {
    localParticipant,
    remoteParticipants,
    activeSpeakers,
    isMuted,
    isDeafened,
    isScreenSharing,
    connectionState,
  } = useLiveKitStore();
  const { user } = useAuthStore();
  const { getSelectedRoom, activeRoomId } = useRoomStore();
  const selectedRoom = getSelectedRoom();

  const isConnected = connectionState === ConnectionState.Connected;
  const isCurrentRoomActive = selectedRoom && activeRoomId === selectedRoom.id && isConnected;

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const participants = [];

  if (isCurrentRoomActive && localParticipant) {
    participants.push({
      identity: localParticipant.identity,
      name: user?.displayName || localParticipant.name || 'You',
      isLocal: true,
      isSpeaking: activeSpeakers.has(localParticipant.identity) || localParticipant.isSpeaking,
      isMuted: isMuted,
      isDeafened: isDeafened,
      isScreenSharing: isScreenSharing,
    });

    remoteParticipants.forEach((p) => {
      const isRemoteMuted = !Array.from(p.audioTrackPublications.values()).some(
        (pub) => pub.isSubscribed && !pub.isMuted
      );
      const isSharing = Array.from(p.videoTrackPublications.values()).some(
        (pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted
      );

      participants.push({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: false,
        isSpeaking: activeSpeakers.has(p.identity) || p.isSpeaking,
        isMuted: isRemoteMuted,
        isDeafened: false,
        isScreenSharing: isSharing,
      });
    });
  }

  return (
    <div className="w-[260px] h-full bg-bg-secondary border-l border-border-subtle flex flex-col justify-between select-none shrink-0 z-10">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-text-secondary uppercase">
            In This Room
          </span>
          <span className="text-[11px] font-semibold text-text-muted px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle">
            {participants.length}
          </span>
        </div>

        {isCurrentRoomActive && (
          <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
            <Radio className="w-3 h-3 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Participant List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {isCurrentRoomActive && participants.length > 0 ? (
          participants.map((p) => (
            <div
              key={p.identity}
              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                p.isSpeaking
                  ? 'bg-bg-elevated border-accent shadow-speaking'
                  : 'bg-bg-elevated/40 border-border-subtle/50 hover:bg-bg-elevated'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Avatar */}
                <div className="relative">
                  <div
                    className={`w-8 h-8 rounded-full bg-bg-secondary border flex items-center justify-center text-xs font-bold text-text-primary ${
                      p.isSpeaking ? 'border-accent text-accent' : 'border-border-subtle'
                    }`}
                  >
                    {getInitials(p.name)}
                  </div>
                  {p.isSpeaking && (
                    <span className="absolute -inset-0.5 rounded-full border-2 border-accent animate-ping opacity-75 pointer-events-none" />
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-text-primary truncate max-w-[110px]">
                      {p.name}
                    </span>
                    {p.isLocal && (
                      <span className="text-[10px] text-text-muted font-normal">(You)</span>
                    )}
                  </div>

                  <span className="text-[10px] text-text-muted">
                    {p.isSpeaking ? (
                      <span className="text-accent font-medium">Speaking</span>
                    ) : p.isMuted ? (
                      'Muted'
                    ) : (
                      'Connected'
                    )}
                  </span>
                </div>
              </div>

              {/* Status Icons */}
              <div className="flex items-center gap-1.5 shrink-0 text-text-muted">
                {p.isScreenSharing && (
                  <span
                    className="p-1 rounded bg-accent-subtle text-accent"
                    title="Screen Sharing"
                  >
                    <Monitor className="w-3 h-3" />
                  </span>
                )}

                {p.isDeafened && (
                  <span
                    className="p-1 rounded bg-destructive/10 text-destructive"
                    title="Deafened"
                  >
                    <VolumeX className="w-3 h-3" />
                  </span>
                )}

                {p.isMuted ? (
                  <span
                    className="p-1 rounded bg-destructive/10 text-destructive"
                    title="Muted"
                  >
                    <MicOff className="w-3 h-3" />
                  </span>
                ) : (
                  <span
                    className={`p-1 rounded ${
                      p.isSpeaking ? 'text-accent bg-accent-subtle' : 'text-text-muted'
                    }`}
                    title="Microphone Active"
                  >
                    <Mic className="w-3 h-3" />
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          /* Empty Room State */
          <div className="h-48 flex flex-col items-center justify-center text-center p-4">
            <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center text-text-muted mb-2">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-text-secondary">
              {isCurrentRoomActive ? 'You are the first here' : 'Room is currently empty'}
            </span>
            <p className="text-[11px] text-text-muted mt-1 max-w-[180px]">
              {isCurrentRoomActive
                ? 'Invite friends to join this voice room.'
                : 'Connect to this room to start chatting.'}
            </p>
          </div>
        )}
      </div>

      {/* Room Stats Footer */}
      <div className="p-3 border-t border-border-subtle bg-bg-secondary text-[11px] text-text-muted flex items-center justify-between">
        <span>Low-Latency WebRTC</span>
        <span className="text-accent font-mono font-medium">Opus / VP8</span>
      </div>
    </div>
  );
};
