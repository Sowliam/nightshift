import React from 'react';
import { Music, Square, Volume2, VolumeX, Pause, Play, Headphones } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useServerStore } from '../../stores/server.store';

/**
 * Floating Now Playing Bar
 * Visible whenever local user or remote participants in the room are playing soundboard audio / music.
 * Provides instant Pause/Resume, Stop, and Self-Monitor Mute (hear only by others, or test locally).
 */
export const SoundboardActiveBar: React.FC = () => {
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const stopSound = useSoundboardStore((s) => s.stopSound);
  const stopAllSounds = useSoundboardStore((s) => s.stopAll);
  const togglePauseSound = useSoundboardStore((s) => s.togglePauseSound);
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

  const hasLocalActive = localActiveSounds.length > 0;
  const remoteEntries = Object.entries(activeSoundboardPlayers);
  const hasRemoteActive = remoteEntries.length > 0;

  if (!hasLocalActive && !hasRemoteActive) {
    return null;
  }

  const isLocalOnly = hasLocalActive && localActiveSounds.every((s) => s.isLocalOnly);
  const isAnyPaused = hasLocalActive && localActiveSounds.some((s) => s.isPaused);

  return (
    <div className="fixed top-11 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[94%] sm:w-auto flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-auto select-none">
      {/* Local User Playing Audio Card */}
      {hasLocalActive && (
        <div
          className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-3.5 py-2 rounded-2xl backdrop-blur-xl shadow-2xl text-xs text-white border transition-colors ${
            isLocalOnly
              ? 'bg-[#1b1726]/95 border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
              : 'bg-[#141518]/95 border-accent-bright/50'
          }`}
        >
          {/* Visualizer / Local Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            {isLocalOnly ? (
              <div className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
                <Headphones className="w-3.5 h-3.5 animate-pulse" />
              </div>
            ) : (
              <div className="flex items-end gap-0.5 h-4 w-4 shrink-0">
                <span className={`w-1 bg-accent-bright rounded-full h-full ${isAnyPaused ? 'opacity-40' : 'animate-bounce [animation-delay:0ms]'}`} />
                <span className={`w-1 bg-accent-bright rounded-full h-2/3 ${isAnyPaused ? 'opacity-40' : 'animate-bounce [animation-delay:150ms]'}`} />
                <span className={`w-1 bg-accent-bright rounded-full h-4/5 ${isAnyPaused ? 'opacity-40' : 'animate-bounce [animation-delay:300ms]'}`} />
                <span className={`w-1 bg-accent-bright rounded-full h-1/2 ${isAnyPaused ? 'opacity-40' : 'animate-bounce [animation-delay:75ms]'}`} />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <span
                className={`text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 ${
                  isLocalOnly ? 'text-purple-400' : 'text-accent-bright'
                }`}
              >
                {isLocalOnly
                  ? '🎧 Private Audition (Only You Hear This)'
                  : isAnyPaused
                  ? '⏸ Soundboard (Paused)'
                  : '📡 Now Playing to Channel'}
              </span>
              <span className="font-semibold text-xs text-white truncate max-w-[170px] sm:max-w-[230px]">
                {localActiveSounds.map((s) => s.name).join(', ')}
              </span>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* If broadcasting: Self-Monitor Mute / Volume (شنیدن فقط توسط بقیه) */}
            {!isLocalOnly && (
              <div className="flex items-center gap-1 bg-[#232428]/80 px-2 py-1 rounded-xl border border-border-subtle/50 text-[11px]">
                <button
                  onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                  className={`flex items-center gap-1 transition-colors cursor-pointer ${
                    localMonitorMuted ? 'text-amber-400 hover:text-amber-300 font-bold' : 'text-text-muted hover:text-white'
                  }`}
                  title={
                    localMonitorMuted
                      ? 'Unmute in your headphones (Currently playing to others only)'
                      : 'Mute in your headphones (Music continues streaming to everyone else in channel)'
                  }
                >
                  {localMonitorMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline text-[10px]">Muted for Me</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-accent-bright" />
                      <span className="hidden sm:inline text-[10px]">Headphones</span>
                    </>
                  )}
                </button>

                {!localMonitorMuted && (
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localMonitorVolume}
                    onChange={(e) => setLocalMonitorVolume(Number(e.target.value))}
                    className="w-12 h-1 accent-accent-bright bg-[#18191c] rounded cursor-pointer ml-1 hidden sm:block"
                    title={`Your Headphone Monitor Volume: ${localMonitorVolume}%`}
                  />
                )}
              </div>
            )}

            {/* Pause / Resume for single sound */}
            {localActiveSounds.length === 1 && (
              <button
                onClick={() => togglePauseSound(localActiveSounds[0].soundId)}
                className="p-1.5 rounded-xl bg-bg-elevated hover:bg-bg-hover text-white transition-all active:scale-95 border border-border-subtle cursor-pointer"
                title={localActiveSounds[0].isPaused ? 'Resume sound playback' : 'Pause sound'}
              >
                {localActiveSounds[0].isPaused ? (
                  <Play className="w-3.5 h-3.5 fill-current text-accent-bright" />
                ) : (
                  <Pause className="w-3.5 h-3.5 fill-current text-amber-400" />
                )}
              </button>
            )}

            {/* Stop Button */}
            {localActiveSounds.length === 1 ? (
              <button
                onClick={() => stopSound(localActiveSounds[0].soundId)}
                className="px-2.5 py-1 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop sound playback immediately (Double-press hotkey also stops)"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={stopAllSounds}
                className="px-2.5 py-1 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop all sounds"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop All ({localActiveSounds.length})</span>
              </button>
            )}

            <button
              onClick={() => setSoundboardOpen(true)}
              className="p-1.5 rounded-xl bg-bg-elevated hover:bg-bg-hover text-text-muted hover:text-white transition-colors cursor-pointer border border-border-subtle"
              title="Open Soundboard Library"
            >
              <Music className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Remote Channel Participants Playing Audio Card(s) */}
      {remoteEntries.map(([identity, player]) => {
        const member = members.find((m) => m.userId === identity);
        const memberName = member?.displayName || member?.username || identity;
        const isMuted = !!localMutedSoundboards[identity];
        const volume = soundboardVolumes[identity] ?? 100;

        return (
          <div
            key={identity}
            className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-[#141518]/95 backdrop-blur-xl border border-border-subtle shadow-2xl text-xs text-white"
          >
            {/* Player Info & Sound Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-accent-bright/15 border border-accent-bright/30 flex items-center justify-center text-accent-bright shrink-0">
                <Music className="w-3.5 h-3.5 animate-bounce" />
              </div>

              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold tracking-wider">
                  <span className="text-text-primary font-semibold truncate max-w-[120px]">{memberName}</span>
                  <span>is playing:</span>
                </div>
                <span className="font-semibold text-xs text-accent-bright truncate max-w-[180px] sm:max-w-[240px]">
                  {player.soundName}
                </span>
              </div>
            </div>

            {/* Individual Soundboard Volume Slider & Mute Toggle */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <div className="flex items-center gap-1.5 bg-bg-elevated/70 px-2.5 py-1 rounded-xl border border-border-subtle/50">
                <button
                  onClick={() => toggleMuteSoundboardForMyself(identity)}
                  className="text-text-muted hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute music from this user' : 'Mute music from this user'}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-destructive" />
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
                  className="w-16 sm:w-20 h-1.5 bg-bg-main rounded-lg accent-accent-bright cursor-pointer disabled:opacity-40"
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
