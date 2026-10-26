import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { RoomSidebar } from './components/layout/RoomSidebar';
import { ChatStage } from './components/chat/ChatStage';
import { ParticipantPanel } from './components/layout/ParticipantPanel';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { SoundboardActiveBar } from './components/voice/SoundboardActiveBar';
import { MobileBottomNav, MobileTab } from './components/layout/MobileBottomNav';
import { useMobileLayout } from './hooks/useMobileLayout';

// Lazy-load secondary modals to minimize initial bundle size and speed up FCP
const ScreenShareModal = React.lazy(() =>
  import('./components/modals/ScreenShareModal').then((m) => ({ default: m.ScreenShareModal }))
);
const SettingsModal = React.lazy(() =>
  import('./components/modals/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const InviteModal = React.lazy(() =>
  import('./components/modals/InviteModal').then((m) => ({ default: m.InviteModal }))
);
const ServerPingModal = React.lazy(() =>
  import('./components/modals/ServerPingModal').then((m) => ({ default: m.ServerPingModal }))
);
const SoundboardModal = React.lazy(() =>
  import('./components/modals/SoundboardModal').then((m) => ({ default: m.SoundboardModal }))
);
const MusicQueueModal = React.lazy(() =>
  import('./components/modals/MusicQueueModal').then((m) => ({ default: m.MusicQueueModal }))
);

import { useAuthStore } from './stores/auth.store';
import { useServerStore } from './stores/server.store';
import { useLiveKitStore } from './stores/livekit.store';
import { useSettingsStore } from './stores/settings.store';
import { useSoundboardStore } from './stores/soundboard.store';
import { ShieldAlert, RefreshCw, Server, Check, Loader2 } from 'lucide-react';
import { getApiBase, setApiBase, api } from './lib/api';
import { extractInviteCode } from '@nightshift/shared';

export const App: React.FC = () => {
  const [isMembersOpen, setIsMembersOpen] = useState(true);
  const [isScreenShareOpen, setIsScreenShareOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteInitialCode, setInviteInitialCode] = useState('');
  const [isServerPingOpen, setIsServerPingOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('channels');
  const { isMobile } = useMobileLayout();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showEditServer, setShowEditServer] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBase());

  const { user, isLoading: authLoading, initAuth } = useAuthStore();
  const { fetchServers } = useServerStore();
  const { toggleMute, toggleDeafen, setPushToTalkActive, isReconnecting, reconnectSecondsLeft } = useLiveKitStore();
  const { inputMode, pushToTalkKey } = useSettingsStore();

  const handleOpenScreenShare = async () => {
    const livekit = useLiveKitStore.getState();
    if (livekit.isScreenSharing) {
      await livekit.stopScreenShare();
      return;
    }
    if (window.nightshift?.isElectron) {
      setIsScreenShareOpen(true);
    } else {
      await livekit.startScreenShare();
    }
  };

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

          // Auto-reconnect to active voice channel if browser was refreshed
          const savedVoice = sessionStorage.getItem('nightshift_active_voice_session');
          if (savedVoice) {
            try {
              const parsed = JSON.parse(savedVoice);
              if (parsed?.channelId) {
                if (parsed.serverId && useServerStore.getState().activeServerId !== parsed.serverId) {
                  await useServerStore.getState().selectServer(parsed.serverId);
                }
                useServerStore.getState().setActiveVoiceChannel(parsed.channelId);
                useServerStore.getState().setJoiningVoiceChannel(parsed.channelId);
                const joinData = await api.joinVoiceChannel(parsed.channelId);
                const ok = await useLiveKitStore.getState().connect(joinData.livekitUrl, joinData.token);
                useServerStore.getState().setJoiningVoiceChannel(null);
                if (!ok) {
                  sessionStorage.removeItem('nightshift_active_voice_session');
                }
              }
            } catch (reconnectErr) {
              console.warn('Voice auto-reconnect error on page refresh:', reconnectErr);
              sessionStorage.removeItem('nightshift_active_voice_session');
              useServerStore.getState().setJoiningVoiceChannel(null);
            }
          }
        }
      } catch (err: any) {
        console.error('Auth initialization error:', err);
      }

      // Initialize soundboard library & engine settings
      try {
        await useSoundboardStore.getState().loadSounds();
      } catch (err) {
        console.error('Soundboard initialization error:', err);
      }
    };

    initialize();

    // Check for invite links in URL query (?invite=code) or hash (#invite=code) or path (/invite/code)
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const queryInvite = searchParams.get('invite');
      let hashInvite: string | null = null;
      if (window.location.hash.includes('invite=')) {
        hashInvite = window.location.hash.split('invite=')[1]?.split('&')[0];
      }
      let pathInvite: string | null = null;
      if (window.location.pathname.includes('/invite/')) {
        pathInvite = window.location.pathname.split('/invite/')[1]?.split('/')[0];
      }
      const rawInvite = queryInvite || hashInvite || pathInvite || '';
      const code = extractInviteCode(rawInvite);
      if (code) {
        setInviteInitialCode(code);
        setIsInviteOpen(true);
      }
    } catch {}
  }, []);

  // When user signs in or changes, load servers
  useEffect(() => {
    if (user) {
      fetchServers();
    }
  }, [user?.id]);

  // Register global PTT hotkey with Electron main process (for background & games)
  useEffect(() => {
    if (window.nightshift?.setGlobalPttKey) {
      window.nightshift.setGlobalPttKey(pushToTalkKey, inputMode === 'push-to-talk').catch(() => {});
    }
  }, [pushToTalkKey, inputMode]);

  // Listen for global PTT changes (works outside app and in games)
  useEffect(() => {
    if (!window.nightshift?.onGlobalPttChange) return;

    const cleanup = window.nightshift.onGlobalPttChange((isDown: boolean) => {
      if (inputMode === 'push-to-talk') {
        setPushToTalkActive(isDown);
      }
    });

    return cleanup;
  }, [inputMode]);

  // Global hotkeys for in-app Push-to-Talk, Mute (Ctrl+Shift+M), Deafen (Ctrl+Shift+D), Soundboard (Ctrl+Shift+S)
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
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Hotkey: Ctrl+Shift+S or Cmd+Shift+S -> Toggle Soundboard
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        const current = useSoundboardStore.getState().isSoundboardOpen;
        useSoundboardStore.getState().setSoundboardOpen(!current);
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
        return;
      }

      // Soundboard individual hotkey triggers (e.g. Numpad1, KeyZ, etc.)
      if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const sounds = useSoundboardStore.getState().sounds;
        const matchingSound = sounds.find((s) => s.hotkey && s.hotkey.toLowerCase() === e.code.toLowerCase());
        if (matchingSound) {
          e.preventDefault();
          useSoundboardStore.getState().handleHotkeyTrigger(matchingSound.id);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
      {!isMobile && <TitleBar />}

      {/* Floating Soundboard Active / Now Playing Bar */}
      <SoundboardActiveBar />

      {/* Reconnecting countdown notice */}
      {isReconnecting && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-amber-500 text-black font-bold text-xs shadow-2xl backdrop-blur-md animate-pulse border border-amber-300">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>ارتباط اینترنت با سرور صوتی قطع شده است. در حال تلاش برای اتصال مجدد ({reconnectSecondsLeft} ثانیه)...</span>
        </div>
      )}

      {isMobile ? (
        /* ── Mobile Layout: Single visible panel + bottom nav ── */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ paddingBottom: 60 }}>
          {/* Channels Sidebar Panel */}
          <div className={mobileTab === 'channels' ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <RoomSidebar
              onOpenInvite={() => {
                setInviteInitialCode('');
                setIsInviteOpen(true);
                setMobileTab('chat');
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenScreenShareModal={handleOpenScreenShare}
              isMobile
              onMobileChannelSelect={() => setMobileTab('chat')}
            />
          </div>

          {/* Chat / Voice Panel */}
          <div className={mobileTab === 'chat' ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <ChatStage
              onToggleMembers={() => setMobileTab('members')}
              isMembersOpen={false}
              onOpenScreenShareModal={handleOpenScreenShare}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenInvite={() => {
                setInviteInitialCode('');
                setIsInviteOpen(true);
              }}
              onOpenServers={() => setIsServerPingOpen(true)}
              isMobile
              onMobileBack={() => setMobileTab('channels')}
            />
          </div>

          {/* Members Panel */}
          <div className={mobileTab === 'members' ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <ParticipantPanel isMobile />
          </div>

          {/* Mobile Bottom Navigation */}
          <MobileBottomNav
            activeTab={mobileTab}
            onTabChange={setMobileTab}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>
      ) : (
        /* ── Desktop Layout: 3-Column ── */
        <div className="flex-1 flex min-h-0 relative overflow-hidden">
          {/* Column 1: Left Channel & Server Sidebar (260px) */}
          <RoomSidebar
            onOpenInvite={() => {
              setInviteInitialCode('');
              setIsInviteOpen(true);
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenScreenShareModal={handleOpenScreenShare}
          />

          {/* Column 2: Center Main View with Discord Top Bar, Chat Stage, and Floating Input */}
          <ChatStage
            onToggleMembers={() => setIsMembersOpen(!isMembersOpen)}
            isMembersOpen={isMembersOpen}
            onOpenScreenShareModal={handleOpenScreenShare}
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
      )}

      {/* Global Modals (Lazy Loaded on Demand) */}
      <React.Suspense fallback={null}>
        {isScreenShareOpen && window.nightshift?.isElectron && (
          <ScreenShareModal
            isOpen={isScreenShareOpen}
            onClose={() => setIsScreenShareOpen(false)}
          />
        )}

        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {isInviteOpen && (
          <InviteModal
            isOpen={isInviteOpen}
            onClose={() => {
              setIsInviteOpen(false);
              setInviteInitialCode('');
            }}
            initialCode={inviteInitialCode}
          />
        )}

        {isServerPingOpen && (
          <ServerPingModal
            isOpen={isServerPingOpen}
            onClose={() => setIsServerPingOpen(false)}
          />
        )}

        {/* NIGHTSHIFT Soundboard Modal */}
        <SoundboardModal />
        {/* NIGHTSHIFT Music Queue & Playlist Modal */}
        <MusicQueueModal />
      </React.Suspense>

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
