import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Search,
  Play,
  Pause,
  Heart,
  ListPlus,
  ListMusic,
  Disc3,
  Music,
  CloudUpload,
  Volume2,
  Volume1,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Radio,
  ChevronDown,
  Square,
  Download,
  Trash2,
  Loader2,
  GripVertical,
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { SoundboardItem } from '../../services/soundboard.storage';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

type SoundSort = 'recent' | 'oldest' | 'name' | 'artist' | 'longest';

const SORT_OPTIONS: { id: SoundSort; label: string }[] = [
  { id: 'recent', label: 'Recently added' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'Name' },
  { id: 'artist', label: 'Artist' },
  { id: 'longest', label: 'Longest' },
];

export const SoundboardModal: React.FC = () => {
  const {
    sounds,
    cloudSounds,
    playlists,
    activeSounds,
    masterVolume,
    searchQuery,
    isSoundboardOpen,
    isCloudLoading,
    isCloudUploading,
    loadSounds,
    loadCloudSounds,
    loadPlaylists,
    importSound,
    uploadToCloud,
    deleteFromCloud,
    saveCloudToLocal,
    playCloudSound,
    playSound,
    togglePlayPause,
    stopAll,
    deleteSound,
    toggleFavorite,
    setMasterVolume,
    setSearchQuery,
    setSoundboardOpen,
    setQueueOpen,
    setQueue,
    queue,
    currentQueueIndex,
    isShuffle,
    repeatMode,
    toggleShuffle,
    toggleRepeat,
    playNext,
    playPrevious,
    seekSound,
    allowWhileMuted,
    setAllowWhileMuted,
  } = useSoundboardStore();

  const [navSection, setNavSection] = useState<'library' | 'soundboard' | 'playlists' | 'favorites' | 'uploads'>('library');
  const [filterType, setFilterType] = useState<'all' | 'music' | 'sfx'>('all');
  const [sortBy, setSortBy] = useState<SoundSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [playlistPopoverSoundId, setPlaylistPopoverSoundId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; progress: number }>({
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cloudFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSoundboardOpen) {
      loadSounds();
      loadPlaylists();
      loadCloudSounds();
    }
  }, [isSoundboardOpen]);

  useEffect(() => {
    if (!sortOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [sortOpen]);

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

  // Current playing track calculation
  const currentSoundId = queue[currentQueueIndex] || (activeSounds.length > 0 ? activeSounds[0].soundId : (sounds.length > 0 ? sounds[0].id : null));
  const currentTrack = currentSoundId ? allAvailableTracks.get(currentSoundId) : null;
  const isCurrentPlaying = activeSounds.some((a) => a.soundId === currentSoundId && !a.isPaused);

  useEffect(() => {
    if (!isSoundboardOpen || !currentSoundId) return;

    const interval = setInterval(() => {
      const prog = soundboardAudioEngine.getPlaybackProgress(currentSoundId);
      if (prog) {
        setPlaybackProgress(prog);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isSoundboardOpen, currentSoundId]);

  if (!isSoundboardOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      alert('Supported audio formats: MP3, WAV, OGG, M4A, AAC, FLAC');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    await importSound(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloudFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      alert('Supported audio formats: MP3, WAV, OGG, M4A, AAC, FLAC');
      if (cloudFileInputRef.current) cloudFileInputRef.current.value = '';
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      alert('Audio file size exceeds the 40MB limit for cloud storage.');
      if (cloudFileInputRef.current) cloudFileInputRef.current.value = '';
      return;
    }

    const success = await uploadToCloud(file);
    if (cloudFileInputRef.current) cloudFileInputRef.current.value = '';
    if (success) {
      loadCloudSounds();
    } else {
      alert(useSoundboardStore.getState().error || 'Failed to upload audio to cloud.');
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Filter lists: combine local sounds and cloud sounds into a unified library list
  const allTracksList = Array.from(allAvailableTracks.values());
  const musicSounds = allTracksList.filter((s) => (s.category || '').toLowerCase() !== 'sfx');
  const sfxSounds = allTracksList.filter((s) => (s.category || '').toLowerCase() === 'sfx');
  const favoriteSounds = allTracksList.filter((s) => s.isFavorite);

  let displayedSounds = allTracksList;
  if (navSection === 'library') {
    displayedSounds = allTracksList;
  } else if (navSection === 'soundboard') {
    displayedSounds = sfxSounds;
  } else if (navSection === 'favorites') {
    displayedSounds = favoriteSounds;
  } else if (navSection === 'uploads') {
    displayedSounds = allTracksList.filter((s) => s.source === 'cloud');
  }

  if (filterType === 'music') {
    displayedSounds = displayedSounds.filter((s) => (s.category || '').toLowerCase() !== 'sfx');
  } else if (filterType === 'sfx') {
    displayedSounds = displayedSounds.filter((s) => (s.category || '').toLowerCase() === 'sfx');
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayedSounds = displayedSounds.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.artist && s.artist.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q))
    );
  }

  displayedSounds = [...displayedSounds].sort((a, b) => {
    if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'fa');
    if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '', 'fa');
    if (sortBy === 'longest') return (b.duration || 0) - (a.duration || 0);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // Play sound and update queue
  const handlePlaySound = (sound: SoundboardItem) => {
    if (!queue.includes(sound.id)) {
      setQueue([...queue, sound.id], queue.length);
    }
    playSound(sound.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-[880px] max-w-full h-[660px] max-h-[92vh] bg-[#0c0d12] rounded-3xl border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-white font-sans">
        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={cloudFileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          onChange={handleCloudFileUpload}
          className="hidden"
        />

        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-[#0e1015] shrink-0">
          {/* Left: Brand Icon + Title + Subtitle */}
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-[#1db954] shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">Audio & Soundboard Studio</h2>
              <p className="text-[11px] text-white/50">Music • Soundboard • Better Together</p>
            </div>
          </div>

          {/* Right: Functional Stop All & Close */}
          <div className="flex items-center gap-2">
            {activeSounds.length > 0 && (
              <button
                onClick={stopAll}
                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                title="Stop all currently playing audio"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop All</span>
              </button>
            )}

            {/* Close Modal */}
            <button
              onClick={() => setSoundboardOpen(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Column Studio Body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* =======================================================
              1. LEFT NAVIGATION SIDEBAR
             ======================================================= */}
          <div className="w-48 shrink-0 bg-[#0e1015] border-r border-white/5 p-3 flex flex-col">
            {/* Nav Pills */}
            <div className="space-y-1">
              <button
                onClick={() => setNavSection('library')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  navSection === 'library'
                    ? 'bg-[#13271d] text-[#1db954] font-bold border border-[#1db954]/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Music className="w-4 h-4" />
                  <span>Music Library</span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  navSection === 'library' ? 'bg-[#1db954]/20 text-[#1db954]' : 'bg-white/10 text-white/60'
                }`}>
                  {sounds.length}
                </span>
              </button>

              <button
                onClick={() => setNavSection('soundboard')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  navSection === 'soundboard'
                    ? 'bg-[#13271d] text-[#1db954] font-bold border border-[#1db954]/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4" />
                  <span>Soundboard</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                  {sfxSounds.length}
                </span>
              </button>

              <button
                onClick={() => setNavSection('playlists')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  navSection === 'playlists'
                    ? 'bg-[#13271d] text-[#1db954] font-bold border border-[#1db954]/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ListMusic className="w-4 h-4" />
                  <span>Playlists</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                  {playlists.length}
                </span>
              </button>

              <button
                onClick={() => setNavSection('favorites')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  navSection === 'favorites'
                    ? 'bg-[#13271d] text-[#1db954] font-bold border border-[#1db954]/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Heart className="w-4 h-4" />
                  <span>Favorites</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                  {favoriteSounds.length}
                </span>
              </button>

              <button
                onClick={() => {
                  setNavSection('uploads');
                  loadCloudSounds();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  navSection === 'uploads'
                    ? 'bg-[#13271d] text-[#1db954] font-bold border border-[#1db954]/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CloudUpload className="w-4 h-4" />
                  <span>Uploads</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                  {cloudSounds.length}
                </span>
              </button>
            </div>
          </div>

          {/* =======================================================
              2. CENTER MAIN CONTENT AREA (Track Table)
             ======================================================= */}
          <div className="flex-1 min-w-0 flex flex-col bg-[#0c0d12] p-4 overflow-hidden">
            {/* Header Block: Title, Stats, Search, Add Music */}
            <div className="flex items-center gap-3 mb-3 shrink-0 min-w-0">
              <Music className="w-5 h-5 text-[#1db954] shrink-0" />
              <h1 className="text-base font-black text-white tracking-wide truncate min-w-0">
                {navSection === 'library'
                  ? 'Music Library'
                  : navSection === 'soundboard'
                  ? 'Soundboard Effects'
                  : navSection === 'favorites'
                  ? 'Favorite Tracks'
                  : navSection === 'playlists'
                  ? 'Custom Playlists'
                  : 'Cloud Uploads'}
              </h1>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <div className="relative w-[132px]">
                  <Search className="w-3 h-3 text-white/40 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="studio-search-input"
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#13151b] border border-white/5 rounded-md pl-6 pr-2 py-1 text-[11px] leading-none text-white placeholder:text-white/40 focus:outline-none focus:border-[#1db954]/50"
                  />
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 px-2.5 rounded-md bg-[#23a55a] hover:bg-[#209650] text-black font-extrabold text-[11px] flex items-center gap-1 transition-all shadow-md shadow-[#23a55a]/20 cursor-pointer active:scale-95 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Add Music</span>
                </button>
              </div>
            </div>

            {navSection === 'uploads' ? (
              /* Dedicated Cloud Uploads Section */
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Cloud Header & Upload Button */}
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#121620] to-[#0c0e14] border border-white/10 mb-3 shrink-0">
                  <div className="flex items-center gap-3">
                    <CloudUpload className="w-5 h-5 text-[#23a55a] shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Cloud Storage Library</h3>
                      <p className="text-[11px] text-white/50 mt-0.5">
                        {cloudSounds.length} audio tracks synced • Stream to room or save locally
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => cloudFileInputRef.current?.click()}
                    disabled={isCloudUploading}
                    className="px-4 py-2 rounded-xl bg-[#23a55a] hover:bg-[#209650] text-black font-extrabold text-xs flex items-center gap-2 transition-all shadow-md shadow-[#23a55a]/20 cursor-pointer active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    {isCloudUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 stroke-[3]" />
                    )}
                    <span>Upload to Cloud</span>
                  </button>
                </div>

                {/* Cloud Audio Items List */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {isCloudLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-white/40">
                      <Loader2 className="w-8 h-8 animate-spin text-[#23a55a] mb-2" />
                      <p className="text-xs">Loading cloud audio files...</p>
                    </div>
                  ) : cloudSounds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-white/40 border border-dashed border-white/10 rounded-2xl p-6">
                      <CloudUpload className="w-12 h-12 mb-3 opacity-30 text-[#23a55a]" />
                      <p className="text-xs font-bold text-white/70">No files in cloud storage yet</p>
                      <p className="text-[11px] text-white/40 mt-1 max-w-xs">
                        Upload your favorite tracks to stream them to your voice channel from anywhere.
                      </p>
                      <button
                        onClick={() => cloudFileInputRef.current?.click()}
                        className="mt-4 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Select Audio File</span>
                      </button>
                    </div>
                  ) : (
                    cloudSounds.map((cloudItem) => (
                      <div
                        key={cloudItem.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-[#12141a] border border-white/5 hover:border-white/10 transition-all gap-3"
                      >
                        {/* Left: Artwork / Disc Icon + Title */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-[#181b24] border border-white/10 flex items-center justify-center text-[#23a55a] shrink-0">
                            <Disc3 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{cloudItem.name}</h4>
                            <p className="text-[10px] text-white/50 truncate flex items-center gap-2 mt-0.5">
                              <span className="text-[#23a55a] font-semibold">{cloudItem.category || 'General'}</span>
                              <span>•</span>
                              <span>{formatTime(cloudItem.duration || 180)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Right: Contained, cleanly aligned action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Play in Voice Room */}
                          <button
                            onClick={() => playCloudSound(cloudItem)}
                            className="px-3 py-1.5 rounded-xl bg-[#23a55a] hover:bg-[#209650] text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
                            title="Play in voice room"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play</span>
                          </button>

                          {/* Save to Local Offline Library */}
                          <button
                            onClick={async () => {
                              const success = await saveCloudToLocal(cloudItem);
                              if (success) alert(`Saved "${cloudItem.name}" to your local library!`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                            title="Download and save to local library"
                          >
                            <Download className="w-3.5 h-3.5 text-[#23a55a]" />
                            <span>Save to Local</span>
                          </button>

                          {/* Delete from Cloud */}
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${cloudItem.name}" from cloud storage?`)) {
                                deleteFromCloud(cloudItem.id);
                              }
                            }}
                            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 border border-white/5 flex items-center justify-center transition-all cursor-pointer"
                            title="Delete from cloud"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Regular Library Track Table */
              <>
                {/* Filter Pills & Sort Row */}
                <div className="flex items-center justify-between gap-2 mb-2 shrink-0 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <button
                      onClick={() => setFilterType('all')}
                      className={`h-6 px-2 rounded-md text-[11px] font-semibold leading-none whitespace-nowrap transition-all cursor-pointer ${
                        filterType === 'all'
                          ? 'bg-[#23a55a] text-black'
                          : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      All ({allTracksList.length})
                    </button>
                    <button
                      onClick={() => setFilterType('music')}
                      className={`h-6 px-2 rounded-md text-[11px] font-semibold leading-none whitespace-nowrap transition-all cursor-pointer ${
                        filterType === 'music'
                          ? 'bg-[#23a55a] text-black'
                          : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Music ({musicSounds.length})
                    </button>
                    <button
                      onClick={() => setFilterType('sfx')}
                      className={`h-6 px-2 rounded-md text-[11px] font-semibold leading-none whitespace-nowrap transition-all cursor-pointer ${
                        filterType === 'sfx'
                          ? 'bg-[#23a55a] text-black'
                          : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      Sound Effects ({sfxSounds.length})
                    </button>
                  </div>

                  <div className="relative shrink-0" ref={sortMenuRef}>
                    <button
                      type="button"
                      onClick={() => setSortOpen((open) => !open)}
                      className="h-6 px-2 rounded-md flex items-center gap-1 text-[10px] font-semibold text-white/60 bg-[#14161d] border border-white/5 whitespace-nowrap cursor-pointer hover:text-white hover:border-white/15"
                      title="Sort tracks"
                    >
                      <span>{SORT_OPTIONS.find((option) => option.id === sortBy)?.label}</span>
                      <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {sortOpen && (
                      <div className="absolute right-0 top-full mt-1 z-30 min-w-[132px] rounded-md border border-white/10 bg-[#14161d] shadow-xl py-1">
                        {SORT_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => {
                              setSortBy(option.id);
                              setSortOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                              sortBy === option.id
                                ? 'text-[#1db954] bg-white/5'
                                : 'text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Track Table Header */}
                <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 shrink-0">
                  <span className="w-5 text-center shrink-0">#</span>
                  <span className="flex-1 min-w-0">Track</span>
                  <span className="w-10 text-right shrink-0">Time</span>
                  <span className="w-14 text-right shrink-0">Size</span>
                  <span className="w-[104px] text-right shrink-0">Actions</span>
                </div>

                {/* Track Table List (Scrollable) */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-1 mt-1 pr-1 custom-scrollbar">
                  {displayedSounds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-white/40">
                      <Music className="w-10 h-10 mb-2 opacity-30 text-[#1db954]" />
                      <p className="text-xs font-bold text-white/70">No tracks found</p>
                      <p className="text-[11px] text-white/40 mt-0.5">Click '+ Add Music' above to import audio tracks</p>
                    </div>
                  ) : (
                    displayedSounds.map((sound, idx) => {
                      const isPlayingThis = activeSounds.some((a) => a.soundId === sound.id && !a.isPaused);
                      const isCurrentThis = currentSoundId === sound.id;

                      return (
                        <div
                          key={sound.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all group ${
                            isCurrentThis
                              ? 'bg-[#13271d]/60 border-l-2 border-[#1db954]'
                              : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                          }`}
                        >
                          <span className="w-5 text-center text-white/40 font-mono text-[11px] shrink-0">
                            {idx + 1}
                          </span>

                          <div className="w-7 h-7 rounded-md bg-[#181a22] flex items-center justify-center shrink-0 overflow-hidden">
                            {sound.artworkUrl ? (
                              <img src={sound.artworkUrl} alt={sound.name} className="w-full h-full object-cover" />
                            ) : sound.category === 'sfx' ? (
                              <Radio className="w-3.5 h-3.5 text-[#1db954]" />
                            ) : (
                              <Disc3 className={`w-3.5 h-3.5 text-[#1db954] ${isPlayingThis ? 'animate-spin' : ''}`} />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h4 className={`text-xs font-bold truncate ${isCurrentThis ? 'text-[#1db954]' : 'text-white'}`}>
                                {sound.name}
                              </h4>
                              {sound.source === 'cloud' && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-extrabold bg-[#23a55a]/15 text-[#23a55a] border border-[#23a55a]/30 shrink-0" title="Cloud Track">
                                  CLOUD
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/50 truncate">
                              {sound.artist || sound.category || 'Nightshift Audio'}
                            </p>
                          </div>

                          <span className="w-10 text-right text-white/60 font-mono text-[11px] shrink-0 tabular-nums">
                            {formatTime(sound.duration || 180 + ((idx * 37) % 120))}
                          </span>

                          <span className="w-14 text-right text-white/50 text-[10px] font-mono shrink-0 tabular-nums">
                            {formatBytes(sound.duration ? sound.duration * 24 * 1024 : 5.4 * 1024 * 1024)}
                          </span>

                          <div className="w-[104px] flex items-center justify-end gap-1 shrink-0">
                            {/* Play/Pause Button */}
                            <button
                              onClick={() => {
                                if (isCurrentThis) {
                                  togglePlayPause(sound.id);
                                } else {
                                  handlePlaySound(sound);
                                }
                              }}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                isPlayingThis
                                  ? 'bg-[#23a55a] text-black shadow-md shadow-[#23a55a]/30'
                                  : 'bg-white/5 hover:bg-[#23a55a] hover:text-black text-white/70'
                              }`}
                              title={isPlayingThis ? 'Pause' : 'Play'}
                            >
                              {isPlayingThis ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current ml-0.5" />}
                            </button>

                            {/* Add to Playlist button */}
                            <button
                              onClick={() => setPlaylistPopoverSoundId(playlistPopoverSoundId === sound.id ? null : sound.id)}
                              className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                              title="Add to Playlist"
                            >
                              <ListPlus className="w-3 h-3" />
                            </button>

                            {/* Favorite button */}
                            <button
                              onClick={() => toggleFavorite(sound.id)}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                sound.isFavorite
                                  ? 'text-[#23a55a] bg-[#23a55a]/10'
                                  : 'text-white/40 hover:text-white bg-white/5 hover:bg-white/10'
                              }`}
                              title={sound.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
                            >
                              <Heart className={`w-3 h-3 ${sound.isFavorite ? 'fill-current' : ''}`} />
                            </button>

                            {/* Delete button */}
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${sound.name}"?`)) {
                                  deleteSound(sound.id);
                                }
                              }}
                              className="w-6 h-6 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                              title="Delete Sound"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* =======================================================
              3. RIGHT SIDEBAR (Now Playing + Queue Preview)
             ======================================================= */}
          <div className="w-44 shrink-0 bg-[#0e1015] border-l border-white/5 p-2.5 flex flex-col justify-between overflow-y-auto custom-scrollbar">
            {/* Top: Now Playing Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-white tracking-wide">Now Playing</h3>
                {isCurrentPlaying && (
                  <span className="w-2 h-2 rounded-full bg-[#1db954] animate-ping" />
                )}
              </div>

              {/* Album Art Card */}
              <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-[#161821] to-[#0c0d12] border border-white/10 relative overflow-hidden flex items-center justify-center shadow-lg group">
                {currentTrack?.artworkUrl ? (
                  <img
                    src={currentTrack.artworkUrl}
                    alt={currentTrack.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Disc3 className={`w-16 h-16 text-white/20 ${isCurrentPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />
                )}

                {/* Animated wave tag on top-left */}
                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-white/10">
                  <span className="w-1 h-2.5 rounded bg-[#1db954] animate-pulse" />
                  <span className="w-1 h-3.5 rounded bg-[#1db954] animate-pulse delay-75" />
                  <span className="w-1 h-2 rounded bg-[#1db954] animate-pulse delay-150" />
                </div>

                {/* Playing tag on bottom-right */}
                {isCurrentPlaying && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-[#23a55a] text-black font-extrabold text-[9px] shadow-sm">
                    Playing
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="mt-2.5">
                <h4 className="text-xs font-black text-white truncate">
                  {currentTrack ? currentTrack.name : 'No Track Playing'}
                </h4>
                <p className="text-[10px] text-white/50 truncate mt-0.5">
                  {currentTrack?.category || 'Nightshift Studio Audio'}
                </p>
              </div>

              {/* Progress Slider */}
              <div className="mt-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={playbackProgress.progress ? Math.floor(playbackProgress.progress * 100) : 0}
                  onChange={(e) => {
                    if (!currentSoundId || playbackProgress.duration <= 0) return;
                    const val = Number(e.target.value);
                    const targetSec = (val / 100) * playbackProgress.duration;
                    seekSound(currentSoundId, targetSec);
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#23a55a]"
                />
                <div className="flex items-center justify-between text-[9px] font-mono text-white/40 mt-1">
                  <span>{formatTime(playbackProgress.currentTime)}</span>
                  <span>{formatTime(playbackProgress.duration || (currentTrack?.duration || 270))}</span>
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between px-2 mt-2">
                <button
                  onClick={toggleShuffle}
                  className={`transition-colors cursor-pointer ${isShuffle ? 'text-[#23a55a]' : 'text-white/40 hover:text-white'}`}
                  title="Shuffle"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={playPrevious}
                  className="text-white/70 hover:text-white transition-colors cursor-pointer"
                  title="Previous"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>

                <button
                  onClick={() => {
                    if (currentSoundId) {
                      togglePlayPause(currentSoundId);
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-[#23a55a] hover:bg-[#209650] text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md shadow-[#23a55a]/30 cursor-pointer"
                  title={isCurrentPlaying ? 'Pause' : 'Play'}
                >
                  {isCurrentPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
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
                  {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Volume Slider (0-200% Real Gain Boost) */}
              <div className="flex items-center gap-2 mt-3 px-1">
                <Volume1 className="w-3.5 h-3.5 text-white/40 shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#23a55a]"
                  title={`Master Volume: ${Math.round(masterVolume)}%`}
                />
                <span className="text-[10px] font-mono text-[#23a55a] font-bold min-w-[28px] text-right shrink-0">
                  {Math.round(masterVolume)}%
                </span>
                <Volume2 className="w-3.5 h-3.5 text-white/40 shrink-0" />
              </div>

              {/* Play while muted toggle */}
              <div className="mt-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/90 font-medium truncate" title="Stream music and soundboard audio even when your microphone is muted">
                  Play while muted
                </span>
                <button
                  type="button"
                  onClick={() => setAllowWhileMuted(!allowWhileMuted)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                    allowWhileMuted ? 'bg-[#23a55a]' : 'bg-white/20'
                  }`}
                  title={allowWhileMuted ? 'Music will continue playing while muted (Enabled)' : 'Music stops when muted (Disabled)'}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-all absolute top-[2px] ${
                      allowWhileMuted ? 'right-[3px]' : 'left-[3px]'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Bottom: Queue Preview */}
            <div className="mt-4 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-white">Queue</h4>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                  {queue.length} tracks
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                {queue.length === 0 ? (
                  <p className="text-[10px] text-white/40 py-2 text-center">Queue is empty</p>
                ) : (
                  queue.slice(0, 5).map((qId, qIdx) => {
                    const qSound = sounds.find((s) => s.id === qId);
                    if (!qSound) return null;
                    return (
                      <div
                        key={`${qId}-${qIdx}`}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/5 transition-all text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GripVertical className="w-3 h-3 text-white/30 shrink-0" />
                          <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center shrink-0">
                            <Music className="w-3 h-3 text-[#1db954]" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-white truncate block max-w-[92px] text-[10px]">
                              {qSound.name}
                            </span>
                            <span className="text-[9px] text-white/40 block">
                              {formatTime(qSound.duration || 180)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* View Full Queue button */}
              <button
                onClick={() => {
                  setSoundboardOpen(false);
                  setQueueOpen(true);
                }}
                className="w-full mt-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer border border-white/5"
              >
                <span>View full queue</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
