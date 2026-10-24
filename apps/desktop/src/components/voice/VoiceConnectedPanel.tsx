import React from 'react';
import {
  PhoneOff,
  Headphones,
  VolumeX,
  Settings,
  Monitor,
  Radio,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { ConnectionState } from 'livekit-client';

import { useServerStore } from '../../stores/server.store';

interface VoiceConnectedPanelProps {
  onOpenSettings: () => void;
  onOpenScreenShareModal: () => void;
  onDisconnect?: () => void;
}

// Dynamic Wifi Signal Icon that decreases rows and changes color based on ping quality
const SignalBarsIcon: React.FC<{
  ping: number | null;
  isConnecting: boolean;
}> = ({ ping, isConnecting }) => {
  if (isConnecting) {
    return <Radio className="w-4 h-4 text-amber-400 animate-pulse" />;
  }

  // Determine signal health:
  // Level 3 (Good, < 120ms) -> Green, all 3 arcs visible
  // Level 2 (Weak / Moderate, 120 - 220ms) -> Yellow, outer arc removed (2 arcs visible)
  // Level 1 (Very Weak, > 220ms) -> Red, outer and middle arcs removed (1 arc visible)
  let level = 3;
  let strokeColor = '#52B788'; // green (text-accent-bright)

  if (ping === null) {
    level = 3;
    strokeColor = '#52B788';
  } else if (ping > 220) {
    level = 1;
    strokeColor = '#E05252'; // red (text-destructive)
  } else if (ping >= 120) {
    level = 2;
    strokeColor = '#FBBF24'; // yellow/amber (text-amber-400)
  }

  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Base Center Dot */}
      <circle cx="12" cy="20" r="1.5" fill={strokeColor} stroke="none" />

      {/* Row 1 / Inner Arc (level >= 1) */}
      <path
        d="M8.5 16.5a5 5 0 0 1 7 0"
        stroke={strokeColor}
        opacity={level >= 1 ? 1 : 0.15}
      />

      {/* Row 2 / Middle Arc (level >= 2) */}
      <path
        d="M5 12.5a10 10 0 0 1 14 0"
        stroke={strokeColor}
        opacity={level >= 2 ? 1 : 0.15}
      />

      {/* Row 3 / Outer Arc (level >= 3) */}
      <path
        d="M1.5 8.5a15 15 0 0 1 21 0"
        stroke={strokeColor}
        opacity={level >= 3 ? 1 : 0.15}
      />
    </svg>
  );
};

export const VoiceConnectedPanel: React.FC<VoiceConnectedPanelProps> = ({
  onOpenSettings,
  onOpenScreenShareModal,
  onDisconnect,
}) => {
  const {
    connectionState,
    currentPing,
    isMuted,
    isDeafened,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    disconnect,
    stopScreenShare,
  } = useLiveKitStore();

  const { activeVoiceChannelId, joiningVoiceChannelId, channels } = useServerStore();
  const { getActiveRoom, joiningRoomId } = useRoomStore();
  const activeRoom = getActiveRoom();
  const targetChannelId = activeVoiceChannelId || joiningVoiceChannelId;
  const activeChannel = channels.find((c) => c.id === targetChannelId);

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting ||
    joiningRoomId !== null ||
    joiningVoiceChannelId !== null;

  // Only render if connecting or connected to a voice channel
  if (!isConnected && !isConnecting && !activeVoiceChannelId && !joiningVoiceChannelId) {
    return null;
  }

  const roomName = activeChannel?.name || activeRoom?.name || 'Voice Channel';

  // Dynamic Ping Color: green (< 120ms), amber (120 - 220ms), red (> 220ms)
  const getPingColor = (ping: number | null) => {
    if (ping === null) return 'text-text-muted';
    if (ping < 120) return 'text-accent-bright';
    if (ping <= 220) return 'text-amber-400';
    return 'text-destructive';
  };

  const getStatusTextColor = () => {
    if (isConnecting) return 'text-amber-400';
    if (currentPing === null) return 'text-accent-bright';
    if (currentPing > 220) return 'text-destructive';
    if (currentPing >= 120) return 'text-amber-400';
    return 'text-accent-bright';
  };

  const handleDisconnect = () => {
    useServerStore.getState().setJoiningVoiceChannel(null);
    useServerStore.getState().setActiveVoiceChannel(null);
    useRoomStore.getState().setJoiningRoom(null);
    if (onDisconnect) {
      onDisconnect();
    } else {
      disconnect();
    }
  };

  return (
    <div className="border-t border-border-subtle bg-bg-secondary/95 px-3 py-2 flex flex-col gap-2 select-none shrink-0 transition-all duration-200">
      {/* Top Status & Disconnect Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Signal Indicator with dynamic rows and color */}
          <div className="relative shrink-0 flex items-center justify-center">
            <SignalBarsIcon ping={currentPing} isConnecting={isConnecting} />
          </div>

          {/* Connection Status & Channel Info */}
          <div className="flex flex-col min-w-0 leading-tight">
            <span
              className={`text-xs font-bold tracking-tight truncate transition-colors duration-200 ${getStatusTextColor()}`}
            >
              {isConnecting ? 'RTC Connecting...' : 'Voice Connected'}
            </span>
            <span className="text-[10px] text-text-muted truncate">
              {roomName} / NIGHTSHIFT
            </span>
          </div>
        </div>

        {/* Right Info: WebRTC Real Ping + Disconnect Hangup Button */}
        <div className="flex items-center gap-2 shrink-0">
          {/* RTC Ping Indicator */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-elevated/80 border border-border-subtle/60 text-[10px] font-mono cursor-help"
            title={
              currentPing !== null
                ? `WebRTC Latency: ${currentPing}ms`
                : 'Measuring WebRTC connection stats...'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnecting
                  ? 'bg-amber-400 animate-pulse'
                  : currentPing !== null && currentPing < 120
                  ? 'bg-accent-bright'
                  : currentPing !== null && currentPing <= 220
                  ? 'bg-amber-400'
                  : currentPing !== null
                  ? 'bg-destructive'
                  : 'bg-text-muted animate-ping'
              }`}
            />
            <span className={getPingColor(currentPing)}>
              {currentPing !== null ? `${currentPing}ms` : '— ms'}
            </span>
          </div>

          {/* Red Disconnect Button (Always available to cancel/disconnect) */}
          <button
            onClick={handleDisconnect}
            className="call-btn call-btn-xs call-btn-danger"
            title={isConnecting ? 'Cancel Connection' : 'Disconnect from Voice Channel'}
            aria-label="Disconnect"
          >
            <div className="call-icon-layer call-icon-on call-icon-tilt">
              <PhoneOff className="w-3.5 h-3.5 stroke-[2.2]" />
            </div>
          </button>
        </div>
      </div>

      {/* Control Action Buttons Bar */}
      <div className="flex items-center justify-around pt-1 px-1">
        {/* Mute Button */}
        <button
          onClick={toggleMute}
          className={`call-btn call-btn-sm ${isMuted ? 'is-active-danger' : ''}`}
          title={isMuted ? 'Unmute (Ctrl+Shift+M)' : 'Mute (Ctrl+Shift+M)'}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          <div className="call-icon-layer call-icon-on call-icon-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z" />
              <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z" />
            </svg>
          </div>
          <div className="call-icon-layer call-icon-off call-icon-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z" />
              <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z" />
            </svg>
          </div>
        </button>

        {/* Deafen Button */}
        <button
          onClick={toggleDeafen}
          className={`call-btn call-btn-sm ${isDeafened ? 'is-active-danger' : ''}`}
          title={isDeafened ? 'Undeafen (Ctrl+Shift+D)' : 'Deafen (Ctrl+Shift+D)'}
          aria-label={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          <div className="call-icon-layer call-icon-on call-icon-bounce">
            <Headphones className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div className="call-icon-layer call-icon-off call-icon-bounce">
            <VolumeX className="w-4 h-4 stroke-[2.2]" />
          </div>
        </button>

        {/* Screen Share Button */}
        <button
          onClick={() => {
            if (isScreenSharing) {
              stopScreenShare();
            } else {
              onOpenScreenShareModal();
            }
          }}
          className={`call-btn call-btn-sm ${isScreenSharing ? 'is-active-success' : ''}`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
          aria-label={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
        >
          <div className="call-icon-layer call-icon-on call-icon-bounce">
            <Monitor className="w-4 h-4 stroke-[2.2]" />
          </div>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="call-btn call-btn-sm"
          title="Voice Settings"
          aria-label="Settings"
        >
          <div className="call-icon-layer call-icon-on call-icon-spin">
            <Settings className="w-4 h-4 stroke-[2.2]" />
          </div>
        </button>
      </div>
    </div>
  );
};
