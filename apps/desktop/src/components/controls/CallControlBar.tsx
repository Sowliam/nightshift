import React from 'react';
import {
  Headphones,
  VolumeX,
  Volume2,
  Monitor,
  PhoneOff,
  Settings,
  LayoutGrid,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
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
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#1e1f22]/95 backdrop-blur-xl border border-[#313338]/90 shadow-[0_8px_32px_rgba(0,0,0,0.55)] z-30 select-none ${className}`}
    >
      {/* 1. Mic Mute / Unmute (with layered crossfade and hover bounce) */}
      <button
        onClick={toggleMute}
        className={`call-btn ${isMuted ? 'is-active-danger' : ''}`}
        title={isMuted ? 'Unmute Microphone (Ctrl+Shift+M)' : 'Mute Microphone (Ctrl+Shift+M)'}
        aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        <div className="call-icon-layer call-icon-on call-icon-bounce">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0V3z" />
            <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5z" />
          </svg>
        </div>
        <div className="call-icon-layer call-icon-off call-icon-bounce">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" viewBox="0 0 16 16">
            <path d="M13 8c0 .564-.094 1.107-.266 1.613l-.814-.814A4.02 4.02 0 0 0 12 8V7a.5.5 0 0 1 1 0v1zm-5 4c.818 0 1.578-.245 2.212-.667l.718.719a4.973 4.973 0 0 1-2.43.923V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 1 0v1a4 4 0 0 0 4 4zm3-9v4.879L5.158 2.037A3.001 3.001 0 0 1 11 3z" />
            <path d="M9.486 10.607 5 6.12V8a3 3 0 0 0 4.486 2.607zm-7.84-9.253 12 12 .708-.708-12-12-.708.708z" />
          </svg>
        </div>
      </button>

      {/* 2. Deafen / Undeafen (with layered crossfade and hover bounce) */}
      <button
        onClick={toggleDeafen}
        className={`call-btn ${isDeafened ? 'is-active-danger' : ''}`}
        title={isDeafened ? 'Undeafen Audio (Ctrl+Shift+D)' : 'Deafen (Mute Audio) (Ctrl+Shift+D)'}
        aria-label={isDeafened ? 'Undeafen Audio' : 'Deafen (Mute Audio)'}
      >
        <div className="call-icon-layer call-icon-on call-icon-bounce">
          <Headphones className="w-5 h-5 stroke-[2.2]" />
        </div>
        <div className="call-icon-layer call-icon-off call-icon-bounce">
          <VolumeX className="w-5 h-5 stroke-[2.2]" />
        </div>
      </button>

      {/* 3. Screen Share (green when active, subtle bounce on hover) */}
      <button
        onClick={handleScreenShareClick}
        className={`call-btn ${isScreenSharing ? 'is-active-success' : ''}`}
        title={isScreenSharing ? 'Stop Screen Share' : 'Share Your Screen'}
        aria-label={isScreenSharing ? 'Stop Screen Share' : 'Share Your Screen'}
      >
        <div className="call-icon-layer call-icon-on call-icon-bounce">
          <Monitor className="w-5 h-5 stroke-[2.2]" />
        </div>
      </button>

      {/* 4. Soundboard Button (opens soundboard panel) */}
      <button
        onClick={() => {
          const current = useSoundboardStore.getState().isSoundboardOpen;
          useSoundboardStore.getState().setSoundboardOpen(!current);
        }}
        className="call-btn"
        title="Open Soundboard (Ctrl+Shift+S)"
        aria-label="Soundboard"
      >
        <div className="call-icon-layer call-icon-on call-icon-bounce">
          <Volume2 className="w-5 h-5 stroke-[2.2]" />
        </div>
      </button>

      {/* Optional Grid Layout Toggle */}
      {onToggleGrid && (
        <button
          onClick={onToggleGrid}
          className={`call-btn ${isGrid ? 'is-active-accent' : ''}`}
          title={isGrid ? 'Focus Single Stream' : 'Switch to Grid View'}
          aria-label={isGrid ? 'Focus Single Stream' : 'Switch to Grid View'}
        >
          <div className="call-icon-layer call-icon-on call-icon-bounce">
            <LayoutGrid className="w-5 h-5 stroke-[2.2]" />
          </div>
        </button>
      )}

      {/* 5. Settings (with spinning gear micro-animation on hover) */}
      <button
        onClick={onOpenSettings}
        className="call-btn"
        title="Voice & Video Settings"
        aria-label="Settings"
      >
        <div className="call-icon-layer call-icon-on call-icon-spin">
          <Settings className="w-5 h-5 stroke-[2.2]" />
        </div>
      </button>

      <div className="w-[1px] h-7 bg-white/20 mx-1" />

      {/* 6. Disconnect / Leave Room (Danger Red with tilt micro-animation on hover) */}
      <button
        onClick={disconnect}
        className="call-btn call-btn-danger"
        title="Disconnect / Leave Room"
        aria-label="Disconnect / Leave Room"
      >
        <div className="call-icon-layer call-icon-on call-icon-tilt">
          <PhoneOff className="w-5 h-5 stroke-[2.2]" />
        </div>
      </button>
    </div>
  );
};
