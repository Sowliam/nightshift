import React from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Headphones,
  Settings,
  Monitor,
  Radio,
  Wifi,
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

  const { activeVoiceChannelId, channels } = useServerStore();
  const { getActiveRoom, joiningRoomId } = useRoomStore();
  const activeRoom = getActiveRoom();
  const activeChannel = channels.find((c) => c.id === activeVoiceChannelId);

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting ||
    joiningRoomId !== null;

  // Only render if connecting or connected to a voice channel
  if (!isConnected && !isConnecting) {
    return null;
  }

  const roomName = activeChannel?.name || activeRoom?.name || 'Voice Channel';

  // Ping color: green (< 100ms), amber (100 - 250ms), red (> 250ms)
  const getPingColor = (ping: number | null) => {
    if (ping === null) return 'text-text-muted';
    if (ping < 100) return 'text-accent-bright';
    if (ping < 250) return 'text-amber-400';
    return 'text-destructive';
  };

  return (
    <div className="border-t border-border-subtle bg-bg-secondary/95 px-3 py-2 flex flex-col gap-2 select-none shrink-0 transition-all duration-200">
      {/* Top Status & Disconnect Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Signal Indicator */}
          <div className="relative shrink-0 flex items-center justify-center">
            {isConnecting ? (
              <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
            ) : (
              <Wifi className="w-4 h-4 text-accent-bright" />
            )}
          </div>

          {/* Connection Status & Channel Info */}
          <div className="flex flex-col min-w-0 leading-tight">
            <span
              className={`text-xs font-bold tracking-tight truncate ${
                isConnecting ? 'text-amber-400' : 'text-accent-bright'
              }`}
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
                currentPing !== null && currentPing < 100
                  ? 'bg-accent-bright'
                  : currentPing !== null
                  ? 'bg-amber-400'
                  : 'bg-text-muted animate-ping'
              }`}
            />
            <span className={getPingColor(currentPing)}>
              {currentPing !== null ? `${currentPing}ms` : '— ms'}
            </span>
          </div>

          {/* Red Disconnect Button */}
          <button
            onClick={() => (onDisconnect ? onDisconnect() : disconnect())}
            className="w-7 h-7 rounded-lg bg-destructive/15 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 flex items-center justify-center transition-all shadow-sm"
            title="Disconnect from Voice Channel"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Control Action Buttons Bar */}
      <div className="grid grid-cols-4 gap-1 pt-0.5">
        {/* Mute Button */}
        <button
          onClick={toggleMute}
          className={`py-1 rounded-lg flex items-center justify-center transition-all ${
            isMuted
              ? 'bg-destructive/20 text-destructive border border-destructive/40'
              : 'bg-bg-elevated text-highlight hover:bg-highlight hover:text-highlight-text border border-border-subtle'
          }`}
          title={isMuted ? 'Unmute (Ctrl+Shift+M)' : 'Mute (Ctrl+Shift+M)'}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        {/* Deafen Button */}
        <button
          onClick={toggleDeafen}
          className={`py-1 rounded-lg flex items-center justify-center transition-all ${
            isDeafened
              ? 'bg-destructive/20 text-destructive border border-destructive/40'
              : 'bg-bg-elevated text-highlight hover:bg-highlight hover:text-highlight-text border border-border-subtle'
          }`}
          title={isDeafened ? 'Undeafen (Ctrl+Shift+D)' : 'Deafen (Ctrl+Shift+D)'}
        >
          <Headphones className="w-3.5 h-3.5" />
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
          className={`py-1 rounded-lg flex items-center justify-center transition-all ${
            isScreenSharing
              ? 'bg-highlight text-highlight-text font-bold shadow-sm'
              : 'bg-bg-elevated text-highlight hover:bg-highlight hover:text-highlight-text border border-border-subtle'
          }`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Your Screen'}
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="py-1 rounded-lg bg-bg-elevated hover:bg-highlight hover:text-highlight-text text-highlight border border-border-subtle flex items-center justify-center transition-all"
          title="Voice Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
