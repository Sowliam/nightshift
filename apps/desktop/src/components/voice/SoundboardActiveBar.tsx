import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Headphones,
  Users,
  Music,
  Minimize2,
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useServerStore } from '../../stores/server.store';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

/**
 * Modern Floating Music & Soundboard Player Bar
 * Designed to exactly match the reference design:
 * - Left: Glowing Album Art + ((•)) Now Playing + Song Title + General/Category
 * - Center: Shuffle, Previous, Large Emerald Circular Play/Pause, Next, Repeat
 * - Right: Favorite (Heart), Headphones Monitor, Volume (with slider), Voice Member Count
 * - Bottom: Full-width continuous seekbar with start (e.g. 2:14) and end (e.g. 4:30) timestamps
 */
export const SoundboardActiveBar: React.FC = () => {
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const queue = useSoundboardStore((s) => s.queue);
  const repeatMode = useSoundboardStore((s) => s.repeatMode);
  const isShuffle = useSoundboardStore((s) => s.isShuffle);
  const sounds = useSoundboardStore((s) => s.sounds);

  const playNext = useSoundboardStore((s) => s.playNext);
  const playPrevious = useSoundboardStore((s) => s.playPrevious);
  const toggleShuffle = useSoundboardStore((s) => s.toggleShuffle);
  const toggleRepeat = useSoundboardStore((s) => s.toggleRepeat);
  const seekSound = useSoundboardStore((s) => s.seekSound);
  const toggleFavorite = useSoundboardStore((s) => s.toggleFavorite);
  const setQueueOpen = useSoundboardStore((s) => s.setQueueOpen);

  const localMonitorMuted = useSoundboardStore((s) => s.localMonitorMuted);
  const setLocalMonitorMuted = useSoundboardStore((s) => s.setLocalMonitorMuted);
  const localMonitorVolume = useSoundboardStore((s) => s.localMonitorVolume);
  const setLocalMonitorVolume = useSoundboardStore((s) => s.setLocalMonitorVolume);
  const masterVolume = useSoundboardStore((s) => s.masterVolume);
  const setMasterVolume = useSoundboardStore((s) => s.setMasterVolume);
  const togglePlayPause = useSoundboardStore((s) => s.togglePlayPause);

  const currentUser = useAuthStore((s) => s.user);
  const activeSoundboardPlayers = useLiveKitStore((s) => s.activeSoundboardPlayers);
  const localParticipant = useLiveKitStore((s) => s.localParticipant);
  const remoteParticipants = useLiveKitStore((s) => s.remoteParticipants);
  const setParticipantSoundboardVolume = useLiveKitStore((s) => s.setParticipantSoundboardVolume);
  const toggleMuteSoundboardForMyself = useLiveKitStore((s) => s.toggleMuteSoundboardForMyself);

  const soundboardVolumes = useSettingsStore((s) => s.soundboardVolumes);
  const localMutedSoundboards = useSettingsStore((s) => s.localMutedSoundboards);
  const members = useServerStore((s) => s.members);

  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);
  const [isHeadphonesMenuOpen, setIsHeadphonesMenuOpen] = useState(false);
  const headphonesMenuRef = useRef<HTMLDivElement>(null);
  const volumeSliderRef = useRef<HTMLDivElement>(null);
  const [isMini, setIsMini] = useState(false);
  const [miniPos, setMiniPos] = useState({ x: 24, y: 96 });
  const dragRef = useRef<{
    originX: number;
    originY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; progress: number }>({
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const myIdentity = localParticipant?.identity;
  const myUserId = currentUser?.id;
  const myUsername = currentUser?.username;

  const hasLocalActive = localActiveSounds.length > 0;
  // Strictly filter out the local user so they NEVER see the remote streaming card for their own music!
  const remoteEntries = Object.entries(activeSoundboardPlayers).filter(([identity]) => {
    if (myIdentity && identity === myIdentity) return false;
    if (myUserId && identity === myUserId) return false;
    if (myUsername && identity.toLowerCase() === myUsername.toLowerCase()) return false;
    return true;
  });
  const hasRemoteActive = remoteEntries.length > 0;

  const currentLocalSound = hasLocalActive ? localActiveSounds[0] : null;
  const currentSoundMeta = currentLocalSound ? sounds.find((s) => s.id === currentLocalSound.soundId) : null;

  // Live seek progress loop
  useEffect(() => {
    if (!currentLocalSound) return;

    const interval = setInterval(() => {
      const prog = soundboardAudioEngine.getPlaybackProgress(currentLocalSound.soundId);
      if (prog) {
        setPlaybackProgress(prog);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [currentLocalSound?.soundId]);

  // Click outside to close headphone menu or volume popovers
  useEffect(() => {
    if (!isHeadphonesMenuOpen && !isVolumeSliderOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        headphonesMenuRef.current &&
        !headphonesMenuRef.current.contains(e.target as Node)
      ) {
        setIsHeadphonesMenuOpen(false);
      }
      if (
        volumeSliderRef.current &&
        !volumeSliderRef.current.contains(e.target as Node)
      ) {
        setIsVolumeSliderOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isHeadphonesMenuOpen, isVolumeSliderOpen]);

  if (!hasLocalActive && !hasRemoteActive) {
    return null;
  }

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentLocalSound || playbackProgress.duration <= 0) return;
    const newProgress = Number(e.target.value);
    const targetSeconds = (newProgress / 100) * playbackProgress.duration;
    seekSound(currentLocalSound.soundId, targetSeconds);
    setPlaybackProgress((prev) => ({
      ...prev,
      currentTime: targetSeconds,
      progress: newProgress / 100,
    }));
  };

  const isAnyPaused = hasLocalActive && localActiveSounds.some((s) => s.isPaused);
  // Voice listeners count (participants or default minimum 1)
  const voiceListenerCount = Math.max(1, (localParticipant ? 1 : 0) + remoteParticipants.length);

  const collapseToMini = () => {
    setMiniPos({
      x: Math.max(12, window.innerWidth - 64),
      y: Math.max(96, window.innerHeight - 148),
    });
    setIsMini(true);
  };

  const onMiniPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      originX: rect.left,
      originY: rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is optional; dragging still follows the cursor */
    }
  };

  const onMiniPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const size = 44;
    setMiniPos({
      x: Math.min(window.innerWidth - size - 8, Math.max(8, drag.originX + dx)),
      y: Math.min(window.innerHeight - size - 8, Math.max(8, drag.originY + dy)),
    });
  };

  const onMiniPointerUp = () => {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) setIsMini(false);
  };

  const artwork = currentSoundMeta?.artworkUrl ? (
    <img
      src={currentSoundMeta.artworkUrl}
      alt={currentLocalSound?.name || 'Now playing'}
      className="w-full h-full object-cover"
      draggable={false}
    />
  ) : (
    <div className="flex items-center gap-[2px]">
      <span className={`w-[2px] h-2.5 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse' : ''}`} />
      <span className={`w-[2px] h-4 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse delay-75' : ''}`} />
      <span className={`w-[2px] h-3 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse delay-150' : ''}`} />
    </div>
  );

  return (
    <>
    {isMini && hasLocalActive && currentLocalSound && (
      <button
        type="button"
        onPointerDown={onMiniPointerDown}
        onPointerMove={onMiniPointerMove}
        onPointerUp={onMiniPointerUp}
        style={{ left: miniPos.x, top: miniPos.y }}
        className="fixed z-40 w-11 h-11 rounded-xl overflow-hidden border border-[#23a55a]/40 bg-[#0f1b16] shadow-[0_8px_24px_rgba(0,0,0,0.7)] cursor-grab active:cursor-grabbing touch-none"
        title="Drag to move. Click to restore the player."
      >
        {artwork}
      </button>
    )}
    {(!isMini || hasRemoteActive) && (
    <div className="fixed top-[88px] left-1/2 -translate-x-1/2 z-40 w-[78%] max-w-[560px] flex flex-col gap-2 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-auto select-none">
      {/* Primary Music Player Card */}
      {!isMini && hasLocalActive && currentLocalSound && (
        <div className="relative w-full bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl rounded-2xl px-3.5 py-2 pr-8 shadow-[0_12px_36px_rgba(0,0,0,0.85)] flex flex-col gap-1.5 text-white transition-all">
          <button
            type="button"
            onClick={collapseToMini}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center cursor-pointer"
            title="Shrink to a draggable cover"
          >
            <Minimize2 className="w-3 h-3" />
          </button>
          {/* Top Row: Track Art & Title + Transport Controls + Right Utility Buttons */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            {/* Left: Album Cover + Now Playing + Song Name & Artist */}
            <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[34%]">
              {/* Artwork Box */}
              <div
                onClick={() => setQueueOpen(true)}
                className="w-9 h-9 rounded-lg bg-[#0f1b16] border border-[#23a55a]/30 relative overflow-hidden flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(35,165,90,0.25)] cursor-pointer group hover:border-[#23a55a]/60 transition-all"
                title="Click to open Music Queue"
              >
                {currentSoundMeta?.artworkUrl ? (
                  <img
                    src={currentSoundMeta.artworkUrl}
                    alt={currentLocalSound.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  /* Sleek glowing waveform icon */
                  <div className="flex items-center gap-[3px] px-2">
                    <span className={`w-[3px] h-3.5 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse' : ''}`} />
                    <span className={`w-[3px] h-6 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse delay-75' : ''}`} />
                    <span className={`w-[3px] h-4.5 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse delay-150' : ''}`} />
                    <span className={`w-[3px] h-2.5 rounded-full bg-[#23a55a] ${!isAnyPaused ? 'animate-pulse' : ''}`} />
                  </div>
                )}
              </div>

              {/* Text Info */}
              <div className="flex flex-col min-w-0">
                {/* ((•)) Now Playing Badge */}
                <div className="flex items-center gap-1 text-[9px] font-extrabold text-[#23a55a] tracking-wide leading-none">
                  <span className="leading-none">((•))</span>
                  <span>Now Playing</span>
                </div>

                {/* Track Title */}
                <h4
                  className="font-bold text-xs text-white truncate max-w-[120px] leading-tight mt-0.5"
                  title={currentLocalSound.name}
                >
                  {currentLocalSound.name}
                </h4>

                {/* Artist / Channel Subtitle */}
                <span className="text-[10px] text-white/50 truncate font-medium leading-tight">
                  {currentSoundMeta?.artist || currentSoundMeta?.category || 'General'}
                </span>
              </div>
            </div>

            {/* Center: Transport Controls (Shuffle, Previous, Big Circular Green Play, Next, Repeat) */}
            <div className="flex items-center justify-center gap-1 shrink-0">
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  isShuffle ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'
                }`}
                title={`Shuffle: ${isShuffle ? 'ON' : 'OFF'}`}
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>

              {/* Previous */}
              <button
                onClick={playPrevious}
                disabled={queue.length <= 1}
                className="p-1.5 rounded-full text-white/70 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Previous track"
              >
                <SkipBack className="w-3.5 h-3.5 fill-current" />
              </button>

              {/* Large Circular Green Play/Pause Button */}
              <button
                onClick={() => togglePlayPause(currentLocalSound?.soundId)}
                className="w-9 h-9 rounded-full bg-[#23a55a] hover:bg-[#209650] text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-[0_0_16px_rgba(35,165,90,0.45)] cursor-pointer shrink-0"
                title={isAnyPaused ? 'Resume playback' : 'Pause playback'}
              >
                {isAnyPaused ? (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                ) : (
                  <Pause className="w-4 h-4 fill-current" />
                )}
              </button>

              {/* Next */}
              <button
                onClick={playNext}
                disabled={queue.length <= 1}
                className="p-1.5 rounded-full text-white/70 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Next track"
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
              </button>

              {/* Repeat */}
              <button
                onClick={toggleRepeat}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  repeatMode !== 'off' ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Right: Utility Buttons (Favorite, Headphones, Volume, Voice Members Count) */}
            <div className="flex items-center justify-end gap-1.5 shrink-0 flex-1 max-w-[34%]">
              {/* Favorite Heart Button */}
              {currentSoundMeta && (
                <button
                  onClick={() => toggleFavorite(currentSoundMeta.id)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title={currentSoundMeta.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      currentSoundMeta.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                </button>
              )}

              {/* Private Headphones Monitor Popover (Volume Slider + Complete Mute) */}
              <div className="relative" ref={headphonesMenuRef}>
                <button
                  onClick={() => {
                    setIsHeadphonesMenuOpen(!isHeadphonesMenuOpen);
                    setIsVolumeSliderOpen(false);
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    localMonitorMuted
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : localMonitorVolume < 100
                      ? 'bg-[#23a55a]/20 text-[#23a55a] border border-[#23a55a]/30'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                  }`}
                  title="Headphone Monitor Settings (Volume & Mute)"
                >
                  <Headphones className="w-3.5 h-3.5" />
                </button>

                {isHeadphonesMenuOpen && (
                  <div className="absolute right-0 top-12 bg-[#12151c] border border-white/10 shadow-2xl rounded-2xl p-3 flex flex-col gap-2 z-50 w-52 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <Headphones className="w-3.5 h-3.5 text-[#23a55a]" />
                        <span>Headphones</span>
                      </span>
                      <button
                        onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                          localMonitorMuted
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                        }`}
                        title={localMonitorMuted ? 'Unmute in headphones' : 'Mute in headphones'}
                      >
                        {localMonitorMuted ? 'Muted' : 'Mute'}
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 pt-1.5 border-t border-white/5">
                      <div className="flex items-center justify-between text-[10px] text-white/60">
                        <span>Monitor Volume</span>
                        <span className="font-mono font-bold text-[#23a55a]">
                          {localMonitorMuted ? '0%' : `${Math.round(localMonitorVolume)}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={localMonitorMuted ? 0 : localMonitorVolume}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setLocalMonitorVolume(val);
                          if (localMonitorMuted && val > 0) {
                            setLocalMonitorMuted(false);
                          }
                        }}
                        className="w-full h-1.5 accent-[#23a55a] bg-white/10 rounded-full cursor-pointer"
                      />
                      <p className="text-[9px] text-white/40 leading-tight mt-0.5">
                        {localMonitorMuted
                          ? 'Muted for you • Room still hears it'
                          : 'Adjust your own listening volume'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Volume Button with Popover Slider (0-200% Real Gain) */}
              <div className="relative" ref={volumeSliderRef}>
                <button
                  onClick={() => setIsVolumeSliderOpen(!isVolumeSliderOpen)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    localMonitorMuted
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                  }`}
                  title={`Master Volume: ${Math.round(masterVolume)}%`}
                >
                  {localMonitorMuted || masterVolume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Popover Slider on Click/Hover */}
                {isVolumeSliderOpen && (
                  <div className="absolute right-0 top-12 bg-[#12151c] border border-white/10 shadow-2xl rounded-2xl p-3 flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseInt(e.target.value, 10))}
                      className="w-24 h-1.5 accent-[#23a55a] bg-white/10 rounded-full cursor-pointer"
                      title={`Master Volume: ${Math.round(masterVolume)}%`}
                    />
                    <span className="text-[10px] font-mono font-bold text-[#23a55a] w-8 text-right">
                      {Math.round(masterVolume)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Voice Room Participants Count Pill */}
              <div
                className="px-2.5 h-8 rounded-full bg-white/5 border border-white/5 flex items-center gap-1 text-[#23a55a] font-bold text-[11px] shadow-inner cursor-default"
                title={`${voiceListenerCount} listeners in voice room`}
              >
                <Users className="w-3.5 h-3.5 text-[#23a55a]" />
                <span>{voiceListenerCount}</span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Full-Width Continuous Seekbar with Timestamps */}
          <div className="flex items-center gap-2 w-full">
            {/* Current Elapsed Time */}
            <span className="text-[10px] font-mono text-white/40 w-8 text-right select-none">
              {formatTime(playbackProgress.currentTime)}
            </span>

            {/* Continuous Seek Track */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={playbackProgress.progress * 100}
              onChange={handleSeek}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#23a55a]"
            />

            {/* Total Duration */}
            <span className="text-[10px] font-mono text-white/40 w-8 select-none">
              {formatTime(playbackProgress.duration || currentLocalSound.duration || 270)}
            </span>
          </div>
        </div>
      )}

      {/* Remote Participant Playing Card (if someone else in the channel is playing music) */}
      {remoteEntries.map(([identity, player]) => {
        const member = members.find((m) => m.userId === identity || m.username === identity);
        const remoteP = remoteParticipants.find((p) => p.identity === identity);
        const memberName = member?.displayName || member?.username || remoteP?.name || identity;
        const isMuted = !!localMutedSoundboards[identity];
        const volume = soundboardVolumes[identity] ?? 100;

        return (
          <div
            key={identity}
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[#0c0e12]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs text-white"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#23a55a]/15 border border-[#23a55a]/30 flex items-center justify-center text-[#23a55a] shrink-0">
                <Music className="w-4 h-4 animate-bounce" />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] text-white/50 font-bold tracking-wider">
                  <span className="text-white font-semibold truncate max-w-[120px]">{memberName}</span>
                  <span>is streaming:</span>
                </div>
                <span className="font-semibold text-xs text-[#23a55a] truncate max-w-[180px] sm:max-w-[280px]">
                  {player.soundName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-xl border border-white/5">
                <button
                  onClick={() => toggleMuteSoundboardForMyself(identity)}
                  className="text-white/60 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-[#23a55a]" />
                  )}
                </button>

                <input
                  type="range"
                  min="0"
                  max="200"
                  disabled={isMuted}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setParticipantSoundboardVolume(identity, Number(e.target.value))}
                  className="w-16 sm:w-20 h-1 bg-white/10 rounded-lg accent-[#23a55a] cursor-pointer disabled:opacity-40"
                />

                <span className="font-mono text-[10px] font-bold text-[#23a55a] w-7 text-right">
                  {isMuted ? '0%' : `${volume}%`}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    )}
    </>
  );
};
