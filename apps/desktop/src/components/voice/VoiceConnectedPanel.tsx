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

  const iconBtn =
    'w-8 h-8 inline-flex items-center justify-center rounded text-[#b5bac1] hover:bg-white/10 hover:text-white';

  return (
    <div className="bg-[#0e0f11] px-2 pt-1.5 flex items-center gap-1 select-none shrink-0">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="shrink-0 flex items-center justify-center w-5">
          <SignalBarsIcon ping={currentPing} isConnecting={isConnecting} />
        </div>
        <div className="min-w-0 flex-1 leading-4">
          <div className={`text-[13px] font-semibold truncate transition-colors duration-200 ${isConnecting ? 'text-amber-400' : currentPing === null ? 'text-[#23a559]' : getPingColor(currentPing)}`}>
            {isConnecting ? 'Connecting...' : 'Voice Connected'}
          </div>
          <div className="flex items-center gap-1.5 min-w-0 text-[12px]" title={roomName}>
            <span className="text-[#b5bac1] truncate">{roomName}</span>
            <span
              className={`shrink-0 tabular-nums ${getPingColor(currentPing)}`}
              title={currentPing !== null ? `Latency: ${currentPing}ms` : 'Measuring latency...'}
            >
              {currentPing !== null ? `${currentPing}ms` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={() => {
            if (isScreenSharing) stopScreenShare();
            else onOpenScreenShareModal();
          }}
          className={`${iconBtn} ${isScreenSharing ? 'text-[#23a559] hover:text-[#23a559]' : ''}`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
          aria-label={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
        >
          <Monitor className="w-[18px] h-[18px] ns-anim-screen" />
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          className="w-8 h-8 inline-flex items-center justify-center rounded text-[#f23f43] hover:bg-[#f23f43]/15"
          title={isConnecting ? 'Cancel Connection' : 'Disconnect'}
          aria-label="Disconnect"
        >
          <PhoneOff className="w-[18px] h-[18px] ns-anim-phone" />
        </button>
      </div>
    </div>
  );
};
