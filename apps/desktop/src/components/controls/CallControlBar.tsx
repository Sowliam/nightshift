import React from 'react';
import {
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Monitor,
  PhoneOff,
  Settings,
  LayoutGrid,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { ConnectionState } from 'livekit-client';

interface CallControlBarProps {
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
  onToggleGrid?: () => void;
  isGrid?: boolean;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const CallControlBar: React.FC<CallControlBarProps> = ({
  onOpenScreenShareModal,
  onOpenSettings,
  onToggleGrid,
  isGrid,
  className = '',
  onMouseEnter,
  onMouseLeave,
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
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#111214]/95 backdrop-blur-md border border-[#2b2d31] shadow-2xl z-30 select-none ${className}`}
    >
      {/* Mic Mute / Unmute */}
      <button
        onClick={toggleMute}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
          isMuted
            ? 'bg-[#da373c]/20 text-[#da373c] border border-[#da373c]/40 hover:bg-[#da373c]/30'
            : 'bg-[#2b2d31] text-white hover:bg-[#35373c] border border-transparent'
        }`}
        title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        {isMuted ? <MicOff className="w-5 h-5 text-[#da373c]" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Deafen / Undeafen */}
      <button
        onClick={toggleDeafen}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
          isDeafened
            ? 'bg-[#da373c]/20 text-[#da373c] border border-[#da373c]/40 hover:bg-[#da373c]/30'
            : 'bg-[#2b2d31] text-white hover:bg-[#35373c] border border-transparent'
        }`}
        title={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute Audio)'}
      >
        {isDeafened ? <VolumeX className="w-5 h-5 text-[#da373c]" /> : <Headphones className="w-5 h-5" />}
      </button>

      {/* Screen Share (Discord Green when active) */}
      <button
        onClick={handleScreenShareClick}
        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
          isScreenSharing
            ? 'bg-[#23a55a] text-white hover:bg-[#1a8a47] shadow-[0_0_12px_rgba(35,165,90,0.4)]'
            : 'bg-[#2b2d31] text-white hover:bg-[#35373c] border border-transparent'
        }`}
        title={isScreenSharing ? 'Stop Screen Share' : 'Share Your Screen'}
      >
        <Monitor className="w-5 h-5" />
      </button>

      {/* Optional Grid Layout Toggle */}
      {onToggleGrid && (
        <button
          onClick={onToggleGrid}
          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
            isGrid
              ? 'bg-[#5865F2] text-white hover:bg-[#4752c4]'
              : 'bg-[#2b2d31] text-white hover:bg-[#35373c]'
          }`}
          title={isGrid ? 'Focus Single Stream' : 'Switch to Grid View'}
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
      )}

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#2b2d31] text-white hover:bg-[#35373c] transition-all cursor-pointer"
        title="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>

      <div className="w-[1px] h-6 bg-[#3f4147] mx-0.5" />

      {/* Disconnect Call (Discord Red) */}
      <button
        onClick={disconnect}
        className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#da373c] text-white hover:bg-[#a1282c] transition-all shadow-md cursor-pointer"
        title="Disconnect / Leave Room"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
};

