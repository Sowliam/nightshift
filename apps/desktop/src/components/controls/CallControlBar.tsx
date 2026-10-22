import React from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Monitor,
  PhoneOff,
  Settings,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { ConnectionState } from 'livekit-client';

interface CallControlBarProps {
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
}

export const CallControlBar: React.FC<CallControlBarProps> = ({
  onOpenScreenShareModal,
  onOpenSettings,
}) => {
  const {
    connectionState,
    isMuted,
    isDeafened,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    stopScreenShare,
    disconnect,
  } = useLiveKitStore();

  const isConnected = connectionState === ConnectionState.Connected;

  if (!isConnected) {
    return null;
  }

  const handleScreenShareClick = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      onOpenScreenShareModal();
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-elevated/95 backdrop-blur-md border border-border-subtle shadow-card z-30 select-none">
      {/* Mic Mute / Unmute */}
      <button
        onClick={toggleMute}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
          isMuted
            ? 'bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30'
            : 'bg-bg-hover text-text-primary border border-border-subtle hover:border-accent hover:text-accent'
        }`}
        title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Deafen / Undeafen */}
      <button
        onClick={toggleDeafen}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
          isDeafened
            ? 'bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30'
            : 'bg-bg-hover text-text-primary border border-border-subtle hover:border-accent hover:text-accent'
        }`}
        title={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute Remote Audio)'}
      >
        {isDeafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
      </button>

      {/* Screen Share */}
      <button
        onClick={handleScreenShareClick}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
          isScreenSharing
            ? 'bg-accent text-bg-main font-semibold shadow-sm hover:bg-accent-hover'
            : 'bg-bg-hover text-text-primary border border-border-subtle hover:border-accent hover:text-accent'
        }`}
        title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
      >
        <Monitor className="w-5 h-5" />
      </button>

      <div className="w-[1px] h-6 bg-border-subtle mx-1" />

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="w-11 h-11 rounded-xl flex items-center justify-center bg-bg-hover text-text-secondary border border-border-subtle hover:text-text-primary hover:border-accent transition-all"
        title="Audio & Room Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Disconnect Call */}
      <button
        onClick={disconnect}
        className="w-11 h-11 rounded-xl flex items-center justify-center bg-destructive text-white hover:bg-destructive-hover transition-all shadow-sm"
        title="Leave Voice Room"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
};
