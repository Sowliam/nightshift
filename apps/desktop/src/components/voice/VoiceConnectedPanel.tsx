import React from 'react';
import {
  PhoneOff,
  Monitor,
  Radio,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { ConnectionState } from 'livekit-client';
import { useServerStore } from '../../stores/server.store';

interface VoiceConnectedPanelProps {
  onOpenSettings?: () => void;
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
  // Level 3 (Optimal, < 140ms) -> Green, all 3 arcs visible
  // Level 2 (Acceptable / Fair, 140 - 350ms) -> Yellow, outer arc removed (2 arcs visible)
  // Level 1 (High, > 350ms) -> Red, outer and middle arcs removed (1 arc visible)
  let level = 3;
  let strokeColor = '#52B788'; // green (text-accent-bright)

  if (ping === null) {
    level = 3;
    strokeColor = '#52B788';
  } else if (ping > 350) {
    level = 1;
    strokeColor = '#E05252'; // red (text-destructive)
  } else if (ping >= 140) {
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
  onOpenScreenShareModal,
  onDisconnect,
}) => {
  const {
    connectionState,
    currentPing,
    isScreenSharing,
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

  // Dynamic Ping Color: green (< 140ms), amber (140 - 350ms), red (> 350ms)
  const getPingColor = (ping: number | null) => {
    if (ping === null) return 'text-text-muted';
    if (ping < 140) return 'text-accent-bright';
    if (ping <= 350) return 'text-amber-400';
    return 'text-destructive';
  };

  const getStatusTextColor = () => {
    if (isConnecting) return 'text-amber-400';
    if (currentPing === null) return 'text-accent-bright';
    if (currentPing > 350) return 'text-destructive';
    if (currentPing >= 140) return 'text-amber-400';
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
      {/* Top Status & Controls Row */}
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

        {/* Right Info: WebRTC Real Ping + Screen Share Button + Disconnect Hangup Button */}
        <div className="flex items-center gap-1.5 shrink-0">
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
                  : currentPing !== null && currentPing < 140
                  ? 'bg-accent-bright'
                  : currentPing !== null && currentPing <= 350
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

          {/* Screen Share Button */}
          <button
            onClick={() => {
              if (isScreenSharing) {
                stopScreenShare();
              } else {
                onOpenScreenShareModal();
              }
            }}
            className={`call-btn call-btn-xs ${isScreenSharing ? 'is-active-success' : ''}`}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
            aria-label={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
          >
            <div className="call-icon-layer call-icon-on call-icon-bounce">
              <Monitor className="w-3.5 h-3.5 stroke-[2.2]" />
            </div>
          </button>

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
    </div>
  );
};
