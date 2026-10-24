import React from 'react';
import { Music, Square, Volume2, VolumeX } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSettingsStore } from '../../stores/settings.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useServerStore } from '../../stores/server.store';

/**
 * Floating Now Playing Bar
 * Visible whenever local user or remote participants in the room are playing soundboard audio / music.
 * Provides instant Stop functionality for local playback, and instant volume slider / mute for remote playback.
 */
export const SoundboardActiveBar: React.FC = () => {
  const localActiveSounds = useSoundboardStore((s) => s.activeSounds);
  const stopSound = useSoundboardStore((s) => s.stopSound);
  const stopAllSounds = useSoundboardStore((s) => s.stopAll);
  const setSoundboardOpen = useSoundboardStore((s) => s.setSoundboardOpen);

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

  return (
    <div className="fixed top-11 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[94%] sm:w-auto flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-auto select-none">
      {/* Local User Playing Audio Card */}
      {hasLocalActive && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-2xl bg-[#141518]/95 backdrop-blur-xl border border-accent-bright/50 shadow-2xl text-xs text-white">
          {/* Animated Equalizer Visualizer */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-end gap-0.5 h-4 w-4 shrink-0">
              <span className="w-1 bg-accent-bright rounded-full animate-bounce [animation-delay:0ms] h-full" />
              <span className="w-1 bg-accent-bright rounded-full animate-bounce [animation-delay:150ms] h-2/3" />
              <span className="w-1 bg-accent-bright rounded-full animate-bounce [animation-delay:300ms] h-4/5" />
              <span className="w-1 bg-accent-bright rounded-full animate-bounce [animation-delay:75ms] h-1/2" />
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold text-accent-bright tracking-wider">
                Now Playing to Channel
              </span>
              <span className="font-semibold text-xs text-white truncate max-w-[190px] sm:max-w-[260px]">
                {localActiveSounds.map((s) => s.name).join(', ')}
              </span>
            </div>
          </div>

          {/* Action Buttons: Stop (■) & Soundboard Modal */}
          <div className="flex items-center gap-2 shrink-0">
            {localActiveSounds.length === 1 ? (
              <button
                onClick={() => stopSound(localActiveSounds[0].soundId)}
                className="px-3 py-1 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop sound playback immediately"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={stopAllSounds}
                className="px-3 py-1 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop all sounds"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
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
