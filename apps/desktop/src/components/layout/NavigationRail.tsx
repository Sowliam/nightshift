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
  const { currentPing, isLocallySpeaking } = useLiveKitStore();

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
                <span className="text-[9px] font-mono text-accent font-bold mt-0.5">
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
            className="px-1.5 py-0.5 rounded-full bg-accent-subtle border border-accent/30 text-accent text-[10px] font-mono font-bold flex items-center gap-1 hover:bg-accent/20 transition-all"
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
              isLocallySpeaking
                ? 'border-accent text-accent shadow-[0_0_12px_rgba(196,211,106,0.6)] ring-2 ring-accent'
                : 'border-border-subtle hover:border-accent'
            }`}
            title={user ? `${user.displayName} (${isLocallySpeaking ? 'Speaking' : 'Online'})` : 'Guest'}
            onClick={onOpenSettings}
          >
            {user ? getInitials(user.displayName) : 'U'}
          </div>
          {isLocallySpeaking ? (
            <span className="absolute -inset-0.5 rounded-full border border-accent animate-ping opacity-75 pointer-events-none" />
          ) : (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-bg-secondary" />
          )}
        </div>
      </div>
    </div>
  );
};
