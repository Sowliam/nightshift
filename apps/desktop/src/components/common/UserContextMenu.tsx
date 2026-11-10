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
  RotateCcw,
  Music,
  Square,
  UserMinus,
  Ban,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { getFullAvatarUrl } from '../../lib/api';

export interface UserContextMenuTarget {
  identity: string;
  name: string;
  username?: string;
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
  const menuWidth = 272;
  const menuHeight = 440;
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

  const avatarSrc = getFullAvatarUrl(target.avatarUrl);

  const row =
    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary';

  return (
    <div
      ref={menuRef}
      style={{ left: `${posX}px`, top: `${posY}px` }}
      className="fixed z-50 w-[260px] rounded-2xl bg-bg-secondary border border-border shadow-2xl p-2 select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-3 px-2 py-1.5">
        <div className="w-9 h-9 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-xs font-black text-text-primary shrink-0 overflow-hidden">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitials(target.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-text-primary leading-5 truncate">
            {target.name}
          </div>
          <div className="text-[11.5px] text-text-muted leading-4 truncate">
            {isLocal ? 'You' : target.username ? `@${target.username}` : 'Member'}
          </div>
        </div>
      </div>

      {!isLocal && remoteSoundPlaying && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-accent-bright/10 border border-accent-bright/20 text-accent-bright">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-pulse shrink-0" />
          <Music className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium truncate">{remoteSoundPlaying.soundName}</span>
        </div>
      )}

      {isLocal && localActiveSounds.length > 0 && (
        <div className="flex flex-col gap-1">
          {localActiveSounds.map((snd) => (
            <div key={snd.soundId} className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-accent-bright/10 border border-accent-bright/20">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-bright animate-pulse shrink-0" />
              <span className="text-xs font-medium text-text-primary truncate flex-1">{snd.name}</span>
              <button
                type="button"
                onClick={() => stopSound(snd.soundId)}
                className="w-6 h-6 inline-flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/15"
                title="Stop sound"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLocal && (
        <div className="rounded-xl bg-bg-elevated border border-border-subtle p-2 space-y-2.5">
          <button
            type="button"
            onClick={handleToggleLocalMute}
            className={`${row} ${isLocallyMuted ? 'text-destructive hover:text-destructive' : ''}`}
            title="Mute this person's microphone only for you"
          >
            {isLocallyMuted ? (
              <VolumeX className="w-4 h-4 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-text-muted shrink-0" />
            )}
            <span className="flex-1 text-left">{isLocallyMuted ? 'Muted for me' : 'Mute for me'}</span>
            <span className={`w-8 h-[18px] rounded-full relative shrink-0 transition-colors ${isLocallyMuted ? 'bg-destructive' : 'bg-bg-hover'}`}>
              <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-text-primary shadow-sm transition-all ${isLocallyMuted ? 'left-[16px]' : 'left-[2px]'}`} />
            </span>
          </button>

          <div className="px-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Voice</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums text-text-primary">
                {isLocallyMuted ? 'Muted' : `${userVolume}%`}
                {userVolume !== 100 && !isLocallyMuted && (
                  <button
                    type="button"
                    onClick={handleResetVolume}
                    className="w-5 h-5 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover"
                    title="Reset to 100%"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="300"
              step="1"
              disabled={isLocallyMuted}
              value={isLocallyMuted ? 0 : userVolume}
              onChange={handleVolumeChange}
              className="w-full h-1.5 rounded-full accent-highlight cursor-pointer disabled:opacity-40"
              title={`Voice volume ${userVolume}%`}
            />
          </div>

          <div className="px-2.5 pb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <Music className="w-3.5 h-3.5 text-accent-bright" />
                Sounds
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold tabular-nums text-text-primary">
                  {isSoundboardMuted ? 'Muted' : `${soundboardVol}%`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMuteSoundboardForMyself(target.identity);
                  }}
                  className={`h-6 px-2 rounded-lg text-[11px] font-bold ${
                    isSoundboardMuted
                      ? 'bg-destructive text-white'
                      : 'bg-bg-hover text-text-secondary hover:text-text-primary'
                  }`}
                  title="Mute only this person's music and sounds"
                >
                  {isSoundboardMuted ? 'Unmute' : 'Mute'}
                </button>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              disabled={isSoundboardMuted}
              value={isSoundboardMuted ? 0 : soundboardVol}
              onChange={(e) => setParticipantSoundboardVolume(target.identity, Number(e.target.value))}
              className="w-full h-1.5 rounded-full accent-accent-bright cursor-pointer disabled:opacity-40"
              title={`Sounds volume ${soundboardVol}%`}
            />
            {soundboardVol !== 100 && !isSoundboardMuted && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setParticipantSoundboardVolume(target.identity, 100);
                }}
                className="mt-1.5 text-[11px] font-medium text-text-muted hover:text-text-primary"
              >
                Reset sounds
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-bg-elevated border border-border-subtle p-1">
        {target.isScreenSharing && !isLocal && (
          isWatchingThisStream ? (
            <button
              type="button"
              onClick={() => {
                stopWatchingStream(target.identity);
                onClose();
              }}
              className={`${row} text-destructive hover:text-destructive hover:bg-destructive/10`}
            >
              <EyeOff className="w-4 h-4 shrink-0" />
              <span>Stop watching</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                startWatchingStream(target.identity);
                onClose();
              }}
              className={row}
            >
              <Play className="w-4 h-4 fill-current text-destructive shrink-0" />
              <span>Watch stream</span>
            </button>
          )
        )}

        {canModerate && !isLocal && (
          <>
            <div className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Moderation
            </div>
            {onServerMute && (
              <button
                type="button"
                onClick={() => {
                  onServerMute(target.identity);
                  onClose();
                }}
                className={row}
              >
                <MicOff className="w-4 h-4 text-destructive shrink-0" />
                <span>{target.isServerMuted ? 'Server unmute' : 'Server mute'}</span>
              </button>
            )}
            {onServerDeafen && (
              <button
                type="button"
                onClick={() => {
                  onServerDeafen(target.identity);
                  onClose();
                }}
                className={row}
              >
                <Headphones className="w-4 h-4 text-destructive shrink-0" />
                <span>{target.isServerDeafened ? 'Server undeafen' : 'Server deafen'}</span>
              </button>
            )}
            {onKick && (
              <button
                type="button"
                onClick={() => {
                  onKick(target.identity);
                  onClose();
                }}
                className={`${row} text-destructive hover:bg-destructive/10 hover:text-destructive`}
              >
                <UserMinus className="w-4 h-4 shrink-0" />
                <span>Kick</span>
              </button>
            )}
            {onBan && (
              <button
                type="button"
                onClick={() => {
                  onBan(target.identity);
                  onClose();
                }}
                className={`${row} text-destructive hover:bg-destructive/10 hover:text-destructive`}
              >
                <Ban className="w-4 h-4 shrink-0" />
                <span>Ban</span>
              </button>
            )}
          </>
        )}

        <button type="button" onClick={handleCopyId} className={row}>
          {copied ? (
            <Check className="w-4 h-4 text-accent-bright shrink-0" />
          ) : (
            <Copy className="w-4 h-4 text-text-muted shrink-0" />
          )}
          <span>{copied ? 'Copied' : 'Copy user ID'}</span>
        </button>
      </div>
    </div>
  );
};
