import React, { useState, useEffect } from 'react';
import {
  Music,
  Square,
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
  ListMusic,
  Headphones,
  Disc3,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useServerStore } from '../../stores/server.store';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

/**
 * Floating Sleek Music & Soundboard Player Bar
 * Provides instant Play/Pause, Next/Previous, Shuffle/Repeat, Live Seekbar,
 * Headphone Mute (hearing by others only), Favorites, and Queue management.
 */
export const SoundboardActiveBar: React.FC = () => {
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const queue = useSoundboardStore((s) => s.queue);
  const repeatMode = useSoundboardStore((s) => s.repeatMode);
  const isShuffle = useSoundboardStore((s) => s.isShuffle);
  const sounds = useSoundboardStore((s) => s.sounds);

  const stopSound = useSoundboardStore((s) => s.stopSound);
  const stopAllSounds = useSoundboardStore((s) => s.stopAll);
  const togglePauseSound = useSoundboardStore((s) => s.togglePauseSound);
  const playNext = useSoundboardStore((s) => s.playNext);
  const playPrevious = useSoundboardStore((s) => s.playPrevious);
  const toggleShuffle = useSoundboardStore((s) => s.toggleShuffle);
  const toggleRepeat = useSoundboardStore((s) => s.toggleRepeat);
  const seekSound = useSoundboardStore((s) => s.seekSound);
  const toggleFavorite = useSoundboardStore((s) => s.toggleFavorite);
  const setQueueOpen = useSoundboardStore((s) => s.setQueueOpen);
  const setSoundboardOpen = useSoundboardStore((s) => s.setSoundboardOpen);

  const localMonitorMuted = useSoundboardStore((s) => s.localMonitorMuted);
  const setLocalMonitorMuted = useSoundboardStore((s) => s.setLocalMonitorMuted);
  const localMonitorVolume = useSoundboardStore((s) => s.localMonitorVolume);
  const setLocalMonitorVolume = useSoundboardStore((s) => s.setLocalMonitorVolume);

  const activeSoundboardPlayers = useLiveKitStore((s) => s.activeSoundboardPlayers);
  const setParticipantSoundboardVolume = useLiveKitStore((s) => s.setParticipantSoundboardVolume);
  const toggleMuteSoundboardForMyself = useLiveKitStore((s) => s.toggleMuteSoundboardForMyself);

  const soundboardVolumes = useSettingsStore((s) => s.soundboardVolumes);
  const localMutedSoundboards = useSettingsStore((s) => s.localMutedSoundboards);
  const members = useServerStore((s) => s.members);

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

  const isLocalOnly = hasLocalActive && localActiveSounds.every((s) => s.isLocalOnly);
  const isAnyPaused = hasLocalActive && localActiveSounds.some((s) => s.isPaused);

  return (
    <div className="fixed top-10 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[96%] sm:w-auto flex flex-col gap-2 animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-auto select-none">
      {/* Local User Playing Audio Player Card */}
      {hasLocalActive && currentLocalSound && (
        <div
          className={`px-4 py-2.5 rounded-2xl backdrop-blur-2xl shadow-[0_12px_45px_rgba(0,0,0,0.7)] text-white border transition-all ${
            isLocalOnly
              ? 'bg-[#181324]/95 border-purple-500/50 shadow-[0_0_25px_rgba(168,85,247,0.18)]'
              : 'bg-[#101114]/95 border-accent-bright/40'
          }`}
        >
          {/* Top Row: Track Metadata + Controls + Badges */}
          <div className="flex items-center justify-between gap-3 min-w-[320px] sm:min-w-[560px]">
            {/* Track Info & Spinning Vinyl Disc */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                onClick={() => setQueueOpen(true)}
                className={`w-9 h-9 rounded-full bg-gradient-to-tr from-[#1f2026] to-[#2e313d] border border-white/10 flex items-center justify-center shrink-0 cursor-pointer shadow-md ${
                  !isAnyPaused ? 'animate-[spin_6s_linear_infinite]' : ''
                }`}
                title="Open Music Queue"
              >
                <Disc3 className={`w-5 h-5 ${isLocalOnly ? 'text-purple-400' : 'text-accent-bright'}`} />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-md ${
                      isLocalOnly
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-accent-bright/15 text-accent-bright border border-accent-bright/25'
                    }`}
                  >
                    {isLocalOnly ? '🎧 Private' : '📡 Broadcasting'}
                  </span>
                  {currentSoundMeta?.category && (
                    <span className="text-[10px] text-text-muted hidden sm:inline truncate">
                      {currentSoundMeta.category}
                    </span>
                  )}
                </div>
                <span className="font-bold text-xs text-white truncate max-w-[140px] sm:max-w-[220px]">
                  {currentLocalSound.name}
                </span>
              </div>
            </div>

            {/* Transport Buttons: Shuffle, Previous, Play/Pause, Next, Repeat */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={toggleShuffle}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer hidden sm:block ${
                  isShuffle ? 'text-accent-bright bg-accent-bright/15' : 'text-text-muted hover:text-white'
                }`}
                title="Shuffle queue"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={playPrevious}
                disabled={queue.length <= 1}
                className="p-1.5 rounded-lg text-text-muted hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Previous track"
              >
                <SkipBack className="w-3.5 h-3.5 fill-current" />
              </button>

              <button
                onClick={() => togglePauseSound(currentLocalSound.soundId)}
                className="w-8 h-8 rounded-xl bg-accent-bright text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md shadow-accent-bright/25 cursor-pointer"
                title={isAnyPaused ? 'Resume playback' : 'Pause playback'}
              >
                {isAnyPaused ? (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                ) : (
                  <Pause className="w-4 h-4 fill-current" />
                )}
              </button>

              <button
                onClick={playNext}
                disabled={queue.length <= 1}
                className="p-1.5 rounded-lg text-text-muted hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
                title="Next track"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>

              <button
                onClick={toggleRepeat}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer hidden sm:block ${
                  repeatMode !== 'off' ? 'text-accent-bright bg-accent-bright/15' : 'text-text-muted hover:text-white'
                }`}
                title={`Repeat: ${repeatMode}`}
              >
                {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
              </button>

              {/* Stop Button */}
              <button
                onClick={() => {
                  if (localActiveSounds.length > 1) {
                    stopAllSounds();
                  } else {
                    stopSound(currentLocalSound.soundId);
                  }
                }}
                className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 transition-all cursor-pointer"
                title="Stop music"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Quick Actions: Favorite, Headphone Mute, Queue Modal Trigger */}
            <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-white/10">
              {/* Favorite Heart */}
              {currentSoundMeta && (
                <button
                  onClick={() => toggleFavorite(currentSoundMeta.id)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                  title={currentSoundMeta.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart
                    className={`w-3.5 h-3.5 ${
                      currentSoundMeta.isFavorite ? 'fill-rose-500 text-rose-500' : ''
                    }`}
                  />
                </button>
              )}

              {/* Mute for my own headphones (music keeps streaming to everyone else) */}
              {!isLocalOnly && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                    className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                      localMonitorMuted
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 font-bold'
                        : 'bg-white/5 border-white/5 text-text-muted hover:text-white'
                    }`}
                    title={
                      localMonitorMuted
                        ? 'Unmute in your headphones (Currently playing to others only)'
                        : 'Mute in your headphones (Music continues streaming to everyone else in channel)'
                    }
                  >
                    {localMonitorMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                  </button>
                  {!localMonitorMuted && (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localMonitorVolume}
                      onChange={(e) => setLocalMonitorVolume(Number(e.target.value))}
                      className="w-10 h-1 accent-accent-bright bg-white/10 rounded cursor-pointer hidden md:block"
                      title={`Headphone Volume: ${localMonitorVolume}%`}
                    />
                  )}
                </div>
              )}

              {/* Open Music Queue Modal */}
              <button
                onClick={() => setQueueOpen(true)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border border-white/5 transition-colors cursor-pointer"
                title="Open Music Queue & Playlists"
              >
                <ListMusic className="w-3.5 h-3.5" />
              </button>

              {/* Open Soundboard Library */}
              <button
                onClick={() => setSoundboardOpen(true)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border border-white/5 transition-colors cursor-pointer"
                title="Open Soundboard Library"
              >
                <Music className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom Row: Live Seekable Progress Bar */}
          <div className="mt-2 pt-1 border-t border-white/5 flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted w-7 text-right">
              {formatTime(playbackProgress.currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={playbackProgress.progress * 100}
              onChange={handleSeek}
              className="flex-1 h-1 accent-accent-bright bg-white/10 rounded-lg cursor-pointer"
            />
            <span className="text-[10px] font-mono text-text-muted w-7">
              {formatTime(playbackProgress.duration || currentLocalSound.duration)}
            </span>
          </div>
        </div>
      )}

      {/* Remote Participants Playing Audio Cards */}
      {remoteEntries.map(([identity, player]) => {
        const member = members.find((m) => m.userId === identity);
        const memberName = member?.displayName || member?.username || identity;
        const isMuted = !!localMutedSoundboards[identity];
        const volume = soundboardVolumes[identity] ?? 100;

        return (
          <div
            key={identity}
            className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-[#141518]/95 backdrop-blur-xl border border-white/10 shadow-2xl text-xs text-white"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-accent-bright/15 border border-accent-bright/30 flex items-center justify-center text-accent-bright shrink-0">
                <Music className="w-3.5 h-3.5 animate-bounce" />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold tracking-wider">
                  <span className="text-white font-semibold truncate max-w-[120px]">{memberName}</span>
                  <span>is playing:</span>
                </div>
                <span className="font-semibold text-xs text-accent-bright truncate max-w-[180px] sm:max-w-[260px]">
                  {player.soundName}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="flex items-center gap-1.5 bg-[#1c1d22] px-2.5 py-1 rounded-xl border border-white/5">
                <button
                  onClick={() => toggleMuteSoundboardForMyself(identity)}
                  className="text-text-muted hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute music from this user' : 'Mute music from this user'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-accent-bright" />
                  )}
                </button>

                <input
                  type="range"
                  min="0"
                  max="200"
                  disabled={isMuted}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setParticipantSoundboardVolume(identity, Number(e.target.value))}
                  className="w-16 sm:w-20 h-1 bg-[#101114] rounded-lg accent-accent-bright cursor-pointer disabled:opacity-40"
                  title={`Music volume: ${volume}%`}
                />

                <span className="font-mono text-[10px] font-bold text-accent-bright w-7 text-right">
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
