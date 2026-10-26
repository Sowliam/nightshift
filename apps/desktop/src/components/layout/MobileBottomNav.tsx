import React from 'react';
import { Hash, Users, Menu } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useServerStore } from '../../stores/server.store';

export type MobileTab = 'channels' | 'chat' | 'members' | 'settings';

interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onOpenSettings: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
}) => {
  const { user } = useAuthStore();
  const { isLocallySpeaking } = useLiveKitStore();
  const { activeVoiceChannelId, unreadMentions, activeChannelId } = useServerStore();

  const isInVoice = !!activeVoiceChannelId;
  const hasMention = activeChannelId ? unreadMentions.has(activeChannelId) : false;

  const getInitials = (name: string) =>
    name.split(' ').map((p) => p[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-bg-secondary/98 backdrop-blur-xl border-t border-border-subtle"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-[60px] px-1">
        {/* Channels */}
        <button
          onClick={() => onTabChange('channels')}
          className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all duration-200 ${
            activeTab === 'channels' ? 'text-highlight' : 'text-text-muted'
          }`}
        >
          {activeTab === 'channels' && (
            <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-highlight" />
          )}
          <Menu className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'channels' ? 'scale-110' : ''}`} />
          <span className="text-[9px] font-semibold">Channels</span>
        </button>

        {/* Chat */}
        <button
          onClick={() => onTabChange('chat')}
          className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all duration-200 ${
            activeTab === 'chat' ? 'text-highlight' : 'text-text-muted'
          }`}
        >
          {activeTab === 'chat' && (
            <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-highlight" />
          )}
          <Hash className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'chat' ? 'scale-110' : ''}`} />
          <span className="text-[9px] font-semibold">Chat</span>
          {hasMention && (
            <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-destructive" />
          )}
        </button>

        {/* Members */}
        <button
          onClick={() => onTabChange('members')}
          className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all duration-200 ${
            activeTab === 'members' ? 'text-highlight' : 'text-text-muted'
          }`}
        >
          {activeTab === 'members' && (
            <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-highlight" />
          )}
          <Users className={`w-5 h-5 transition-transform duration-200 ${activeTab === 'members' ? 'scale-110' : ''}`} />
          <span className="text-[9px] font-semibold">Members</span>
        </button>

        {/* Settings / Profile */}
        <button
          onClick={onOpenSettings}
          className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all duration-200 ${
            activeTab === 'settings' ? 'text-highlight' : 'text-text-muted'
          }`}
        >
          <div className="relative">
            <div
              className={`w-7 h-7 rounded-full bg-bg-elevated border flex items-center justify-center text-[10px] font-bold text-text-primary transition-all ${
                isLocallySpeaking
                  ? 'border-accent-bright shadow-[0_0_8px_rgba(35,165,90,0.6)]'
                  : 'border-border-subtle'
              }`}
            >
              {user ? getInitials(user.displayName) : 'U'}
            </div>
            {isInVoice && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent-bright border-2 border-bg-secondary" />
            )}
          </div>
          <span className="text-[9px] font-semibold">Profile</span>
        </button>
      </div>
    </div>
  );
};
