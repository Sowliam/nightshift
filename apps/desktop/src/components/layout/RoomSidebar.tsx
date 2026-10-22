import React, { useState, useEffect, useRef } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  Mic,
  MicOff,
  Headphones,
  VolumeX,
  Monitor,
  Settings,
  Trash2,
  LogOut,
  UserPlus,
  FolderPlus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useServerStore } from '../../stores/server.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { api } from '../../lib/api';
import { ConnectionState } from 'livekit-client';
import { VoiceConnectedPanel } from '../voice/VoiceConnectedPanel';

interface RoomSidebarProps {
  onOpenInvite: () => void;
  onOpenSettings: () => void;
  onOpenScreenShareModal: () => void;
}

export const RoomSidebar: React.FC<RoomSidebarProps> = ({
  onOpenInvite,
  onOpenSettings,
  onOpenScreenShareModal,
}) => {
  const {
    servers,
    activeServerId,
    channels,
    activeChannelId,
    activeVoiceChannelId,
    joiningVoiceChannelId,
    selectServer,
    createServer,
    deleteServer,
    leaveServer,
    selectChannel,
    createChannel,
    setActiveVoiceChannel,
    setJoiningVoiceChannel,
    unreadMentions,
    members,
  } = useServerStore();

  const {
    connect,
    disconnect,
    connectionState,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    localParticipant,
    remoteParticipants,
    activeSpeakers,
    isLocallySpeaking,
    isScreenSharing,
    activeScreenTrack,
    screenSharerIdentity,
  } = useLiveKitStore();

  const { setSelfMuted, setSelfDeafened } = useSettingsStore();

  const { user } = useAuthStore();

  const [isServerMenuOpen, setIsServerMenuOpen] = useState(false);
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [isServerSubmitting, setIsServerSubmitting] = useState(false);
  const [serverCreateError, setServerCreateError] = useState<string | null>(null);

  const [isCreatingChannel, setIsCreatingChannel] = useState<'text' | 'voice' | null>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [isChannelSubmitting, setIsChannelSubmitting] = useState(false);
  const [channelCreateError, setChannelCreateError] = useState<string | null>(null);

  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [isJoinSubmitting, setIsJoinSubmitting] = useState(false);
  const [joinInviteError, setJoinInviteError] = useState<string | null>(null);

  const isJoiningRef = useRef(false);

  const activeServer = servers.find((s) => s.id === activeServerId) || null;
  const isOwner = activeServer?.role === 'owner';

  // Periodic heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      api.sendHeartbeat();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleJoinVoiceChannel = async (channelId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!user) {
      alert('Please log in first to join a voice channel');
      return;
    }

    // Immediately select channel to update UI view
    selectChannel(channelId);

    // If already connected to this voice channel, stay connected
    if (activeVoiceChannelId === channelId && connectionState === ConnectionState.Connected) {
      return;
    }

    if (isJoiningRef.current) return;
    isJoiningRef.current = true;

    try {
      if (activeVoiceChannelId && activeVoiceChannelId !== channelId && connectionState !== ConnectionState.Disconnected) {
        await disconnect();
      }

      setJoiningVoiceChannel(channelId);

      const joinData = await api.joinVoiceChannel(channelId);
      setActiveVoiceChannel(channelId);
      const ok = await connect(joinData.livekitUrl, joinData.token);
      setJoiningVoiceChannel(null);
      if (!ok) {
        const lastErr = useLiveKitStore.getState().error;
        console.warn('LiveKit connect returned false:', lastErr);
      }
    } catch (err: any) {
      console.error('Failed to join voice channel:', err);
      setJoiningVoiceChannel(null);
      alert(err.message || 'Failed to join voice channel');
    } finally {
      isJoiningRef.current = false;
    }
  };

  const handleCreateServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newServerName.trim();
    if (!cleanName) {
      setServerCreateError('Please enter a server name');
      return;
    }
    if (cleanName.length < 2) {
      setServerCreateError('Server name must be at least 2 characters');
      return;
    }
    if (cleanName.length > 50) {
      setServerCreateError('Server name cannot exceed 50 characters');
      return;
    }

    setIsServerSubmitting(true);
    setServerCreateError(null);

    try {
      const created = await createServer(cleanName);
      if (created) {
        setNewServerName('');
        setServerCreateError(null);
        setIsCreatingServer(false);
        setIsServerMenuOpen(false);
      } else {
        const lastErr = useServerStore.getState().error;
        setServerCreateError(lastErr || 'Could not create server. Please check your backend connection.');
      }
    } catch (err: any) {
      setServerCreateError(err.message || 'Failed to create server');
    } finally {
      setIsServerSubmitting(false);
    }
  };

  const handleJoinInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinInviteCode.trim();
    if (!cleanCode) {
      setJoinInviteError('Please enter an invite code');
      return;
    }
    if (cleanCode.length < 4) {
      setJoinInviteError('Invite code must be at least 4 characters');
      return;
    }

    setIsJoinSubmitting(true);
    setJoinInviteError(null);

    try {
      const joined = await useServerStore.getState().joinByInvite(cleanCode);
      if (joined) {
        setJoinInviteCode('');
        setJoinInviteError(null);
        setIsJoiningInvite(false);
        setIsServerMenuOpen(false);
      } else {
        const lastErr = useServerStore.getState().error;
        setJoinInviteError(lastErr || 'Invalid or expired invite code');
      }
    } catch (err: any) {
      setJoinInviteError(err.message || 'Failed to join server');
    } finally {
      setIsJoinSubmitting(false);
    }
  };

  const handleCreateChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newChannelName.trim();
    if (!cleanName || !activeServerId || !isCreatingChannel) {
      setChannelCreateError('Please enter a channel name');
      return;
    }
    if (cleanName.length < 2) {
      setChannelCreateError('Channel name must be at least 2 characters');
      return;
    }
    if (cleanName.length > 50) {
      setChannelCreateError('Channel name cannot exceed 50 characters');
      return;
    }

    setIsChannelSubmitting(true);
    setChannelCreateError(null);

    try {
      const created = await createChannel(activeServerId, cleanName, isCreatingChannel);
      if (created) {
        setNewChannelName('');
        setChannelCreateError(null);
        setIsCreatingChannel(null);
      } else {
        const lastErr = useServerStore.getState().error;
        setChannelCreateError(lastErr || 'Failed to create channel');
      }
    } catch (err: any) {
      setChannelCreateError(err.message || 'Failed to create channel');
    } finally {
      setIsChannelSubmitting(false);
    }
  };

  const textChannels = channels.filter((c) => c.type === 'text');
  const voiceChannels = channels.filter((c) => c.type === 'voice');

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="w-[260px] h-full bg-bg-secondary border-r border-border-subtle flex flex-col justify-between select-none shrink-0 z-20">
      {/* Top Header & Channels */}
      <div className="flex flex-col h-full overflow-hidden">
        {/* Window Traffic Lights & Server Brand */}
        <div className="p-4 border-b border-border-subtle shrink-0 relative">
          {/* Traffic Light Window Controls */}
          <div className="flex items-center gap-2 mb-3.5 app-region-no-drag">
            <span
              onClick={() => (window as any).nightshift?.windowClose?.()}
              className="w-3 h-3 rounded-full bg-[#ED6A5E] hover:opacity-80 transition-opacity cursor-pointer shadow-sm"
              title="Close"
            />
            <span
              onClick={() => (window as any).nightshift?.windowMinimize?.()}
              className="w-3 h-3 rounded-full bg-[#F5BF4F] hover:opacity-80 transition-opacity cursor-pointer shadow-sm"
              title="Minimize"
            />
            <span
              onClick={() => (window as any).nightshift?.windowMaximize?.()}
              className="w-3 h-3 rounded-full bg-[#61C554] hover:opacity-80 transition-opacity cursor-pointer shadow-sm"
              title="Maximize"
            />
          </div>

          {/* Server Selector Bar */}
          <div
            onClick={() => setIsServerMenuOpen(!isServerMenuOpen)}
            className="flex items-center justify-between p-1.5 -mx-1.5 rounded-xl hover:bg-bg-elevated/60 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-bg-elevated border border-border-strong flex items-center justify-center p-1 shadow-sm shrink-0">
                <img
                  src="/logo.png"
                  className="w-full h-full object-contain"
                  alt="Nightshift Logo"
                />
              </div>
              <span className="text-sm font-bold text-text-primary tracking-wide truncate group-hover:text-highlight transition-colors">
                {activeServer ? activeServer.name : 'Select or Create Server'}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-highlight transition-colors shrink-0" />
          </div>

          {/* Server Context Dropdown Menu */}
          {isServerMenuOpen && (
            <div className="absolute top-20 left-3 right-3 bg-bg-elevated border border-border rounded-xl shadow-card p-2 z-50 space-y-1">
              {/* Server List */}
              {servers.length > 0 && (
                <div className="pb-2 border-b border-border-subtle space-y-1">
                  <div className="text-[10px] font-bold text-text-muted uppercase px-2 py-0.5">Your Servers</div>
                  {servers.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        selectServer(s.id);
                        setIsServerMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        s.id === activeServerId
                          ? 'bg-highlight text-highlight-text'
                          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="text-[10px] opacity-75">{s.role}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <button
                onClick={() => {
                  setIsCreatingServer(true);
                  setIsServerMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-highlight hover:bg-bg-hover transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Create New Server</span>
              </button>

              <button
                onClick={() => {
                  setIsJoiningInvite(true);
                  setIsServerMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Join with Invite Code</span>
              </button>

              {activeServer && (
                <>
                  <button
                    onClick={() => {
                      onOpenInvite();
                      setIsServerMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Server Invites</span>
                  </button>

                  <button
                    onClick={async () => {
                      if (window.confirm(`Leave server ${activeServer.name}?`)) {
                        await leaveServer(activeServer.id);
                        setIsServerMenuOpen(false);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/15 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave Server</span>
                  </button>

                  {isOwner && (
                    <button
                      onClick={async () => {
                        if (window.confirm(`Are you sure you want to permanently delete "${activeServer.name}"?`)) {
                          await deleteServer(activeServer.id);
                          setIsServerMenuOpen(false);
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-destructive hover:bg-destructive/15 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Server</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Channels Section */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {!activeServer ? (
            <div className="p-4 text-center text-xs text-text-muted space-y-3">
              <p>You have no servers yet. Create one or join with an invite code to begin.</p>
              <button
                onClick={() => setIsCreatingServer(true)}
                className="w-full py-2 rounded-xl bg-highlight hover:bg-white text-highlight-text font-bold text-xs shadow-sm"
              >
                Create a Server
              </button>
            </div>
          ) : (
            <>
              {/* TEXT CHANNELS */}
              <div>
                <div className="flex items-center justify-between px-2 mb-1.5">
                  <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
                    Text Channels
                  </span>
                  {activeServer.role !== 'member' && (
                    <button
                      onClick={() => setIsCreatingChannel('text')}
                      className="text-text-muted hover:text-highlight transition-colors p-0.5"
                      title="Create Text Channel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {textChannels.map((c) => {
                    const isSelected = activeChannelId === c.id;
                    const hasMention = unreadMentions.has(c.id);

                    return (
                      <div
                        key={c.id}
                        onClick={() => selectChannel(c.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer group transition-all ${
                          isSelected
                            ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                            : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Hash className={`w-4 h-4 shrink-0 ${isSelected ? 'text-highlight-text' : 'text-highlight'}`} />
                          <span className="text-xs truncate">{c.name}</span>
                        </div>

                        {hasMention && !isSelected && (
                          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* VOICE CHANNELS */}
              <div>
                <div className="flex items-center justify-between px-2 mb-1.5">
                  <span className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
                    Voice Channels
                  </span>
                  {activeServer.role !== 'member' && (
                    <button
                      onClick={() => setIsCreatingChannel('voice')}
                      className="text-text-muted hover:text-highlight transition-colors p-0.5"
                      title="Create Voice Channel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  {voiceChannels.map((c) => {
                    const isConnected = activeVoiceChannelId === c.id && connectionState === ConnectionState.Connected;
                    const isConnecting = joiningVoiceChannelId === c.id;

                    return (
                      <div key={c.id} className="space-y-0.5">
                        <div
                          onClick={(e) => handleJoinVoiceChannel(c.id, e)}
                          className={`flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer group transition-all active:scale-[0.98] ${
                            isConnected
                              ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                              : isConnecting
                              ? 'bg-bg-elevated text-highlight'
                              : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                          }`}
                          title="Click to join voice channel"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isConnecting ? (
                              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-highlight" />
                            ) : (
                              <Volume2 className={`w-4 h-4 shrink-0 ${isConnected ? 'text-highlight-text' : 'text-highlight'}`} />
                            )}
                            <span className="text-xs truncate">{c.name}</span>
                          </div>

                          {isConnected && (
                            <span className="w-2 h-2 rounded-full bg-online animate-pulse" />
                          )}
                          {isConnecting && (
                            <span className="text-[10px] text-highlight font-mono animate-pulse">Connecting...</span>
                          )}
                        </div>

                        {/* Discord-style Participants List: Rendered directly underneath this voice channel */}
                        {isConnected && (
                          <div className="ml-4 pl-2.5 border-l-2 border-border-subtle my-1 space-y-1">
                            {/* 1. Local Participant (Current User) */}
                            <div className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-bg-elevated/80 group transition-all text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`relative w-5 h-5 rounded-full bg-highlight flex items-center justify-center text-[10px] font-black text-highlight-text shrink-0 shadow-sm transition-all ${
                                    (isLocallySpeaking || (localParticipant && activeSpeakers.has(localParticipant.identity)))
                                      ? 'ring-2 ring-online ring-offset-1 ring-offset-bg-secondary'
                                      : ''
                                  }`}
                                >
                                  {getInitials(user?.displayName || 'You')}
                                </div>
                                <span className="text-xs font-semibold text-text-primary truncate">
                                  {user?.displayName || 'You'} <span className="text-[10px] text-text-muted font-normal">(you)</span>
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {isScreenSharing && (
                                  <span className="px-1 py-0.5 text-[9px] font-black rounded bg-highlight/20 text-highlight border border-highlight/40 flex items-center gap-0.5 shadow-sm">
                                    <Monitor className="w-2.5 h-2.5" />
                                    LIVE
                                  </span>
                                )}
                                {isDeafened ? (
                                  <VolumeX className="w-3.5 h-3.5 text-destructive shrink-0" title="Deafened" />
                                ) : isMuted ? (
                                  <MicOff className="w-3.5 h-3.5 text-destructive shrink-0" title="Muted" />
                                ) : null}
                              </div>
                            </div>

                            {/* 2. Remote Participants */}
                            {remoteParticipants.map((p) => {
                              const isSpeaking = activeSpeakers.has(p.identity) || p.isSpeaking;
                              const isSharing = p.isScreenShareEnabled || (activeScreenTrack && screenSharerIdentity === p.identity);
                              const isRemoteMuted = !p.isMicrophoneEnabled;
                              const serverMember = members.find((m) => m.userId === p.identity || m.username === p.identity);
                              const displayName = p.name || serverMember?.displayName || p.identity;

                              return (
                                <div
                                  key={p.identity}
                                  className="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-bg-elevated/80 group transition-all text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div
                                      className={`relative w-5 h-5 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-[10px] font-bold text-text-primary shrink-0 shadow-sm transition-all ${
                                        isSpeaking
                                          ? 'ring-2 ring-online ring-offset-1 ring-offset-bg-secondary'
                                          : ''
                                      }`}
                                    >
                                      {getInitials(displayName)}
                                    </div>
                                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary truncate">
                                      {displayName}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {isSharing && (
                                      <span className="px-1 py-0.5 text-[9px] font-black rounded bg-highlight/20 text-highlight border border-highlight/40 flex items-center gap-0.5 shadow-sm">
                                        <Monitor className="w-2.5 h-2.5" />
                                        LIVE
                                      </span>
                                    )}
                                    {isRemoteMuted && (
                                      <MicOff className="w-3.5 h-3.5 text-text-muted shrink-0" title="Muted" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Voice Connected Panel (Shown when user is connected to voice) */}
        {activeVoiceChannelId && connectionState === ConnectionState.Connected && (
          <VoiceConnectedPanel
            onDisconnect={disconnect}
            onOpenSettings={onOpenSettings}
            onOpenScreenShareModal={onOpenScreenShareModal}
          />
        )}

        {/* User Identity Footer Profile */}
        <div className="p-3 bg-bg-main border-t border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-highlight border border-border-subtle flex items-center justify-center text-xs font-black text-highlight-text shrink-0 shadow-sm">
              {user ? getInitials(user.displayName) : 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-text-primary truncate">
                {user?.displayName || 'Connecting...'}
              </span>
              <span className="text-[10px] text-text-muted truncate font-mono">
                @{user?.username || 'user'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                toggleMute();
                setSelfMuted(!isMuted);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                isMuted
                  ? 'bg-destructive/20 text-destructive'
                  : 'text-highlight hover:bg-bg-elevated hover:text-white'
              }`}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              onClick={() => {
                toggleDeafen();
                setSelfDeafened(!isDeafened);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                isDeafened
                  ? 'bg-destructive/20 text-destructive'
                  : 'text-highlight hover:bg-bg-elevated hover:text-white'
              }`}
              title={isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
            >
              <Headphones className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-highlight hover:bg-bg-elevated hover:text-white transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Create Server */}
      {isCreatingServer && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="w-[380px] bg-bg-secondary border border-border rounded-2xl p-5 shadow-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Create Your Server</h3>
            <form onSubmit={handleCreateServerSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">Server Name</label>
                <input
                  type="text"
                  autoFocus
                  disabled={isServerSubmitting}
                  placeholder="e.g. Nightshift Squad"
                  value={newServerName}
                  onChange={(e) => {
                    setNewServerName(e.target.value);
                    if (serverCreateError) setServerCreateError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-main border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight disabled:opacity-50"
                />
              </div>

              {serverCreateError && (
                <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{serverCreateError}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isServerSubmitting}
                  onClick={() => {
                    setIsCreatingServer(false);
                    setServerCreateError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isServerSubmitting || newServerName.trim().length < 2}
                  className="px-4 py-1.5 rounded-lg bg-highlight hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-highlight-text font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {isServerSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Join Server By Invite */}
      {isJoiningInvite && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="w-[380px] bg-bg-secondary border border-border rounded-2xl p-5 shadow-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Join a Server with Code</h3>
            <form onSubmit={handleJoinInviteSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">Invite Code</label>
                <input
                  type="text"
                  autoFocus
                  disabled={isJoinSubmitting}
                  placeholder="e.g. 8-letter code"
                  value={joinInviteCode}
                  onChange={(e) => {
                    setJoinInviteCode(e.target.value);
                    if (joinInviteError) setJoinInviteError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-main border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight font-mono disabled:opacity-50"
                />
              </div>

              {joinInviteError && (
                <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{joinInviteError}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isJoinSubmitting}
                  onClick={() => {
                    setIsJoiningInvite(false);
                    setJoinInviteError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isJoinSubmitting || joinInviteCode.trim().length < 4}
                  className="px-4 py-1.5 rounded-lg bg-highlight hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-highlight-text font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {isJoinSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    'Join Server'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Channel */}
      {isCreatingChannel && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="w-[380px] bg-bg-secondary border border-border rounded-2xl p-5 shadow-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary">
              Create {isCreatingChannel === 'text' ? 'Text' : 'Voice'} Channel
            </h3>
            <form onSubmit={handleCreateChannelSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase mb-1">Channel Name</label>
                <input
                  type="text"
                  autoFocus
                  disabled={isChannelSubmitting}
                  placeholder={isCreatingChannel === 'text' ? 'new-channel' : 'Voice Lounge'}
                  value={newChannelName}
                  onChange={(e) => {
                    setNewChannelName(e.target.value);
                    if (channelCreateError) setChannelCreateError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-bg-main border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight disabled:opacity-50"
                />
              </div>

              {channelCreateError && (
                <div className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{channelCreateError}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isChannelSubmitting}
                  onClick={() => {
                    setIsCreatingChannel(null);
                    setChannelCreateError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isChannelSubmitting || newChannelName.trim().length < 2}
                  className="px-4 py-1.5 rounded-lg bg-highlight hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-highlight-text font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {isChannelSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
