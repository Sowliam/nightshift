import React, { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useServerStore } from '../../stores/server.store';
import { ConnectionState } from 'livekit-client';
import { getAssetUrl } from '../../lib/assets';

export const TitleBar: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);
  const { connectionState } = useLiveKitStore();
  const { servers, activeServerId, channels, activeChannelId, activeVoiceChannelId } =
    useServerStore();

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const isVoiceConnected = !!activeVoiceChannelId && connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (window.nightshift?.isElectron) {
      setIsElectron(true);
    }
  }, []);

  const handleMinimize = () => {
    window.nightshift?.minimize();
  };

  const handleMaximize = () => {
    window.nightshift?.maximize();
  };

  const handleClose = () => {
    window.nightshift?.close();
  };

  const getConnectionBadge = () => {
    if (isVoiceConnected) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-online font-bold tracking-wider">
          <span className="w-2 h-2 rounded-full bg-online animate-pulse" />
          VOICE CONNECTED
        </span>
      );
    }
    if (connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-bold tracking-wider">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          CONNECTING...
        </span>
      );
    }
    return null;
  };

  return (
    <div className="h-9 w-full bg-bg-secondary border-b border-border-subtle flex items-center justify-between px-3 select-none app-region-drag z-50 shrink-0">
      {/* Brand & Connection Indicator */}
      <div className="flex items-center gap-3 app-region-no-drag">
        <div className="flex items-center gap-2">
          <img
            src={getAssetUrl('logo.png')}
            className="w-5 h-5 object-contain"
            alt="Nightshift Logo"
          />
          <span className="text-xs font-bold tracking-wider text-text-primary uppercase">
            Nightshift
          </span>
        </div>

        {getConnectionBadge()}
      </div>

      {/* Middle: Active Server / Channel Context */}
      <div className="flex items-center gap-2 text-xs text-text-secondary truncate max-w-sm pointer-events-none">
        {activeServer ? (
          <>
            <span className="text-text-primary font-semibold">{activeServer.name}</span>
            {activeChannel && (
              <>
                <span className="text-text-muted font-mono">•</span>
                <span className="text-highlight font-medium">#{activeChannel.name}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-text-muted">Desktop Communication App</span>
        )}
      </div>

      {/* Right: Window Controls for Electron */}
      {isElectron ? (
        <div className="flex items-center app-region-no-drag -mr-2">
          <button
            onClick={handleMinimize}
            className="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title="Maximize / Restore"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-white hover:bg-destructive transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-16" />
      )}
    </div>
  );
};
