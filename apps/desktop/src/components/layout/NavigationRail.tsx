import React from 'react';
import { Volume2, Globe, Settings, ShieldCheck, Zap } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';

interface NavigationRailProps {
  activeTab: 'rooms' | 'servers';
  onTabChange: (tab: 'rooms' | 'servers') => void;
  onOpenSettings: () => void;
  onOpenServers: () => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  onOpenServers,
}) => {
  const { user } = useAuthStore();
  const {
    currentPing,
    isLocallySpeaking,
    localParticipant,
    activeSpeakers,
    connectionState,
    isMuted,
    isDeafened,
  } = useLiveKitStore();

  const isInVoice = connectionState === 'connected';
  const isSpeakingNow =
    isInVoice &&
    !isMuted &&
    !isDeafened &&
    (isLocallySpeaking || (localParticipant && (activeSpeakers.has(localParticipant.identity) || localParticipant.isSpeaking)));

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="w-[68px] h-full bg-bg-secondary border-r border-border-subtle flex flex-col items-center py-4 justify-between shrink-0 select-none z-20">
      {/* Top brand logo & nav items */}
      <div className="flex flex-col items-center gap-5 w-full">
        {/* Brand Icon Button */}
        <div className="relative group">
          <button
            onClick={() => onTabChange('rooms')}
            className="w-11 h-11 rounded-xl bg-bg-elevated hover:bg-bg-hover flex items-center justify-center border border-border-subtle group-hover:border-accent transition-all text-accent"
            title="NIGHTSHIFT Home"
          >
            <ShieldCheck className="w-5 h-5" />
          </button>
          <div className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-accent rounded-r-md opacity-100" />
        </div>

        <div className="w-8 h-[1px] bg-border-subtle my-1" />

        {/* Nav Items */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Rooms */}
          <div className="relative group flex items-center justify-center w-full">
            {activeTab === 'rooms' && (
              <div className="absolute left-0 w-1 h-6 bg-accent rounded-r-md" />
            )}
            <button
              onClick={() => onTabChange('rooms')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'rooms'
                  ? 'bg-accent text-bg-main font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title="Voice Rooms"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {/* Servers & Ping Monitor */}
          <div className="relative group flex items-center justify-center w-full">
            <button
              onClick={onOpenServers}
              className="w-11 h-11 rounded-xl flex flex-col items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all relative"
              title="Servers & Ping Monitor"
            >
              <Globe className="w-5 h-5" />
              {currentPing !== null && (
                <span
                  className={`text-[9px] font-mono font-bold mt-0.5 ${
                    currentPing < 140
                      ? 'text-[#52B788]'
                      : currentPing <= 350
                      ? 'text-amber-400'
                      : 'text-destructive'
                  }`}
                >
                  {currentPing}ms
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Ping Pill, Settings & User Avatar */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Quick Ping Pill */}
        {currentPing !== null && (
          <button
            onClick={onOpenServers}
            className={`px-1.5 py-0.5 rounded-full border text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
              currentPing < 140
                ? 'bg-[#52B788]/15 border-[#52B788]/40 text-[#52B788] hover:bg-[#52B788]/25'
                : currentPing <= 350
                ? 'bg-amber-400/15 border-amber-400/40 text-amber-400 hover:bg-amber-400/25'
                : 'bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/25'
            }`}
            title="Current RTT Ping - Click to test regions"
          >
            <Zap className="w-2.5 h-2.5" />
            {currentPing}ms
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          title="App Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="relative group">
          <div
            className={`w-10 h-10 rounded-full bg-bg-elevated border flex items-center justify-center text-xs font-bold text-text-primary cursor-pointer transition-all ${
              isSpeakingNow
                ? 'border-online ring-2 ring-online ring-offset-2 ring-offset-bg-secondary text-online shadow-[0_0_16px_rgba(82,183,136,0.6)] scale-105'
                : 'border-border-subtle hover:border-accent'
            }`}
            title={user ? `${user.displayName} (${isSpeakingNow ? 'Speaking' : 'Online'})` : 'Guest'}
            onClick={onOpenSettings}
          >
            {user ? getInitials(user.displayName) : 'U'}
          </div>
          {isSpeakingNow ? (
            <span className="absolute -inset-1 rounded-full border-2 border-online animate-ping opacity-75 pointer-events-none" />
          ) : (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-bg-secondary" />
          )}
        </div>
      </div>
    </div>
  );
};
