import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
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

  const togglePauseSound = useSoundboardStore((s) => s.togglePauseSound);
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

  const activeSoundboardPlayers = useLiveKitStore((s) => s.activeSoundboardPlayers);
  const localParticipant = useLiveKitStore((s) => s.localParticipant);
  const remoteParticipants = useLiveKitStore((s) => s.remoteParticipants);
  const setParticipantSoundboardVolume = useLiveKitStore((s) => s.setParticipantSoundboardVolume);
  const toggleMuteSoundboardForMyself = useLiveKitStore((s) => s.toggleMuteSoundboardForMyself);

  const soundboardVolumes = useSettingsStore((s) => s.soundboardVolumes);
  const localMutedSoundboards = useSettingsStore((s) => s.localMutedSoundboards);
  const members = useServerStore((s) => s.members);

  const [isVolumeSliderOpen, setIsVolumeSliderOpen] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; progress: number }>({
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const hasLocalActive = localActiveSounds.length > 0;
  const remoteEntries = Object.entries(activeSoundboardPlayers);
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

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-[840px] flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-auto select-none">
      {/* Primary Music Player Card */}
      {hasLocalActive && currentLocalSound && (
        <div className="w-full bg-[#0c0e12]/95 border border-white/10 backdrop-blur-2xl rounded-[28px] px-6 py-4 shadow-[0_16px_50px_rgba(0,0,0,0.85)] flex flex-col gap-2.5 text-white transition-all">
          {/* Top Row: Track Art & Title + Transport Controls + Right Utility Buttons */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            {/* Left: Album Cover + Now Playing + Song Name & Artist */}
            <div className="flex items-center gap-3.5 min-w-0 flex-1 max-w-[34%]">
              {/* Artwork Box */}
              <div
                onClick={() => setQueueOpen(true)}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#0f1b16] border border-[#23a55a]/30 relative overflow-hidden flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(35,165,90,0.25)] cursor-pointer group hover:border-[#23a55a]/60 transition-all"
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
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#23a55a] tracking-wide">
                  <span className="text-[12px] leading-none">((•))</span>
                  <span>Now Playing</span>
                </div>

                {/* Track Title */}
                <h4
                  className="font-bold text-sm text-white truncate max-w-[170px] sm:max-w-[210px] leading-snug mt-0.5"
                  title={currentLocalSound.name}
                >
                  {currentLocalSound.name}
                </h4>

                {/* Artist / Channel Subtitle */}
                <span className="text-[11px] text-white/50 truncate font-medium">
                  {currentSoundMeta?.artist || currentSoundMeta?.category || 'General'}
                </span>
              </div>
            </div>

            {/* Center: Transport Controls (Shuffle, Previous, Big Circular Green Play, Next, Repeat) */}
            <div className="flex items-center justify-center gap-2.5 sm:gap-4 shrink-0">
              {/* Shuffle */}
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  isShuffle ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'
                }`}
                title={`Shuffle: ${isShuffle ? 'ON' : 'OFF'}`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Previous */}
              <button
                onClick={playPrevious}
                disabled={queue.length <= 1}
                className="p-2 rounded-full text-white/70 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Previous track"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>

              {/* Large Circular Green Play/Pause Button */}
              <button
                onClick={() => togglePauseSound(currentLocalSound.soundId)}
                className="w-12 h-12 rounded-full bg-[#23a55a] hover:bg-[#209650] text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-[0_0_24px_rgba(35,165,90,0.5)] cursor-pointer shrink-0"
                title={isAnyPaused ? 'Resume playback' : 'Pause playback'}
              >
                {isAnyPaused ? (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                ) : (
                  <Pause className="w-5 h-5 fill-current" />
                )}
              </button>

              {/* Next */}
              <button
                onClick={playNext}
                disabled={queue.length <= 1}
                className="p-2 rounded-full text-white/70 hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Next track"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>

              {/* Repeat */}
              <button
                onClick={toggleRepeat}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  repeatMode !== 'off' ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              </button>
            </div>

            {/* Right: Utility Buttons (Favorite, Headphones, Volume, Voice Members Count) */}
            <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0 flex-1 max-w-[34%]">
              {/* Favorite Heart Button */}
              {currentSoundMeta && (
                <button
                  onClick={() => toggleFavorite(currentSoundMeta.id)}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title={currentSoundMeta.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart
                    className={`w-4 h-4 ${
                      currentSoundMeta.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                </button>
              )}

              {/* Private Headphones Monitor Button */}
              <button
                onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  localMonitorMuted
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                }`}
                title={
                  localMonitorMuted
                    ? 'Unmute in your headphones (Music currently playing to channel only)'
                    : 'Mute in your headphones (Music continues streaming to everyone else in channel)'
                }
              >
                <Headphones className="w-4 h-4" />
              </button>

              {/* Volume Button with Popover Slider */}
              <div className="relative">
                <button
                  onClick={() => setIsVolumeSliderOpen(!isVolumeSliderOpen)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    localMonitorMuted
                      ? 'bg-rose-500/10 text-rose-400'
                      : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                  }`}
                  title={`Volume: ${localMonitorVolume}%`}
                >
                  {localMonitorMuted || localMonitorVolume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                {/* Popover Slider on Click/Hover */}
                {isVolumeSliderOpen && (
                  <div className="absolute right-0 top-12 bg-[#12151c] border border-white/10 shadow-2xl rounded-2xl p-3 flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localMonitorVolume}
                      onChange={(e) => setLocalMonitorVolume(Number(e.target.value))}
                      className="w-24 h-1.5 accent-[#23a55a] bg-white/10 rounded-full cursor-pointer"
                    />
                    <span className="text-[10px] font-mono font-bold text-white/70 w-7 text-right">
                      {localMonitorVolume}%
                    </span>
                  </div>
                )}
              </div>

              {/* Voice Room Participants Count Pill */}
              <div
                className="px-3.5 h-10 rounded-full bg-white/5 border border-white/5 flex items-center gap-1.5 text-[#23a55a] font-bold text-xs shadow-inner cursor-default"
                title={`${voiceListenerCount} listeners in voice room`}
              >
                <Users className="w-4 h-4 text-[#23a55a]" />
                <span>{voiceListenerCount}</span>
              </div>
            </div>
          </div>

          {/* Bottom Row: Full-Width Continuous Seekbar with Timestamps */}
          <div className="flex items-center gap-3 w-full pt-1">
            {/* Current Elapsed Time */}
            <span className="text-xs font-mono text-white/40 w-9 text-right select-none">
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
              className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#23a55a]"
            />

            {/* Total Duration */}
            <span className="text-xs font-mono text-white/40 w-9 select-none">
              {formatTime(playbackProgress.duration || currentLocalSound.duration || 270)}
            </span>
          </div>
        </div>
      )}

      {/* Remote Participant Playing Card (if someone else in the channel is playing music) */}
      {remoteEntries.map(([identity, player]) => {
        const member = members.find((m) => m.userId === identity);
        const memberName = member?.displayName || member?.username || identity;
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
  );
};
