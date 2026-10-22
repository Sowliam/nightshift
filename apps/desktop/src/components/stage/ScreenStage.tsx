import React, { useRef, useEffect, useState } from 'react';
import {
  Monitor,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Radio,
  Users,
  AlertCircle,
  LogIn,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { useAuthStore } from '../../stores/auth.store';
import { ParticipantStrip } from './ParticipantStrip';
import { CallControlBar } from '../controls/CallControlBar';
import { ConnectionState } from 'livekit-client';
import { api } from '../../lib/api';

interface ScreenStageProps {
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
}

export const ScreenStage: React.FC<ScreenStageProps> = ({
  onOpenScreenShareModal,
  onOpenSettings,
  onOpenInvite,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    activeScreenTrack,
    screenSharerName,
    connectionState,
    connect,
    error: livekitError,
  } = useLiveKitStore();

  const { getSelectedRoom, activeRoomId, setActiveRoom } = useRoomStore();
  const { user } = useAuthStore();
  const selectedRoom = getSelectedRoom();

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;
  const isRoomActive = selectedRoom && activeRoomId === selectedRoom.id && isConnected;

  // Attach active screen video track to HTMLVideoElement
  useEffect(() => {
    if (!videoRef.current) return;

    if (activeScreenTrack && activeScreenTrack.track) {
      activeScreenTrack.track.attach(videoRef.current);
    }

    return () => {
      if (activeScreenTrack && activeScreenTrack.track && videoRef.current) {
        activeScreenTrack.track.detach(videoRef.current);
      }
    };
  }, [activeScreenTrack]);

  const handleCopyInviteLink = async () => {
    try {
      const invite = await api.createInvitation(selectedRoom?.id, user?.deviceId);
      const inviteUrl = `${window.location.origin}#invite=${invite.code}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onOpenInvite();
    }
  };

  const handleJoinCurrentRoom = async () => {
    if (!selectedRoom || !user) return;
    try {
      const joinData = await api.joinRoom(selectedRoom.id, user.id);
      setActiveRoom(selectedRoom.id);
      await connect(joinData.livekitUrl, joinData.token);
    } catch (err: any) {
      alert(err.message || 'Failed to join room');
    }
  };

  return (
    <div className="flex-1 h-full bg-bg-main flex flex-col relative overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-14 px-6 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-secondary/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${isRoomActive ? 'text-accent animate-pulse' : 'text-text-muted'}`}
            />
            <h1 className="text-base font-semibold text-text-primary tracking-wide">
              {selectedRoom ? selectedRoom.name : 'No Room Selected'}
            </h1>
          </div>

          {selectedRoom && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bg-elevated border border-border-subtle text-xs text-text-secondary">
              <Users className="w-3.5 h-3.5" />
              <span>{isRoomActive ? 'Connected' : `${selectedRoom.participantCount} in room`}</span>
            </div>
          )}

          {/* Connection Status Badge */}
          {isRoomActive ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-subtle text-accent text-xs font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Live Room
            </span>
          ) : isConnecting ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              Connecting...
            </span>
          ) : (
            <span className="text-xs text-text-muted">Disconnected</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isRoomActive && selectedRoom && (
            <button
              onClick={handleJoinCurrentRoom}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-bg-main font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              Join Voice Room
            </button>
          )}

          <button
            onClick={handleCopyInviteLink}
            className="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary flex items-center gap-1.5 transition-all"
            title="Copy Invite Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-accent" />
                <span className="text-accent">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-text-secondary" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Center Screen-sharing Stage */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 bg-bg-main overflow-hidden">
        {activeScreenTrack ? (
          /* Live Screen Share View */
          <div
            className={`relative w-full h-full rounded-xl overflow-hidden bg-black flex items-center justify-center border border-border-subtle shadow-card transition-all ${
              isExpanded ? 'fixed inset-4 z-40' : ''
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />

            {/* Stage Overlay Top Bar */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-main/80 backdrop-blur-md border border-border-subtle text-xs pointer-events-auto">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="font-medium text-text-primary">
                  {screenSharerName || 'Participant'}'s Screen
                </span>
                <span className="text-accent font-semibold tracking-wider text-[10px] uppercase bg-accent-subtle px-1.5 py-0.5 rounded">
                  LIVE
                </span>
              </div>

              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-8 h-8 rounded-lg bg-bg-main/80 backdrop-blur-md border border-border-subtle text-text-secondary hover:text-text-primary flex items-center justify-center pointer-events-auto transition-colors"
                title={isExpanded ? 'Restore Stage' : 'Expand Stage'}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          /* Polished Empty State */
          <div className="max-w-md w-full p-8 rounded-2xl bg-bg-secondary/40 border border-border-subtle/70 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent mb-4 shadow-subtle">
              <Monitor className="w-7 h-7" />
            </div>

            <h2 className="text-base font-semibold text-text-primary mb-1.5">
              Screen Stage Ready
            </h2>

            <p className="text-xs text-text-secondary leading-relaxed mb-6">
              {isRoomActive
                ? 'No one is sharing their screen right now. Stream your entire display or an individual app window to everyone in this room.'
                : 'Join this voice room to chat with your friends and stream games or applications in real time.'}
            </p>

            {isRoomActive ? (
              <button
                onClick={onOpenScreenShareModal}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg-main text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
              >
                <Monitor className="w-4 h-4" />
                Share Your Screen
              </button>
            ) : (
              <button
                onClick={handleJoinCurrentRoom}
                className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg-main text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Connect to {selectedRoom?.name || 'Room'}
              </button>
            )}

            {livekitError && (
              <div className="mt-4 flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{livekitError}</span>
              </div>
            )}
          </div>
        )}

        {/* Floating Call Control Bar (Docked at bottom of stage) */}
        <CallControlBar
          onOpenScreenShareModal={onOpenScreenShareModal}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {/* Bottom Participant Strip */}
      {isRoomActive && <ParticipantStrip />}
    </div>
  );
};
