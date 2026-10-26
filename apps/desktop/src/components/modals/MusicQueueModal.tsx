import React, { useState, useEffect } from 'react';
import {
  X,
  Music,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Trash2,
  Disc3,
  ArrowLeft,
  Volume2,
  Volume1,
  ListMusic,
  Plus,
  GripVertical,
  CloudUpload,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { SoundboardItem } from '../../services/soundboard.storage';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

interface MusicQueueModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const MusicQueueModal: React.FC<MusicQueueModalProps> = ({ isOpen: propIsOpen, onClose: propOnClose }) => {
  const storeIsOpen = useSoundboardStore((s) => s.isQueueOpen);
  const setStoreQueueOpen = useSoundboardStore((s) => s.setQueueOpen);
  const setSoundboardOpen = useSoundboardStore((s) => s.setSoundboardOpen);
  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;
  const handleClose = propOnClose || (() => setStoreQueueOpen(false));
  const handleBackToSoundboard = () => {
    handleClose();
    setSoundboardOpen(true);
  };

  const sounds = useSoundboardStore((s) => s.sounds);
  const playlists = useSoundboardStore((s) => s.playlists);
  const queue = useSoundboardStore((s) => s.queue);
  const currentQueueIndex = useSoundboardStore((s) => s.currentQueueIndex);
  const repeatMode = useSoundboardStore((s) => s.repeatMode);
  const isShuffle = useSoundboardStore((s) => s.isShuffle);
  const activeSounds = useSoundboardStore((s) => s.activeSounds);
  const masterVolume = useSoundboardStore((s) => s.masterVolume);
  const setMasterVolume = useSoundboardStore((s) => s.setMasterVolume);
  const allowWhileMuted = useSoundboardStore((s) => s.allowWhileMuted);
  const setAllowWhileMuted = useSoundboardStore((s) => s.setAllowWhileMuted);
  const cloudSounds = useSoundboardStore((s) => s.cloudSounds);
  const isCloudLoading = useSoundboardStore((s) => s.isCloudLoading);
  const loadCloudSounds = useSoundboardStore((s) => s.loadCloudSounds);
  const playCloudSound = useSoundboardStore((s) => s.playCloudSound);

  const playSound = useSoundboardStore((s) => s.playSound);
  const togglePlayPause = useSoundboardStore((s) => s.togglePlayPause);
  const stopSound = useSoundboardStore((s) => s.stopSound);
  const playNext = useSoundboardStore((s) => s.playNext);
  const playPrevious = useSoundboardStore((s) => s.playPrevious);
  const toggleShuffle = useSoundboardStore((s) => s.toggleShuffle);
  const toggleRepeat = useSoundboardStore((s) => s.toggleRepeat);
  const seekSound = useSoundboardStore((s) => s.seekSound);
  const setQueue = useSoundboardStore((s) => s.setQueue);

  const [activeTab, setActiveTab] = useState<'queue' | 'uploads' | 'playlists'>('queue');

  // Live progress tracking
  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; progress: number }>({
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const allAvailableTracks = React.useMemo(() => {
    const map = new Map<string, SoundboardItem>();
    sounds.forEach((s) => map.set(s.id, s));
    cloudSounds.forEach((c) => {
      if (!map.has(c.id)) {
        map.set(c.id, {
          id: c.id,
          name: c.name,
          category: c.category,
          volume: 100,
          hotkey: null,
          duration: c.duration,
          createdAt: new Date(c.createdAt).getTime(),
          audioUrl: c.audioUrl,
          source: 'cloud',
        });
      }
    });
    return map;
  }, [sounds, cloudSounds]);

  const currentSoundId = queue[currentQueueIndex] || (activeSounds.length > 0 ? activeSounds[0].soundId : null);
  const currentTrack = currentSoundId ? allAvailableTracks.get(currentSoundId) : null;
  const isPlaying = activeSounds.some((a) => a.soundId === currentSoundId && !a.isPaused);

  useEffect(() => {
    if (!isOpen || !currentSoundId) return;

    const interval = setInterval(() => {
      const prog = soundboardAudioEngine.getPlaybackProgress(currentSoundId);
      if (prog) {
        setPlaybackProgress(prog);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isOpen, currentSoundId]);

  if (!isOpen) return null;

  const queueItems: SoundboardItem[] = queue
    .map((id: string) => allAvailableTracks.get(id))
    .filter((s: SoundboardItem | undefined): s is SoundboardItem => !!s);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentSoundId || playbackProgress.duration <= 0) return;
    const newProgress = Number(e.target.value);
    const targetSeconds = (newProgress / 100) * playbackProgress.duration;
    seekSound(currentSoundId, targetSeconds);
    setPlaybackProgress((prev) => ({
      ...prev,
      currentTime: targetSeconds,
      progress: newProgress / 100,
    }));
  };

  const handleRemoveFromQueue = (indexToRemove: number) => {
    const newQueue = queue.filter((_, idx) => idx !== indexToRemove);
    let nextIndex = currentQueueIndex;
    if (indexToRemove < currentQueueIndex) {
      nextIndex = Math.max(0, currentQueueIndex - 1);
    } else if (indexToRemove === currentQueueIndex) {
      if (currentSoundId) stopSound(currentSoundId);
      nextIndex = Math.min(newQueue.length - 1, currentQueueIndex);
    }
    setQueue(newQueue, nextIndex);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-[840px] max-w-full h-[650px] max-h-[92vh] bg-[#0c0d12] rounded-3xl border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-white font-sans">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0e1015] shrink-0">
          {/* Left: Back to Soundboard Pill Button */}
          <button
            onClick={handleBackToSoundboard}
            className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-all cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-white/70" />
            <span>Back to Soundboard</span>
          </button>

          {/* Right: Queue Pill, Playlists, Close */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'queue'
                  ? 'bg-[#23a55a] text-black shadow-md shadow-[#23a55a]/20'
                  : 'bg-white/5 text-white/60 hover:text-white'
                }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Queue ({queue.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'playlists'
                  ? 'bg-[#23a55a] text-black shadow-md shadow-[#23a55a]/20'
                  : 'bg-white/5 text-white/60 hover:text-white'
                }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>Playlists ({playlists.length})</span>
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all cursor-pointer ml-1"
              title="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Content (2 Columns) */}
        <div className="flex-1 min-h-0 flex p-5 gap-5 overflow-hidden bg-[#0c0d12]">
          {/* =======================================================
              1. LEFT COLUMN: HERO MUSIC PLAYER CARD
             ======================================================= */}
          <div className="w-[280px] shrink-0 bg-[#12141a] border border-white/5 rounded-2xl p-4 flex flex-col justify-between shadow-xl overflow-hidden">
            {/* Album Artwork with Sound Wave Icon */}
            <div>
              <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-[#1b1e28] to-[#0d0e14] border border-white/10 relative overflow-hidden flex items-center justify-center shadow-lg group">
                {currentTrack?.artworkUrl ? (
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  /* Fallback Artwork: Moon in Dark Forest Graphic */
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-80"
                    style={{
                      backgroundImage: `radial-gradient(circle at 50% 35%, rgba(255,255,255,0.15) 0%, transparent 60%), linear-gradient(180deg, #181b24 0%, #08090d 100%)`,
                    }}
                  >
                    {/* Subtle Moon Graphic */}
                    <div className="w-24 h-24 rounded-full bg-white/10 blur-xs absolute top-8 left-1/2 -translate-x-1/2 border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center">
                      <Disc3 className={`w-12 h-12 text-white/40 ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
                    </div>
                  </div>
                )}

                {/* Animated sound wave bars on top-left of artwork */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
                  <span className={`w-1 h-3 rounded-full bg-[#1db954] ${isPlaying ? 'animate-pulse' : ''}`} />
                  <span className={`w-1 h-4 rounded-full bg-[#1db954] ${isPlaying ? 'animate-pulse delay-75' : ''}`} />
                  <span className={`w-1 h-2 rounded-full bg-[#1db954] ${isPlaying ? 'animate-pulse delay-150' : ''}`} />
                </div>
              </div>

              {/* Title & Artist */}
              <div className="text-center mt-3">
                <h3 className="text-sm font-black text-white truncate px-1">
                  {currentTrack ? currentTrack.name : 'No Track Playing'}
                </h3>
                <p className="text-xs text-white/50 truncate mt-0.5 px-1">
                  {currentTrack
                    ? currentTrack.category || 'Nightshift Audio'
                    : 'Select a song from the queue to start listening'}
                </p>
              </div>
            </div>

            {/* Bottom Controls Area */}
            <div>
              {/* Progress Slider */}
              <div className="mt-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playbackProgress.progress ? Math.floor(playbackProgress.progress * 100) : 0}
                  onChange={handleSeek}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#23a55a]"
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-white/40 mt-1">
                  <span>{formatTime(playbackProgress.currentTime)}</span>
                  <span>{formatTime(playbackProgress.duration || (currentTrack?.duration || 0))}</span>
                </div>
              </div>

              {/* Playback Controls Row */}
              <div className="flex items-center justify-between px-2 mt-2.5">
                <button
                  onClick={toggleShuffle}
                  className={`transition-colors cursor-pointer ${isShuffle ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'}`}
                  title="Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                <button
                  onClick={playPrevious}
                  className="text-white/70 hover:text-white transition-colors cursor-pointer"
                  title="Previous"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                {/* Big Circular Green Play Button */}
                <button
                  onClick={() => togglePlayPause(currentSoundId || (queue.length > 0 ? queue[0] : undefined))}
                  className="w-11 h-11 rounded-full bg-[#23a55a] hover:bg-[#209650] text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#23a55a]/30 cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                <button
                  onClick={playNext}
                  className="text-white/70 hover:text-white transition-colors cursor-pointer"
                  title="Next"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={toggleRepeat}
                  className={`transition-colors cursor-pointer ${repeatMode !== 'off' ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'}`}
                  title={`Repeat: ${repeatMode}`}
                >
                  {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
              </div>

              {/* Volume Slider Row (0-200% Real Gain Boost) */}
              <div className="flex items-center gap-2 mt-3 px-1 w-full max-w-full overflow-hidden">
                <Volume1 className="w-3.5 h-3.5 text-white/40 shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseInt(e.target.value, 10))}
                  className="flex-1 min-w-0 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#23a55a]"
                  title={`Master Volume: ${Math.round(masterVolume)}%`}
                />
                <span className="text-[10px] font-mono text-[#23a55a] font-bold min-w-[32px] text-right shrink-0">
                  {Math.round(masterVolume)}%
                </span>
                <Volume2 className="w-3.5 h-3.5 text-white/40 shrink-0" />
              </div>

              {/* Play while muted toggle button */}
              <div className="mt-3 p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {allowWhileMuted ? (
                    <Mic className="w-3.5 h-3.5 text-[#23a55a] shrink-0" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">Play while muted</p>
                    <p className="text-[9px] text-white/40 truncate">
                      {allowWhileMuted ? 'Music continues when mic is muted' : 'Music stops when mic is muted'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAllowWhileMuted(!allowWhileMuted)}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    allowWhileMuted ? 'bg-[#23a55a]' : 'bg-white/20'
                  }`}
                  title={allowWhileMuted ? 'Disable music while mic is muted' : 'Enable music while mic is muted'}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-all absolute top-[3px] ${
                      allowWhileMuted ? 'right-[4px]' : 'left-[4px]'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* =======================================================
              2. RIGHT COLUMN: PLAYBACK QUEUE / CLOUD UPLOADS
             ======================================================= */}
          <div className="flex-1 min-w-0 flex flex-col justify-between overflow-hidden">
            {/* Header: Tabs + Actions */}
            <div className="flex items-center justify-between pb-3 shrink-0 gap-2">
              <div className="flex items-center gap-1.5 p-1 bg-[#12141a] rounded-xl border border-white/5">
                <button
                  onClick={() => setActiveTab('queue')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'queue' ? 'bg-[#23a55a] text-black shadow-sm' : 'text-white/60 hover:text-white'
                  }`}
                >
                  Queue ({queue.length})
                </button>
                <button
                  onClick={() => {
                    setActiveTab('uploads');
                    loadCloudSounds();
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'uploads' ? 'bg-[#23a55a] text-black shadow-sm' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>Uploads ({cloudSounds.length})</span>
                </button>
              </div>

              <button
                onClick={handleBackToSoundboard}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="Open Studio to manage library or upload songs"
              >
                <Plus className="w-3.5 h-3.5 text-[#23a55a]" />
                <span>Open Studio</span>
              </button>
            </div>

            {/* Body: Uploads List OR Queue Items */}
            <div className="flex-1 min-h-0 flex flex-col justify-center items-center overflow-y-auto custom-scrollbar p-3">
              {activeTab === 'uploads' ? (
                /* Cloud Uploads Tab */
                <div className="w-full h-full flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <p className="text-xs text-white/60">
                      Cloud Library • Available to all users in voice channel
                    </p>
                    <button
                      onClick={handleBackToSoundboard}
                      className="text-xs text-[#23a55a] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Upload New Track</span>
                    </button>
                  </div>

                  {isCloudLoading ? (
                    <div className="flex flex-col items-center justify-center my-auto py-12 text-white/40">
                      <Loader2 className="w-6 h-6 animate-spin text-[#23a55a] mb-2" />
                      <p className="text-xs">Loading cloud audio tracks...</p>
                    </div>
                  ) : cloudSounds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center my-auto py-10 border border-dashed border-white/10 rounded-2xl p-6">
                      <CloudUpload className="w-10 h-10 mb-2 opacity-30 text-[#23a55a]" />
                      <p className="text-xs font-bold text-white/70">No tracks in cloud uploads yet</p>
                      <p className="text-[11px] text-white/40 mt-1 max-w-xs">
                        Open Studio to upload your MP3 tracks to cloud storage.
                      </p>
                      <button
                        onClick={handleBackToSoundboard}
                        className="mt-3 px-4 py-1.5 rounded-xl bg-[#23a55a] hover:bg-[#209650] text-black text-xs font-bold transition-all cursor-pointer shadow-sm"
                      >
                        Upload to Cloud
                      </button>
                    </div>
                  ) : (
                    <div className="w-full space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
                      {cloudSounds.map((cloudItem) => (
                        <div
                          key={cloudItem.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#12141a]/60 border border-white/5 hover:bg-white/[0.03] transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-[#181a22] border border-white/10 flex items-center justify-center text-[#23a55a] shrink-0">
                              <Disc3 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-bold text-white truncate">{cloudItem.name}</h4>
                              <p className="text-[10px] text-white/50 truncate flex items-center gap-2">
                                <span className="text-[#23a55a] font-semibold">{cloudItem.category || 'Music'}</span>
                                <span>•</span>
                                <span>{formatTime(cloudItem.duration || 180)}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!queue.includes(cloudItem.id)) {
                                  setQueue([...queue, cloudItem.id], currentQueueIndex >= 0 ? currentQueueIndex : 0);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                              title="Add to current playback queue"
                            >
                              <Plus className="w-3 h-3 text-[#23a55a]" />
                              <span>Queue</span>
                            </button>

                            <button
                              onClick={() => playCloudSound(cloudItem)}
                              className="px-3 py-1.5 rounded-lg bg-[#23a55a] hover:bg-[#209650] text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                              title="Play into voice room"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Play</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : queue.length === 0 ? (
                /* Empty Queue State matching Image 2 */
                <div className="flex flex-col items-center justify-center text-center my-auto animate-in fade-in duration-200">
                  {/* Tilted Card with Glowing Music Note & Plus badge */}
                  <div className="relative mb-4">
                    {/* Shadow layer behind */}
                    <div className="w-24 h-24 rounded-2xl bg-[#141824] absolute -inset-1 blur-md opacity-40" />

                    {/* Main card tilted */}
                    <div className="w-24 h-24 rounded-2xl bg-[#181a24] border border-white/10 flex items-center justify-center relative shadow-2xl transform -rotate-6">
                      <Music className="w-10 h-10 text-[#23a55a] drop-shadow-[0_0_12px_rgba(35,165,90,0.5)]" />
                    </div>

                    {/* Green + circle on bottom right */}
                    <div className="w-7 h-7 rounded-full bg-[#23a55a] text-black flex items-center justify-center absolute -bottom-1 -right-1 shadow-md shadow-[#23a55a]/40 font-black">
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </div>
                  </div>

                  <h3 className="text-base font-black text-white tracking-wide">Queue is currently empty.</h3>
                  <p className="text-xs text-white/50 max-w-xs mt-1">
                    Add tracks from the Library or Uploads tab to start your queue.
                  </p>

                  {/* Browse Music Pill Buttons */}
                  <div className="flex items-center gap-2 mt-5">
                    <button
                      onClick={handleBackToSoundboard}
                      className="px-5 py-2 rounded-full border border-[#23a55a]/40 hover:border-[#23a55a] bg-[#23a55a]/5 hover:bg-[#23a55a]/15 text-[#23a55a] text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                    >
                      <Music className="w-3.5 h-3.5" />
                      <span>Browse Library</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('uploads');
                        loadCloudSounds();
                      }}
                      className="px-5 py-2 rounded-full border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
                    >
                      <CloudUpload className="w-3.5 h-3.5 text-[#23a55a]" />
                      <span>Cloud Uploads</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Queued Items List */
                <div className="w-full h-full space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
                  {queueItems.map((item, index) => {
                    const isItemCurrent = index === currentQueueIndex;
                    const isItemPlaying = isItemCurrent && isPlaying;

                    return (
                      <div
                        key={`${item.id}-${index}`}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all group ${isItemCurrent
                            ? 'bg-[#13271d]/60 border-[#1db954]/40'
                            : 'bg-[#12141a]/60 border-white/5 hover:bg-white/[0.03]'
                          }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <GripVertical className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 cursor-grab shrink-0" />
                          <div className="w-9 h-9 rounded-lg bg-[#181a22] border border-white/10 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-sm">
                            {item.artworkUrl ? (
                              <img src={item.artworkUrl} alt={item.name} className="w-full h-full object-cover" />
                            ) : isItemPlaying ? (
                              <Disc3 className="w-4 h-4 text-[#23a55a] animate-spin" />
                            ) : (
                              <Music className="w-4 h-4 text-[#23a55a]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className={`text-xs font-bold truncate ${isItemCurrent ? 'text-[#23a55a]' : 'text-white'}`}>
                              {item.name}
                            </h4>
                            <p className="text-[10px] text-white/50 truncate">
                              {item.category || 'Nightshift Audio'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-white/50">
                            {formatTime(item.duration || 180)}
                          </span>

                          <button
                            onClick={() => {
                              if (isItemCurrent) {
                                togglePlayPause(item.id);
                              } else {
                                setQueue(queue, index);
                                playSound(item.id);
                              }
                            }}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${isItemPlaying
                                ? 'bg-[#23a55a] text-black'
                                : 'bg-white/5 hover:bg-[#23a55a] hover:text-black text-white/70'
                              }`}
                          >
                            {isItemPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                          </button>

                          <button
                            onClick={() => handleRemoveFromQueue(index)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                            title="Remove from Queue"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =======================================================
            3. BOTTOM PERSISTENT MINI-PLAYER BAR
           ======================================================= */}
        <div className="border-t border-white/5 bg-[#0e1015] px-6 py-3 flex items-center justify-between shrink-0">
          {/* Mini Track Info */}
          <div className="flex items-center gap-3 min-w-0">
            <Disc3 className={`w-5 h-5 text-[#23a55a] shrink-0 ${isPlaying ? 'animate-spin' : ''}`} />
            <div className="min-w-0">
              <h5 className="text-xs font-bold text-white truncate max-w-[200px]">
                {currentTrack ? currentTrack.name : 'No Track Playing'}
              </h5>
              <p className="text-[10px] text-white/50 truncate">NIGHTSHIFT Music Player</p>
            </div>
          </div>

          {/* Right Volume & List Icon */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-36">
              <Volume1 className="w-3.5 h-3.5 text-white/40 shrink-0" />
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#23a55a]"
                title={`Master Volume: ${Math.round(masterVolume)}%`}
              />
              <span className="text-[10px] font-mono text-[#23a55a] font-bold min-w-[28px] text-right shrink-0">
                {Math.round(masterVolume)}%
              </span>
            </div>

            <button
              onClick={() => setActiveTab(activeTab === 'queue' ? 'playlists' : 'queue')}
              className="text-white/60 hover:text-white transition-colors cursor-pointer"
              title="Toggle Queue"
            >
              <ListMusic className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
