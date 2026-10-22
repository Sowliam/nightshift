import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { NavigationRail } from './components/layout/NavigationRail';
import { RoomSidebar } from './components/layout/RoomSidebar';
import { ScreenStage } from './components/stage/ScreenStage';
import { ParticipantPanel } from './components/layout/ParticipantPanel';
import { ScreenShareModal } from './components/modals/ScreenShareModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { InviteModal } from './components/modals/InviteModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { useAuthStore } from './stores/auth.store';
import { useRoomStore } from './stores/room.store';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [activeNavTab, setActiveNavTab] = useState<'rooms' | 'friends' | 'activity'>('rooms');
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { user, isLoading: authLoading, initAuth } = useAuthStore();
  const { fetchRooms } = useRoomStore();

  useEffect(() => {
    const initialize = async () => {
      try {
        await initAuth();
        await fetchRooms();
      } catch (err: any) {
        console.error('Initialization error:', err);
        setServerError('Cannot connect to the NIGHTSHIFT local server. Make sure it is running.');
      }
    };

    initialize();

    // Check for invite links in URL hash
    if (window.location.hash.includes('invite=')) {
      const code = window.location.hash.split('invite=')[1]?.split('&')[0];
      if (code) {
        setIsInviteOpen(true);
      }
    }
  }, []);

  const handleRetryConnection = async () => {
    setServerError(null);
    await initAuth();
    await fetchRooms();
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-bg-main overflow-hidden text-text-primary select-none">
      {/* Sleek Custom Window TitleBar */}
      <TitleBar />

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Navigation Rail (68px) */}
        <NavigationRail
          activeTab={activeNavTab}
          onTabChange={setActiveNavTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Room Sidebar (250px) - When on Rooms tab */}
        {activeNavTab === 'rooms' && (
          <RoomSidebar onOpenInvite={() => setIsInviteOpen(true)} />
        )}

        {/* Friends View - When on Friends tab */}
        {activeNavTab === 'friends' && (
          <div className="w-[250px] h-full bg-bg-secondary border-r border-border-subtle p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                Community Directory
              </h2>
              <div className="space-y-2">
                {['Kian', 'Arash', 'Sina', 'Reza', 'Ali'].map((name) => (
                  <div
                    key={name}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-bg-elevated/40 border border-border-subtle/50"
                  >
                    <div className="w-7 h-7 rounded-full bg-bg-secondary flex items-center justify-center text-xs font-bold text-text-primary">
                      {name[0]}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text-primary">{name}</span>
                      <span className="text-[10px] text-online">Active Member</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg-main text-xs font-semibold"
            >
              Invite New Friend
            </button>
          </div>
        )}

        {/* Activity View - When on Activity tab */}
        {activeNavTab === 'activity' && (
          <div className="w-[250px] h-full bg-bg-secondary border-r border-border-subtle p-4">
            <h2 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
              Session Activity
            </h2>
            <div className="space-y-2.5 text-xs text-text-secondary">
              <div className="p-2.5 rounded-lg bg-bg-elevated/40 border border-border-subtle/50">
                <span className="text-text-primary font-medium block">Watch party</span>
                <span className="text-[11px] text-text-muted">High activity last night</span>
              </div>
              <div className="p-2.5 rounded-lg bg-bg-elevated/40 border border-border-subtle/50">
                <span className="text-text-primary font-medium block">Late lobby</span>
                <span className="text-[11px] text-accent">Active now</span>
              </div>
            </div>
          </div>
        )}

        {/* Center Main Stage */}
        <ScreenStage
          onOpenScreenShareModal={() => setIsScreenShareOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenInvite={() => setIsInviteOpen(true)}
        />

        {/* Participant Panel (260px) */}
        <ParticipantPanel />
      </div>

      {/* Global Modals */}
      <ScreenShareModal
        isOpen={isScreenShareOpen}
        onClose={() => setIsScreenShareOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />

      <OnboardingModal isOpen={!authLoading && !user} />

      {/* Server Offline Alert Banner if backend is not reachable */}
      {serverError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-destructive/90 text-white text-xs font-medium flex items-center gap-3 shadow-card z-50">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
          <button
            onClick={handleRetryConnection}
            className="px-2 py-1 rounded bg-black/20 hover:bg-black/30 text-white font-semibold flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
};
