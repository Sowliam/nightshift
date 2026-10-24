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
  Heart,
  ListPlus,
  Disc3,
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { SoundboardItem, Playlist } from '../../services/soundboard.storage';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

interface MusicQueueModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const MusicQueueModal: React.FC<MusicQueueModalProps> = ({ isOpen: propIsOpen, onClose: propOnClose }) => {
  const storeIsOpen = useSoundboardStore((s) => s.isQueueOpen);
  const setStoreQueueOpen = useSoundboardStore((s) => s.setQueueOpen);
  const isOpen = propIsOpen !== undefined ? propIsOpen : storeIsOpen;
  const handleClose = propOnClose || (() => setStoreQueueOpen(false));

  const sounds = useSoundboardStore((s) => s.sounds);
  const playlists = useSoundboardStore((s) => s.playlists);
  const queue = useSoundboardStore((s) => s.queue);
  const currentQueueIndex = useSoundboardStore((s) => s.currentQueueIndex);
  const repeatMode = useSoundboardStore((s) => s.repeatMode);
  const isShuffle = useSoundboardStore((s) => s.isShuffle);
  const activeSounds = useSoundboardStore((s) => s.activeSounds);

  const playSound = useSoundboardStore((s) => s.playSound);
  const togglePauseSound = useSoundboardStore((s) => s.togglePauseSound);
  const stopSound = useSoundboardStore((s) => s.stopSound);
  const playNext = useSoundboardStore((s) => s.playNext);
  const playPrevious = useSoundboardStore((s) => s.playPrevious);
  const toggleShuffle = useSoundboardStore((s) => s.toggleShuffle);
  const toggleRepeat = useSoundboardStore((s) => s.toggleRepeat);
  const seekSound = useSoundboardStore((s) => s.seekSound);
  const toggleFavorite = useSoundboardStore((s) => s.toggleFavorite);
  const playPlaylist = useSoundboardStore((s) => s.playPlaylist);
  const createPlaylist = useSoundboardStore((s) => s.createPlaylist);
  const setQueue = useSoundboardStore((s) => s.setQueue);

  const [activeTab, setActiveTab] = useState<'queue' | 'playlists'>('queue');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  // Live progress tracking
  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; progress: number }>({
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const currentSoundId = queue[currentQueueIndex] || (activeSounds.length > 0 ? activeSounds[0].soundId : null);
  const currentTrack = sounds.find((s) => s.id === currentSoundId);
  const isPlaying = activeSounds.some((a) => a.soundId === currentSoundId && !a.isPaused);
  const isPaused = activeSounds.some((a) => a.soundId === currentSoundId && a.isPaused);

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
    .map((id: string) => sounds.find((s: SoundboardItem) => s.id === id))
    .filter((s: SoundboardItem | undefined): s is SoundboardItem => !!s);

  const formatTime = (secs: number) => {
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

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    await createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
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
      <div className="w-[840px] max-w-full h-[650px] max-h-[92vh] bg-[#121316] rounded-3xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#17181c]/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-accent-primary to-accent-bright flex items-center justify-center text-white shadow-lg shadow-accent-bright/20">
              <Disc3 className="w-5 h-5 animate-[spin_8s_linear_infinite]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                NIGHTSHIFT Music Player
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-accent-bright/15 text-accent-bright border border-accent-bright/30">
                  PRO AUDIO
                </span>
              </h2>
              <p className="text-xs text-text-muted">High-fidelity voice channel music & queue controller</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation Tabs */}
            <div className="flex items-center bg-[#1c1d22] p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'queue' ? 'bg-accent-bright text-black shadow-md' : 'text-text-muted hover:text-white'
                }`}
              >
                Queue ({queue.length})
              </button>
              <button
                onClick={() => setActiveTab('playlists')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'playlists' ? 'bg-accent-bright text-black shadow-md' : 'text-text-muted hover:text-white'
                }`}
              >
                Playlists ({playlists.length})
              </button>
            </div>

            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-text-muted hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Left Panel: Currently Playing Card & Transport Controls */}
          <div className="w-full md:w-[340px] border-b md:border-b-0 md:border-r border-white/5 p-6 flex flex-col justify-between bg-gradient-to-b from-[#15161a] to-[#0e0f11] shrink-0">
            {currentTrack ? (
              <div className="flex flex-col items-center text-center">
                {/* Vinyl / Cover Art */}
                <div className="relative group my-4">
                  <div
                    className={`w-44 h-44 rounded-full border-4 border-white/10 shadow-[0_0_35px_rgba(0,0,0,0.8)] bg-gradient-to-tr from-[#1b1c22] via-[#2a2c35] to-[#16171b] flex items-center justify-center relative overflow-hidden transition-all ${
                      isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''
                    }`}
                  >
                    {/* Vinyl Grooves */}
                    <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />
                    <div className="absolute inset-6 rounded-full border border-white/5 pointer-events-none" />
                    <div className="absolute inset-10 rounded-full border border-white/5 pointer-events-none" />
                    <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-accent-primary to-accent-bright flex items-center justify-center text-white shadow-inner">
                      <Music className="w-7 h-7" />
                    </div>
                  </div>

                  {/* Favorite Button on Card */}
                  <button
                    onClick={() => toggleFavorite(currentTrack.id)}
                    className="absolute top-2 right-2 p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white hover:text-rose-500 transition-colors cursor-pointer"
                    title={currentTrack.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Heart className={`w-4 h-4 ${currentTrack.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>
                </div>

                <h3 className="font-bold text-base text-white tracking-wide truncate max-w-[280px]">
                  {currentTrack.name}
                </h3>
                <span className="text-xs text-text-muted mt-0.5">{currentTrack.category} • Channel Broadcast</span>

                {/* Live Seek Progress Bar */}
                <div className="w-full mt-6 flex flex-col gap-1.5">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={playbackProgress.progress * 100}
                    onChange={handleSeek}
                    className="w-full h-1.5 accent-accent-bright bg-white/10 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-text-muted">
                    <span>{formatTime(playbackProgress.currentTime)}</span>
                    <span>{formatTime(playbackProgress.duration || currentTrack.duration)}</span>
                  </div>
                </div>

                {/* Transport Controls */}
                <div className="flex items-center justify-center gap-3 mt-4">
                  {/* Shuffle Button */}
                  <button
                    onClick={toggleShuffle}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      isShuffle ? 'text-accent-bright bg-accent-bright/15' : 'text-text-muted hover:text-white'
                    }`}
                    title={isShuffle ? 'Shuffle enabled' : 'Shuffle disabled'}
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>

                  {/* Previous Track */}
                  <button
                    onClick={playPrevious}
                    disabled={queue.length <= 1}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                    title="Previous track"
                  >
                    <SkipBack className="w-4 h-4 fill-current" />
                  </button>

                  {/* Play / Pause Toggle */}
                  <button
                    onClick={() => {
                      if (isPlaying) {
                        togglePauseSound(currentTrack.id);
                      } else if (isPaused) {
                        togglePauseSound(currentTrack.id);
                      } else {
                        playSound(currentTrack.id, false);
                      }
                    }}
                    className="w-12 h-12 rounded-2xl bg-accent-bright text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent-bright/25 cursor-pointer"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>

                  {/* Next Track */}
                  <button
                    onClick={playNext}
                    disabled={queue.length <= 1}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                    title="Next track"
                  >
                    <SkipForward className="w-4 h-4 fill-current" />
                  </button>

                  {/* Repeat Mode */}
                  <button
                    onClick={toggleRepeat}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      repeatMode !== 'off' ? 'text-accent-bright bg-accent-bright/15' : 'text-text-muted hover:text-white'
                    }`}
                    title={`Repeat: ${repeatMode}`}
                  >
                    {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-text-muted">
                <Music className="w-12 h-12 stroke-[1.2] opacity-30 mb-3" />
                <h4 className="text-sm font-semibold text-white">No Track Playing</h4>
                <p className="text-xs text-text-muted mt-1 max-w-[200px]">
                  Select a song or playlist to start playing music in this channel.
                </p>
              </div>
            )}
          </div>

          {/* Right Panel: Active Queue or Playlists List */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#121316]">
            {activeTab === 'queue' ? (
              <div className="flex-1 flex flex-col overflow-hidden p-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Playback Queue
                      <span className="text-xs text-accent-bright">({queueItems.length} songs)</span>
                    </h3>
                    <p className="text-xs text-text-muted">Up next in channel stream</p>
                  </div>

                  {queue.length > 0 && (
                    <button
                      onClick={() => setQueue([])}
                      className="text-xs text-text-muted hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear Queue
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pt-3 pr-1">
                  {queueItems.length > 0 ? (
                    queueItems.map((item: SoundboardItem, index: number) => {
                      const isCurrent = index === currentQueueIndex;
                      return (
                        <div
                          key={`${item.id}-${index}`}
                          className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                            isCurrent
                              ? 'bg-accent-bright/10 border-accent-bright/40 text-white shadow-sm'
                              : 'bg-[#18191d]/60 border-white/5 text-text-muted hover:bg-[#1f2026] hover:text-white'
                          }`}
                        >
                          <div
                            onClick={() => {
                              setQueue(queue, index);
                            }}
                            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          >
                            <span className="text-xs font-mono w-5 text-text-muted shrink-0">
                              {isCurrent ? (
                                <span className="inline-block w-2 h-2 rounded-full bg-accent-bright animate-ping" />
                              ) : (
                                index + 1
                              )}
                            </span>

                            <div className="flex flex-col min-w-0">
                              <span
                                className={`text-xs font-semibold truncate ${
                                  isCurrent ? 'text-accent-bright' : 'text-white'
                                }`}
                              >
                                {item.name}
                              </span>
                              <span className="text-[10px] text-text-muted">
                                {item.category} • {formatTime(item.duration)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <button
                              onClick={() => toggleFavorite(item.id)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                              title="Favorite"
                            >
                              <Heart className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                            </button>

                            <button
                              onClick={() => handleRemoveFromQueue(index)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove from queue"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-text-muted">
                      <Music className="w-10 h-10 stroke-[1.2] opacity-30 mb-2" />
                      <p className="text-xs">Queue is currently empty.</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Add tracks from the Library or Playlists tab.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Playlists Tab */
              <div className="flex-1 flex flex-col overflow-hidden p-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/5">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Playlists & Collections
                    </h3>
                    <p className="text-xs text-text-muted">Group your favorite songs into custom playlists</p>
                  </div>

                  <button
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="px-3 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs flex items-center gap-1.5 hover:bg-accent-bright/90 transition-all cursor-pointer shadow-md shadow-accent-bright/15"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    New Playlist
                  </button>
                </div>

                {/* Create Playlist Inline Form */}
                {isCreatingPlaylist && (
                  <form
                    onSubmit={handleCreatePlaylist}
                    className="my-3 p-3 bg-[#18191d] rounded-2xl border border-accent-bright/30 flex items-center gap-2 animate-in fade-in duration-150"
                  >
                    <input
                      type="text"
                      placeholder="Playlist Name (e.g. Chill Beats, Hype)..."
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      autoFocus
                      className="flex-1 bg-[#121316] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright"
                    />
                    <button
                      type="submit"
                      disabled={!newPlaylistName.trim()}
                      className="px-3 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs hover:bg-accent-bright/90 disabled:opacity-40 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName('');
                      }}
                      className="p-1.5 rounded-xl bg-white/5 text-text-muted hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {/* Playlists Grid */}
                <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
                  {/* Quick Favorites Card */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/30 to-purple-950/20 border border-rose-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                        <Heart className="w-5 h-5 fill-rose-500" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                          Favorites Collection
                          <span className="text-[10px] text-rose-400 font-normal">
                            ({sounds.filter((s) => s.isFavorite).length} tracks)
                          </span>
                        </h4>
                        <p className="text-[11px] text-text-muted">All songs you marked with a heart</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const favIds = sounds.filter((s) => s.isFavorite).map((s) => s.id);
                        if (favIds.length > 0) {
                          setQueue(favIds, 0);
                        }
                      }}
                      disabled={sounds.filter((s) => s.isFavorite).length === 0}
                      className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-md"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play All
                    </button>
                  </div>

                  {/* Custom Playlists */}
                  {playlists.map((pl: Playlist) => (
                    <div
                      key={pl.id}
                      className="p-3.5 rounded-2xl bg-[#18191d] border border-white/5 hover:border-white/10 flex items-center justify-between transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-accent-bright/15 border border-accent-bright/30 flex items-center justify-center text-accent-bright shrink-0">
                          <Disc3 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{pl.name}</h4>
                          <span className="text-[11px] text-text-muted">
                            {pl.soundIds.length} track{pl.soundIds.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => playPlaylist(pl.id, 0)}
                          disabled={pl.soundIds.length === 0}
                          className="px-3 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs flex items-center gap-1 hover:bg-accent-bright/90 disabled:opacity-40 transition-all cursor-pointer shadow-md"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Play
                        </button>

                        <button
                          onClick={() => useSoundboardStore.getState().deletePlaylist(pl.id)}
                          className="p-1.5 rounded-xl bg-white/5 text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {playlists.length === 0 && (
                    <div className="py-8 text-center text-text-muted">
                      <p className="text-xs">No custom playlists created yet.</p>
                      <p className="text-[11px] text-text-muted mt-1">
                        Click "New Playlist" above to build your first collection!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MusicQueueModal;
