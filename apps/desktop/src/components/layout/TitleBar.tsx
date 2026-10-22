import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Radio } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useRoomStore } from '../../stores/room.store';
import { ConnectionState } from 'livekit-client';

export const TitleBar: React.FC = () => {
  const [isElectron, setIsElectron] = useState(false);
  const { connectionState } = useLiveKitStore();
  const { getActiveRoom } = useRoomStore();
  const activeRoom = getActiveRoom();

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
    if (connectionState === ConnectionState.Connected) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-online font-medium">
          <span className="w-2 h-2 rounded-full bg-online animate-pulse" />
          CONNECTED
        </span>
      );
    }
    if (connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
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
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center font-bold text-bg-main text-xs tracking-tighter">
            NS
          </div>
          <span className="text-xs font-semibold tracking-wider text-text-primary uppercase">
            Nightshift
          </span>
        </div>

        {getConnectionBadge()}
      </div>

      {/* Middle: Active Room Context */}
      <div className="flex items-center gap-2 text-xs text-text-secondary truncate max-w-sm pointer-events-none">
        {activeRoom ? (
          <>
            <Radio className="w-3.5 h-3.5 text-accent" />
            <span className="text-text-primary font-medium">{activeRoom.name}</span>
            <span className="text-text-muted">• In Session</span>
          </>
        ) : (
          <span className="text-text-muted">Private Comm Community</span>
        )}
      </div>

      {/* Right: Window Controls */}
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
            title="Maximize"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={handleClose}
            className="w-10 h-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-destructive hover:bg-opacity-80 transition-colors"
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
