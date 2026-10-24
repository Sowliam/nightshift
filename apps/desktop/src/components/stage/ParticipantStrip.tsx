import React, { useState } from 'react';
import { Mic, MicOff, Monitor, VolumeX } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useServerStore } from '../../stores/server.store';
import { UserContextMenu, UserContextMenuTarget } from '../common/UserContextMenu';
import { Track } from 'livekit-client';
import { getFullAvatarUrl } from '../../lib/api';

export const ParticipantStrip: React.FC = () => {
  const {
    localParticipant,
    remoteParticipants,
    activeSpeakers,
    isLocallySpeaking,
    isMuted,
    isDeafened,
    isScreenSharing,
  } = useLiveKitStore();
  const { user } = useAuthStore();
  const members = useServerStore((s) => s.members);
  const localMutedUsers = useSettingsStore((s) => s.localMutedUsers);

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

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  const participantsList: Array<{
    identity: string;
    name: string;
    avatarUrl?: string | null;
    isLocal: boolean;
    isSpeaking: boolean;
    isMuted: boolean;
    isScreenSharing: boolean;
  }> = [];

  // Add local participant
  if (localParticipant) {
    const localMember = members.find((m) => m.userId === localParticipant.identity || m.username === user?.username);
    participantsList.push({
      identity: localParticipant.identity,
      name: user?.displayName || localParticipant.name || 'You',
      avatarUrl: user?.avatarUrl || localMember?.avatarUrl,
      isLocal: true,
      isSpeaking: isLocallySpeaking || activeSpeakers.has(localParticipant.identity) || localParticipant.isSpeaking,
      isMuted: isMuted,
      isScreenSharing: isScreenSharing,
    });
  }

  // Add remote participants
  remoteParticipants.forEach((p) => {
    const isMicMuted = !Array.from(p.audioTrackPublications.values()).some(
      (pub) => pub.isSubscribed && !pub.isMuted
    );
    const isSharing = Array.from(p.videoTrackPublications.values()).some(
      (pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted
    );

    const remoteMember = members.find((m) => m.userId === p.identity || m.username === p.name || m.displayName === p.name);

    participantsList.push({
      identity: p.identity,
      name: p.name || p.identity,
      avatarUrl: remoteMember?.avatarUrl,
      isLocal: false,
      isSpeaking: activeSpeakers.has(p.identity) || p.isSpeaking,
      isMuted: isMicMuted,
      isScreenSharing: isSharing,
    });
  });

  if (participantsList.length === 0) {
    return null;
  }

  return (
    <>
      <div className="h-16 w-full bg-bg-secondary border-t border-border-subtle flex items-center px-4 gap-3 overflow-x-auto shrink-0 select-none">
        {participantsList.map((p) => {
          const isLocallyMuted = !!localMutedUsers[p.identity];

          return (
            <div
              key={p.identity}
              onContextMenu={(e) => {
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
              }}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-bg-elevated border transition-all cursor-context-menu ${
                p.isSpeaking
                  ? 'border-accent shadow-speaking bg-bg-hover'
                  : 'border-border-subtle hover:border-border-strong'
              }`}
            >
              {/* Avatar with speaking indicator ring */}
              <div className="relative">
                <div
                  className={`w-8 h-8 rounded-full bg-bg-secondary border flex items-center justify-center text-xs font-bold text-text-primary overflow-hidden ${
                    p.isSpeaking ? 'border-accent text-accent' : 'border-border-subtle'
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

                {p.isSpeaking && (
                  <span className="absolute -inset-0.5 rounded-full border-2 border-accent animate-ping opacity-75 pointer-events-none" />
                )}
              </div>

              {/* Name & Indicators */}
              <div className="flex flex-col min-w-0 max-w-[120px]">
                <span className="text-xs font-medium text-text-primary truncate">
                  {p.name} {p.isLocal && <span className="text-[10px] text-text-muted">(You)</span>}
                </span>

                <div className="flex items-center gap-1.5 text-text-muted">
                  {isLocallyMuted && !p.isLocal ? (
                    <span title="Muted for you (بی‌صدا شده برای شما)">
                      <VolumeX className="w-3 h-3 text-destructive" />
                    </span>
                  ) : p.isMuted ? (
                    <MicOff className="w-3 h-3 text-destructive" />
                  ) : (
                    <Mic className={`w-3 h-3 ${p.isSpeaking ? 'text-accent' : 'text-text-muted'}`} />
                  )}

                  {p.isLocal && isDeafened && (
                    <span title="Deafened">
                      <VolumeX className="w-3 h-3 text-destructive" />
                    </span>
                  )}

                  {p.isScreenSharing && (
                    <span title="Sharing Screen">
                      <Monitor className="w-3 h-3 text-accent" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <UserContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        target={contextMenu.target}
        onClose={() => setContextMenu((c) => ({ ...c, isOpen: false }))}
      />
    </>
  );
};
