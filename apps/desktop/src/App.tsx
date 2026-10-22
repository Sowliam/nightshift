import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { RoomSidebar } from './components/layout/RoomSidebar';
import { ChatStage } from './components/chat/ChatStage';
import { ParticipantPanel } from './components/layout/ParticipantPanel';
import { ScreenShareModal } from './components/modals/ScreenShareModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { InviteModal } from './components/modals/InviteModal';
import { ServerPingModal } from './components/modals/ServerPingModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { useAuthStore } from './stores/auth.store';
import { useServerStore } from './stores/server.store';
import { useLiveKitStore } from './stores/livekit.store';
import { useSettingsStore } from './stores/settings.store';
import { ShieldAlert, RefreshCw, Server, Check } from 'lucide-react';
import { getApiBase, setApiBase } from './lib/api';

export const App: React.FC = () => {
  const [isMembersOpen, setIsMembersOpen] = useState(true);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteInitialCode, setInviteInitialCode] = useState('');
  const [isServerPingOpen, setIsServerPingOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showEditServer, setShowEditServer] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBase());

  const { user, isLoading: authLoading, initAuth } = useAuthStore();
  const { fetchServers } = useServerStore();
  const { toggleMute, toggleDeafen, setPushToTalkActive } = useLiveKitStore();
  const { inputMode, pushToTalkKey } = useSettingsStore();

  useEffect(() => {
    const initialize = async () => {
      try {
        await api.getHealth();
        setServerError(null);
      } catch (err: any) {
        console.warn('Backend connection check:', err);
        setServerError(err.message || `Cannot connect to NIGHTSHIFT backend at ${getApiBase()}.`);
      }

      try {
        await initAuth();
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          await fetchServers();
        }
      } catch (err: any) {
        console.error('Auth initialization error:', err);
      }
    };

    initialize();

    // Check for invite links in URL hash: #invite=code
    if (window.location.hash.includes('invite=')) {
      const code = window.location.hash.split('invite=')[1]?.split('&')[0];
      if (code) {
        setInviteInitialCode(code);
        setIsInviteOpen(true);
      }
    }
  }, []);

  // When user signs in or changes, load servers
  useEffect(() => {
    if (user) {
      fetchServers();
    }
  }, [user?.id]);

  // Global hotkeys for Push-to-Talk, Mute (Ctrl+Shift+M), Deafen (Ctrl+Shift+D)
  useEffect(() => {
    const matchesPttKey = (e: KeyboardEvent) => {
      let key = e.code;
      if (e.code === 'Space') key = 'Space';
      else if (e.code.startsWith('Key')) key = e.code.replace('Key', '');
      else if (e.code.startsWith('Digit')) key = e.code.replace('Digit', '');

      return (
        key.toLowerCase() === pushToTalkKey.toLowerCase() ||
        e.code.toLowerCase() === pushToTalkKey.toLowerCase() ||
        e.key.toLowerCase() === pushToTalkKey.toLowerCase()
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // Hotkey: Ctrl+Shift+M or Cmd+Shift+M -> Toggle Mute
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
        return;
      }

      // Hotkey: Ctrl+Shift+D or Cmd+Shift+D -> Toggle Deafen
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleDeafen();
        return;
      }

      // Push-to-Talk KeyDown
      if (inputMode === 'push-to-talk' && !e.repeat && matchesPttKey(e)) {
        e.preventDefault();
        setPushToTalkActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // Push-to-Talk KeyUp
      if (inputMode === 'push-to-talk' && matchesPttKey(e)) {
        e.preventDefault();
        setPushToTalkActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputMode, pushToTalkKey]);

  const handleRetryConnection = async () => {
    setServerError(null);
    try {
      await api.getHealth();
      await initAuth();
      if (useAuthStore.getState().user) {
        await fetchServers();
      }
    } catch (err: any) {
      setServerError(err.message || `Cannot connect to NIGHTSHIFT backend at ${getApiBase()}`);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-bg-main overflow-hidden text-text-primary select-none">
      {/* 1. Desktop Window Frame & TitleBar with Minimize, Maximize, Close */}
      <TitleBar />

      {/* 2. Main 3-Column Layout: Left Channels/Servers, Center Chat/Voice, Right Members */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Column 1: Left Channel & Server Sidebar (260px) */}
        <RoomSidebar
          onOpenInvite={() => {
            setInviteInitialCode('');
            setIsInviteOpen(true);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenScreenShareModal={() => setIsScreenShareOpen(true)}
        />

        {/* Column 2: Center Main View with Discord Top Bar, Chat Stage, and Floating Input */}
        <ChatStage
          onToggleMembers={() => setIsMembersOpen(!isMembersOpen)}
          isMembersOpen={isMembersOpen}
          onOpenScreenShareModal={() => setIsScreenShareOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenInvite={() => {
            setInviteInitialCode('');
            setIsInviteOpen(true);
          }}
          onOpenServers={() => setIsServerPingOpen(true)}
        />

        {/* Column 3: Right Member Sidebar with Real Presence & Moderation (240px) */}
        {isMembersOpen && <ParticipantPanel />}
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
        onClose={() => {
          setIsInviteOpen(false);
          setInviteInitialCode('');
        }}
        initialCode={inviteInitialCode}
      />

      <ServerPingModal
        isOpen={isServerPingOpen}
        onClose={() => setIsServerPingOpen(false)}
      />

      {/* User Onboarding / Login / Registration (Shown when unauthenticated) */}
      <OnboardingModal isOpen={!authLoading && !user} />

      {/* Server Offline Alert Banner */}
      {serverError && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 max-w-lg w-[90%] px-4 py-2.5 rounded-xl bg-destructive/95 text-white text-xs font-medium flex flex-col gap-2 shadow-card z-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 truncate">
              <ShieldAlert className="w-4 h-4 shrink-0 text-white" />
              <span className="truncate">{serverError}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowEditServer(!showEditServer)}
                className="px-2 py-1 rounded bg-black/25 hover:bg-black/40 text-white font-semibold flex items-center gap-1 text-[11px] transition-colors"
              >
                <Server className="w-3 h-3" />
                Change URL
              </button>
              <button
                onClick={handleRetryConnection}
                className="px-2 py-1 rounded bg-black/25 hover:bg-black/40 text-white font-semibold flex items-center gap-1 text-[11px] transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          </div>

          {showEditServer && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-white/20">
              <input
                type="text"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="https://..."
                className="flex-1 px-2.5 py-1 rounded-lg bg-black/40 border border-white/25 text-white text-xs focus:outline-none font-mono placeholder:text-white/50"
              />
              <button
                onClick={async () => {
                  setApiBase(serverUrlInput);
                  setShowEditServer(false);
                  await handleRetryConnection();
                }}
                className="px-3 py-1 rounded-lg bg-white text-destructive font-bold text-xs flex items-center gap-1 hover:bg-white/90 transition-colors shadow-sm"
              >
                <Check className="w-3 h-3" />
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
