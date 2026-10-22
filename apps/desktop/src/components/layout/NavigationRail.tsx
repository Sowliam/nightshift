import React from 'react';
import { Volume2, Users, Compass, Settings, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';

interface NavigationRailProps {
  activeTab: 'rooms' | 'friends' | 'activity';
  onTabChange: (tab: 'rooms' | 'friends' | 'activity') => void;
  onOpenSettings: () => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
}) => {
  const { user } = useAuthStore();

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

          {/* Friends */}
          <div className="relative group flex items-center justify-center w-full">
            {activeTab === 'friends' && (
              <div className="absolute left-0 w-1 h-6 bg-accent rounded-r-md" />
            )}
            <button
              onClick={() => onTabChange('friends')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'friends'
                  ? 'bg-accent text-bg-main font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title="Friends"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>

          {/* Activity */}
          <div className="relative group flex items-center justify-center w-full">
            {activeTab === 'activity' && (
              <div className="absolute left-0 w-1 h-6 bg-accent rounded-r-md" />
            )}
            <button
              onClick={() => onTabChange('activity')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                activeTab === 'activity'
                  ? 'bg-accent text-bg-main font-semibold shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title="Activity & Recent"
            >
              <Compass className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Settings & User Avatar */}
      <div className="flex flex-col items-center gap-3 w-full">
        <button
          onClick={onOpenSettings}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          title="App Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="relative group">
          <div
            className="w-10 h-10 rounded-full bg-bg-elevated border border-border-subtle flex items-center justify-center text-xs font-bold text-text-primary cursor-pointer hover:border-accent transition-colors"
            title={user ? `${user.displayName} (Online)` : 'Guest'}
            onClick={onOpenSettings}
          >
            {user ? getInitials(user.displayName) : 'U'}
          </div>
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-bg-secondary" />
        </div>
      </div>
    </div>
  );
};
