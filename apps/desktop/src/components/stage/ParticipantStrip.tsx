import React from 'react';
import { Mic, MicOff, Monitor, VolumeX } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useAuthStore } from '../../stores/auth.store';
import { Track } from 'livekit-client';

export const ParticipantStrip: React.FC = () => {
  const {
    localParticipant,
    remoteParticipants,
    activeSpeakers,
    isMuted,
    isDeafened,
    isScreenSharing,
  } = useLiveKitStore();
  const { user } = useAuthStore();

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
    isLocal: boolean;
    isSpeaking: boolean;
    isMuted: boolean;
    isScreenSharing: boolean;
  }> = [];

  // Add local participant
  if (localParticipant) {
    participantsList.push({
      identity: localParticipant.identity,
      name: user?.displayName || localParticipant.name || 'You',
      isLocal: true,
      isSpeaking: activeSpeakers.has(localParticipant.identity) || localParticipant.isSpeaking,
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

    participantsList.push({
      identity: p.identity,
      name: p.name || p.identity,
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
    <div className="h-16 w-full bg-bg-secondary border-t border-border-subtle flex items-center px-4 gap-3 overflow-x-auto shrink-0 select-none">
      {participantsList.map((p) => (
        <div
          key={p.identity}
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-bg-elevated border transition-all ${
            p.isSpeaking
              ? 'border-accent shadow-speaking bg-bg-hover'
              : 'border-border-subtle'
          }`}
        >
          {/* Avatar with speaking indicator ring */}
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

          {/* Name & Indicators */}
          <div className="flex flex-col min-w-0 max-w-[120px]">
            <span className="text-xs font-medium text-text-primary truncate">
              {p.name} {p.isLocal && <span className="text-[10px] text-text-muted">(You)</span>}
            </span>

            <div className="flex items-center gap-1.5 text-text-muted">
              {p.isMuted ? (
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
      ))}
    </div>
  );
};
