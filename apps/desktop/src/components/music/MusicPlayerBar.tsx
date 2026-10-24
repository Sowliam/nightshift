import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  ListMusic,
  Disc,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useMusicStore } from '../../stores/music.store';
import { useServerStore } from '../../stores/server.store';

export const MusicPlayerBar: React.FC = () => {
  const { activeServerId } = useServerStore();
  const { session, pause, resume, skip, stop, setVolume, setQueueOpen } = useMusicStore();

  const [localVolume, setLocalVolume] = useState<number>(session?.volume || 80);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (session?.volume !== undefined) {
      setLocalVolume(session.volume);
    }
  }, [session?.volume]);

  // Interpolate progress position smoothly every second
  useEffect(() => {
    setElapsed(session?.positionSeconds || 0);
  }, [session?.positionSeconds, session?.currentTrack?.id]);

  useEffect(() => {
    if (session?.status !== 'playing') return;
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const total = session?.currentTrack?.durationSeconds || 0;
        if (total > 0 && prev >= total) return prev;
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.status, session?.currentTrack]);

  if (!session || (!session.currentTrack && session.status === 'idle')) {
    return null;
  }

  const track = session.currentTrack;
  const isPlaying = session.status === 'playing';
  const isSearching = session.status === 'searching';
  const duration = track?.durationSeconds || 0;
  const progressRatio = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  const formatTime = (secs: number) => {
    if (!secs || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePlayToggle = () => {
    if (!activeServerId) return;
    if (isPlaying) {
      pause(activeServerId);
    } else {
      resume(activeServerId);
    }
  };

  const handleSkip = () => {
    if (activeServerId) skip(activeServerId);
  };

  const handleStop = () => {
    if (activeServerId) stop(activeServerId);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setLocalVolume(val);
    if (activeServerId) setVolume(activeServerId, val);
  };

  return (
    <div className="w-full bg-[#111215]/95 backdrop-blur-md border-b border-[#232428] px-4 py-2.5 flex items-center justify-between gap-4 z-20 select-none animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Left: Track Information */}
      <div className="flex items-center gap-3 min-w-0 max-w-[320px]">
        {/* Thumbnail / Disc Icon */}
        <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-[#18191c] border border-[#2b2d31] shrink-0 shadow-md group">
          {track?.thumbnailUrl ? (
            <img
              src={track.thumbnailUrl}
              alt={track.title}
              className={`w-full h-full object-cover transition-transform duration-500 ${isPlaying ? 'scale-105' : 'scale-100 opacity-80'}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1b1e] to-[#25272b]">
              <Disc className={`w-6 h-6 text-accent-bright ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
            </div>
          )}
          {isPlaying && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <span className="flex gap-0.5 items-end h-3">
                <span className="w-0.5 bg-accent-bright animate-pulse h-full" />
                <span className="w-0.5 bg-accent-bright animate-pulse h-2" />
                <span className="w-0.5 bg-accent-bright animate-pulse h-3" />
              </span>
            </div>
          )}
        </div>

        {/* Title, Artist & Source Pill */}
        <div className="min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#f2f3f5] truncate tracking-tight hover:underline cursor-pointer">
              {track?.title || (isSearching ? 'Loading track...' : 'Idle')}
            </span>
            {track?.url && (
              <a
                href={track.url}
                target="_blank"
                rel="noreferrer"
                className="text-[#949ba4] hover:text-white shrink-0"
                title="Open in new tab"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#949ba4] truncate mt-0.5">
            <span className="truncate">{track?.artist || 'NIGHTSHIFT Music'}</span>
            {track?.source && (
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                  track.source === 'youtube'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                }`}
              >
                {track.source}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Middle: Controls & Progress Bar */}
      <div className="flex-1 max-w-[480px] flex flex-col items-center gap-1.5">
        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePlayToggle}
            disabled={isSearching}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer shadow-md"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={handleSkip}
            className="p-1.5 text-[#949ba4] hover:text-white hover:bg-[#2b2d31] rounded-lg transition-all active:scale-90 cursor-pointer"
            title="Skip Track"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <button
            onClick={handleStop}
            className="p-1.5 text-[#949ba4] hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90 cursor-pointer"
            title="Stop Playback"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar & Timestamps */}
        <div className="w-full flex items-center gap-2 text-[11px] text-[#949ba4] font-mono">
          <span className="w-8 text-right text-[10px]">{formatTime(elapsed)}</span>
          <div className="flex-1 h-1 bg-[#2b2d31] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-accent-bright transition-all duration-300 rounded-full"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <span className="w-8 text-left text-[10px]">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Volume & Queue Button */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Volume Popover */}
        <div className="relative flex items-center">
          <button
            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
            className="p-1.5 text-[#949ba4] hover:text-white hover:bg-[#2b2d31] rounded-lg transition-all cursor-pointer"
            title="Volume"
          >
            {localVolume === 0 ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {showVolumeSlider && (
            <div className="absolute bottom-9 right-0 bg-[#1e1f22] p-2.5 rounded-xl border border-[#2b2d31] shadow-2xl flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <input
                type="range"
                min="0"
                max="100"
                value={localVolume}
                onChange={handleVolumeChange}
                className="w-24 accent-accent-bright cursor-pointer h-1.5 bg-[#313338] rounded-lg"
              />
              <span className="text-[11px] font-mono text-[#949ba4] w-7 text-right">{localVolume}%</span>
            </div>
          )}
        </div>

        {/* Queue Drawer Button */}
        <button
          onClick={() => setQueueOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#232428] hover:bg-[#2b2d31] text-[#f2f3f5] rounded-lg border border-[#2b2d31] text-[12px] font-medium transition-all active:scale-95 cursor-pointer shadow-sm"
          title="Open Music Queue"
        >
          <ListMusic className="w-3.5 h-3.5 text-accent-bright" />
          <span>Queue</span>
          {session.queue.length > 0 && (
            <span className="px-1.5 py-0.2 bg-accent-bright text-black font-bold text-[10px] rounded-full">
              {session.queue.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
