import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Copy,
  Check,
  Play,
  EyeOff,
  MicOff,
  Headphones,
  Shield,
  RotateCcw,
  Music,
  Square,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';

export interface UserContextMenuTarget {
  identity: string;
  name: string;
  avatarUrl?: string;
  isLocal?: boolean;
  isScreenSharing?: boolean;
  role?: string;
  isServerMuted?: boolean;
  isServerDeafened?: boolean;
}

export interface UserContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  target: UserContextMenuTarget | null;
  onClose: () => void;
  // Optional server moderation
  canModerate?: boolean;
  onServerMute?: (userId: string) => void;
  onServerDeafen?: (userId: string) => void;
  onKick?: (userId: string) => void;
  onBan?: (userId: string) => void;
}

export const UserContextMenu: React.FC<UserContextMenuProps> = ({
  isOpen,
  x,
  y,
  target,
  onClose,
  canModerate,
  onServerMute,
  onServerDeafen,
  onKick,
  onBan,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const {
    watchedScreenShareIds,
    startWatchingStream,
    stopWatchingStream,
    setParticipantVolume,
    toggleMuteForMyself,
    activeSoundboardPlayers,
    setParticipantSoundboardVolume,
    toggleMuteSoundboardForMyself,
  } = useLiveKitStore();

  const localMutedUsers = useSettingsStore((s) => s.localMutedUsers);
  const participantVolumes = useSettingsStore((s) => s.participantVolumes);
  const soundboardVolumes = useSettingsStore((s) => s.soundboardVolumes);
  const localMutedSoundboards = useSettingsStore((s) => s.localMutedSoundboards);

  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const stopSound = useSoundboardStore((s) => s.stopSound);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !target) return null;

  const isLocal = !!target.isLocal;
  const isLocallyMuted = !!localMutedUsers[target.identity];
  const userVolume = participantVolumes[target.identity] ?? 100;
  const isWatchingThisStream = watchedScreenShareIds.has(target.identity);

  const remoteSoundPlaying = !isLocal ? activeSoundboardPlayers[target.identity] : null;
  const isSoundboardMuted = !isLocal ? !!localMutedSoundboards[target.identity] : false;
  const soundboardVol = !isLocal ? (soundboardVolumes[target.identity] ?? 100) : 100;

  // Clamp coordinates within the viewport
  const menuWidth = 270;
  const menuHeight = 460;
  const posX = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 12));
  const posY = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 12));

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(target.identity);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Copy ID failed:', err);
    }
  };

  const handleToggleLocalMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMuteForMyself(target.identity);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setParticipantVolume(target.identity, val);
  };

  const handleResetVolume = (e: React.MouseEvent) => {
    e.stopPropagation();
    setParticipantVolume(target.identity, 100);
  };

  const getInitials = (name: string) => {
    return (name || 'U')
      .split(' ')
      .map((p) => p[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div
      ref={menuRef}
      style={{ left: `${posX}px`, top: `${posY}px` }}
      className="fixed z-50 w-[260px] rounded-2xl bg-bg-secondary/95 backdrop-blur-xl border border-border-subtle shadow-2xl p-2 select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1 text-xs"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header: User Profile Info */}
      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-bg-elevated/70 border border-border-subtle/50 mb-1">
        <div className="w-9 h-9 rounded-full bg-bg-main border border-border-subtle flex items-center justify-center font-bold text-text-primary text-xs shrink-0 shadow-sm">
          {getInitials(target.name)}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-text-primary truncate">
              {target.name}
            </span>
            {isLocal && (
              <span className="text-[10px] text-text-muted font-normal bg-bg-main px-1.5 py-0.2 rounded border border-border-subtle">
                You
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-text-muted truncate">
            {target.identity}
          </span>
        </div>
      </div>

      {/* Remote Participant Playing Soundboard Banner */}
      {!isLocal && remoteSoundPlaying && (
        <div className="flex items-center justify-between p-2 rounded-xl bg-accent-bright/15 border border-accent-bright/30 text-accent-bright mb-1 animate-pulse">
          <div className="flex items-center gap-2 min-w-0">
            <Music className="w-4 h-4 shrink-0 animate-bounce" />
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] uppercase font-bold tracking-wider text-accent-bright/80">
                Playing Sound / Music
              </span>
              <span className="font-semibold text-xs truncate text-white">
                {remoteSoundPlaying.soundName}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Local User Active Playing Sounds */}
      {isLocal && localActiveSounds.length > 0 && (
        <div className="p-2 rounded-xl bg-accent-bright/15 border border-accent-bright/30 flex flex-col gap-1.5 mb-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-accent-bright">
            <div className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 animate-bounce" />
              <span>Playing on Soundboard</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent-bright/20 font-mono">
              {localActiveSounds.length} active
            </span>
          </div>
          {localActiveSounds.map((snd) => (
            <div key={snd.soundId} className="flex items-center justify-between bg-black/40 px-2 py-1.5 rounded-lg border border-border-subtle/50 text-xs">
              <span className="text-white truncate font-medium mr-2">{snd.name}</span>
              <button
                onClick={() => stopSound(snd.soundId)}
                className="px-2 py-0.5 rounded bg-destructive hover:bg-destructive/90 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                title="Stop sound immediately"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Local User Sound Controls (Only for other participants) */}
      {!isLocal && (
        <>
          {/* Mute for myself Toggle Button */}
          <button
            onClick={handleToggleLocalMute}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all cursor-pointer ${
              isLocallyMuted
                ? 'bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25'
                : 'hover:bg-bg-hover text-text-primary border border-transparent'
            }`}
            title="Mute this person's microphone voice only for yourself (صدای میکروفون این شخص فقط برای شما قطع می‌شود)"
          >
            <div className="flex items-center gap-2">
              {isLocallyMuted ? (
                <VolumeX className="w-4 h-4 text-destructive shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-text-secondary shrink-0" />
              )}
              <div className="flex flex-col text-left">
                <span className="font-medium text-[11px]">
                  Mute Voice for Myself
                </span>
                <span className="text-[9px] text-text-muted">
                  قطع صدای میکروفون شخص
                </span>
              </div>
            </div>

            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                isLocallyMuted
                  ? 'bg-destructive text-white'
                  : 'bg-bg-elevated text-text-muted'
              }`}
            >
              {isLocallyMuted ? 'MUTED' : 'OFF'}
            </span>
          </button>

          {/* User Voice Volume Slider */}
          <div className="px-2.5 py-2 rounded-xl bg-bg-elevated/40 border border-border-subtle/40 flex flex-col gap-1.5 my-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary font-medium">Voice (Mic) Volume</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold text-text-primary">
                  {isLocallyMuted ? '0%' : `${userVolume}%`}
                </span>
                {userVolume !== 100 && (
                  <button
                    onClick={handleResetVolume}
                    className="p-0.5 rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title="Reset to 100%"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                disabled={isLocallyMuted}
                value={isLocallyMuted ? 0 : userVolume}
                onChange={handleVolumeChange}
                className="w-full h-1.5 bg-bg-main rounded-lg accent-highlight cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={`Adjust mic volume: ${userVolume}%`}
              />
            </div>

            <div className="flex justify-between text-[8px] text-text-muted px-0.5">
              <span>0%</span>
              <span className="font-bold text-text-secondary">100%</span>
              <span>200%</span>
            </div>
          </div>

          {/* Soundboard / Music Audio Controls (Separate from user's voice!) */}
          <div className="px-2.5 py-2 rounded-xl bg-bg-elevated/40 border border-border-subtle/40 flex flex-col gap-1.5 my-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                <Music className="w-3.5 h-3.5 text-accent-bright" />
                <span>Music & Sounds Volume</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold text-accent-bright">
                  {isSoundboardMuted ? '0%' : `${soundboardVol}%`}
                </span>
                {soundboardVol !== 100 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setParticipantSoundboardVolume(target.identity, 100);
                    }}
                    className="p-0.5 rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    title="Reset to 100%"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                disabled={isSoundboardMuted}
                value={isSoundboardMuted ? 0 : soundboardVol}
                onChange={(e) => setParticipantSoundboardVolume(target.identity, Number(e.target.value))}
                className="w-full h-1.5 bg-bg-main rounded-lg accent-accent-bright cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={`Soundboard volume: ${soundboardVol}%`}
              />
            </div>

            <div className="flex justify-between items-center pt-0.5">
              <div className="flex justify-between text-[8px] text-text-muted px-0.5 flex-1 mr-2">
                <span>0%</span>
                <span className="font-bold text-text-secondary">100%</span>
                <span>200%</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMuteSoundboardForMyself(target.identity);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                  isSoundboardMuted
                    ? 'bg-destructive text-white shadow-sm'
                    : 'bg-bg-hover hover:bg-bg-active text-text-muted hover:text-text-primary'
                }`}
                title="Mute only music/sound effects from this user"
              >
                {isSoundboardMuted ? 'UNMUTE SOUNDS' : 'MUTE SOUNDS'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Screen Share Quick Actions */}
      {target.isScreenSharing && !isLocal && (
        <div className="my-0.5 border-t border-border-subtle/50 pt-1">
          {isWatchingThisStream ? (
            <button
              onClick={() => {
                stopWatchingStream(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-destructive/15 text-text-secondary hover:text-destructive transition-colors cursor-pointer"
            >
              <EyeOff className="w-4 h-4 text-destructive shrink-0" />
              <span>Stop Watching Stream</span>
            </button>
          ) : (
            <button
              onClick={() => {
                startWatchingStream(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 font-semibold border border-red-500/30 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Watch Live Stream</span>
            </button>
          )}
        </div>
      )}

      {/* Server Moderation Actions (Owner / Admin) */}
      {canModerate && !isLocal && (
        <div className="my-0.5 border-t border-border-subtle/50 pt-1 flex flex-col gap-0.5">
          <div className="px-2 py-0.5 text-[9px] font-bold uppercase text-text-muted tracking-wider flex items-center gap-1">
            <Shield className="w-3 h-3 text-highlight" />
            <span>Moderation</span>
          </div>

          {onServerMute && (
            <button
              onClick={() => {
                onServerMute(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <MicOff className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span>
                {target.isServerMuted ? 'Server Unmute' : 'Server Mute'}
              </span>
            </button>
          )}

          {onServerDeafen && (
            <button
              onClick={() => {
                onServerDeafen(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5 text-destructive shrink-0" />
              <span>
                {target.isServerDeafened ? 'Server Undeafen' : 'Server Deafen'}
              </span>
            </button>
          )}

          {onKick && (
            <button
              onClick={() => {
                onKick(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/15 text-destructive transition-colors cursor-pointer"
            >
              <span>Kick Member</span>
            </button>
          )}

          {onBan && (
            <button
              onClick={() => {
                onBan(target.identity);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/15 text-destructive transition-colors cursor-pointer"
            >
              <span>Ban Member</span>
            </button>
          )}
        </div>
      )}

      {/* Footer Utilities */}
      <div className="mt-0.5 border-t border-border-subtle/50 pt-1">
        <button
          onClick={handleCopyId}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent-bright shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{copied ? 'Copied ID!' : 'Copy User ID'}</span>
          </div>
          <span className="text-[9px] font-mono text-text-muted">ID</span>
        </button>
      </div>
    </div>
  );
};
