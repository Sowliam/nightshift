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
  MoreVertical,
  Radio,
  Bell,
  ChevronDown,
  GripVertical,
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useAuthStore } from '../../stores/auth.store';
import { SoundboardItem } from '../../services/soundboard.storage';
import { getFullAvatarUrl } from '../../lib/api';
import { soundboardAudioEngine } from '../../services/soundboard-audio-engine';

const WaveformBars: React.FC<{ isPlaying?: boolean }> = ({ isPlaying }) => (
  <div className="flex items-center gap-[2.5px] h-5 px-1 shrink-0">
    {[4, 10, 16, 8, 14, 20, 12, 6, 15, 18, 9, 5, 12, 17, 7, 14, 10, 4].map((h, i) => (
      <span
        key={i}
        className={`w-[2.5px] rounded-full transition-all duration-300 ${
          isPlaying ? 'bg-[#1db954]' : 'bg-white/20'
        }`}
        style={{
          height: isPlaying ? `${Math.max(5, (h * ((i % 3) + 1.2)) % 20)}px` : `${h * 0.7}px`,
          animation: isPlaying ? `bounce 1s infinite ease-in-out` : undefined,
          animationDelay: `${i * 70}ms`,
        }}
      />
    ))}
  </div>
);

export const SoundboardModal: React.FC = () => {
  const {
    sounds,
    cloudSounds,
    playlists,
    activeSounds,
    masterVolume,
    searchQuery,
    isSoundboardOpen,
    loadSounds,
    loadCloudSounds,
    loadPlaylists,
    loadCloudStorageStatus,
    importSound,
    uploadToCloud,
    playSound,
    togglePauseSound,
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
  } = useSoundboardStore();

  const user = useAuthStore((s) => s.user);

  const [navSection, setNavSection] = useState<'library' | 'soundboard' | 'playlists' | 'favorites' | 'uploads'>('library');
  const [filterType, setFilterType] = useState<'all' | 'music' | 'sfx'>('all');
  const [playlistPopoverSoundId, setPlaylistPopoverSoundId] = useState<string | null>(null);

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
      loadCloudStorageStatus();
    }
  }, [isSoundboardOpen]);

  // Current playing track calculation
  const currentSoundId = queue[currentQueueIndex] || (activeSounds.length > 0 ? activeSounds[0].soundId : (sounds.length > 0 ? sounds[0].id : null));
  const currentTrack = sounds.find((s) => s.id === currentSoundId);
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

    await uploadToCloud(file);
    if (cloudFileInputRef.current) cloudFileInputRef.current.value = '';
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

  // Filter lists
  const musicSounds = sounds.filter((s) => (s.category || '').toLowerCase() !== 'sfx');
  const sfxSounds = sounds.filter((s) => (s.category || '').toLowerCase() === 'sfx');
  const favoriteSounds = sounds.filter((s) => s.isFavorite);

  let displayedSounds = sounds;
  if (navSection === 'soundboard') {
    displayedSounds = sfxSounds.length > 0 ? sfxSounds : sounds;
  } else if (navSection === 'favorites') {
    displayedSounds = favoriteSounds;
  } else if (navSection === 'uploads') {
    displayedSounds = sounds;
  }

  if (filterType === 'music') {
    displayedSounds = displayedSounds.filter((s) => (s.category || '').toLowerCase() !== 'sfx');
  } else if (filterType === 'sfx') {
    displayedSounds = displayedSounds.filter((s) => (s.category || '').toLowerCase() === 'sfx');
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayedSounds = displayedSounds.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.category && s.category.toLowerCase().includes(q))
    );
  }

  // Calculate total size
  const totalSizeBytes = sounds.reduce((acc, s) => acc + (s.duration ? s.duration * 24 * 1024 : 4 * 1024 * 1024), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(0);

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
          {/* Left: Brand Icon + Title + LIVE badge + Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#13271d] border border-[#1db954]/30 flex items-center justify-center text-[#1db954] shadow-[0_0_15px_rgba(29,185,84,0.3)]">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-wide">Audio & Soundboard Studio</h2>
                <span className="px-2 py-0.5 rounded-full bg-[#1db954]/15 border border-[#1db954]/30 text-[#1db954] text-[10px] font-bold flex items-center gap-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1db954] animate-ping" />
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-white/50">Music • Soundboard • Better Together</p>
            </div>
          </div>

          {/* Right: Search, Bell, User Capsule, Close */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                const searchEl = document.getElementById('studio-search-input');
                searchEl?.focus();
              }}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="Search"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            <button
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer relative"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#1db954] absolute top-2 right-2" />
            </button>

            {/* User Capsule */}
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/5 hover:border-white/10 transition-all cursor-pointer">
              <div className="w-6 h-6 rounded-full bg-[#1e2029] border border-white/10 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
                {user?.avatarUrl ? (
                  <img src={getFullAvatarUrl(user.avatarUrl)!} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  (user?.displayName || 'U')[0].toUpperCase()
                )}
              </div>
              <span className="text-xs font-semibold text-white/90 max-w-[80px] truncate">
                {user?.displayName || 'User'}
              </span>
              <ChevronDown className="w-3 h-3 text-white/50" />
            </div>

            {/* Close Modal */}
            <button
              onClick={() => setSoundboardOpen(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition-all cursor-pointer ml-1"
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
          <div className="w-48 shrink-0 bg-[#0e1015] border-r border-white/5 p-3 flex flex-col justify-between">
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
                  {sfxSounds.length > 0 ? sfxSounds.length : 12}
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
                  {cloudSounds.length > 0 ? cloudSounds.length : 1}
                </span>
              </button>
            </div>

            {/* Bottom Card: Good vibes only */}
            <div className="bg-[#12141a] border border-white/5 rounded-2xl p-2.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#1db954]/10 border border-[#1db954]/20 flex items-center justify-center text-[#1db954] shrink-0">
                  <Disc3 className="w-3.5 h-3.5 animate-[spin_6s_linear_infinite]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[11px] font-bold text-white truncate">Good vibes only</h4>
                  <p className="text-[9px] text-white/50 truncate">Music brings us closer.</p>
                </div>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1db954] shrink-0 animate-pulse" />
            </div>
          </div>

          {/* =======================================================
              2. CENTER MAIN CONTENT AREA (Track Table)
             ======================================================= */}
          <div className="flex-1 min-w-0 flex flex-col bg-[#0c0d12] p-4 overflow-hidden">
            {/* Header Block: Title, Stats, Search, Add Music */}
            <div className="flex items-start justify-between gap-4 mb-3 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#13271d] border border-[#1db954]/20 flex items-center justify-center text-[#1db954] shadow-[0_0_12px_rgba(29,185,84,0.2)] shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base font-black text-white tracking-wide">
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
                  <p className="text-[11px] text-white/60 font-medium flex items-center gap-1.5 mt-0.5">
                    <span>{displayedSounds.length} tracks</span>
                    <span>•</span>
                    <span>{totalSizeMB} MB / 10 GB</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1db954] inline-block" />
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">
                    Add your favorite music and share the vibe with everyone in the room.
                  </p>
                </div>
              </div>

              {/* Search & Add Music Button */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative w-48">
                  <Search className="w-3 h-3 text-white/40 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="studio-search-input"
                    type="text"
                    placeholder="Search tracks, artists, or keywords..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#13151b] border border-white/5 rounded-xl pl-8 pr-12 py-1.5 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:border-[#1db954]/50 transition-all"
                  />
                  <span className="text-[9px] font-mono font-bold text-white/40 absolute right-2.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded bg-white/5 border border-white/5">
                    Ctrl + K
                  </span>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-[#23a55a] hover:bg-[#209650] text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-[#23a55a]/20 cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Add Music</span>
                </button>
              </div>
            </div>

            {/* Filter Pills & Sort Row */}
            <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-[#23a55a] text-black shadow-sm'
                      : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  All ({sounds.length})
                </button>
                <button
                  onClick={() => setFilterType('music')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'music'
                      ? 'bg-[#23a55a] text-black shadow-sm'
                      : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Music ({musicSounds.length})
                </button>
                <button
                  onClick={() => setFilterType('sfx')}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    filterType === 'sfx'
                      ? 'bg-[#23a55a] text-black shadow-sm'
                      : 'bg-[#14161d] text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Sound Effects ({sfxSounds.length})
                </button>
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-white/60 bg-[#14161d] border border-white/5 px-2.5 py-1 rounded-xl">
                <span>Sort by: Recently added</span>
                <ChevronDown className="w-3 h-3 text-white/40" />
              </div>
            </div>

            {/* Track Table Header */}
            <div className="grid grid-cols-12 px-3 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider border-b border-white/5 shrink-0">
              <span className="col-span-1 text-center">#</span>
              <span className="col-span-5">Track</span>
              <span className="col-span-2 text-center">Duration</span>
              <span className="col-span-1 text-center">Size</span>
              <span className="col-span-1 text-center">Added by</span>
              <span className="col-span-2 text-right pr-2">Actions</span>
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
                      className={`grid grid-cols-12 items-center px-3 py-2 rounded-xl text-xs transition-all group ${
                        isCurrentThis
                          ? 'bg-[#13271d]/60 border-l-2 border-[#1db954]'
                          : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                      }`}
                    >
                      {/* # Index */}
                      <span className="col-span-1 text-center text-white/40 font-mono text-[11px] group-hover:text-white">
                        {idx + 1}
                      </span>

                      {/* Track info + Waveform */}
                      <div className="col-span-5 flex items-center gap-2.5 min-w-0 pr-2">
                        {/* Artwork / Icon */}
                        <div className="w-8 h-8 rounded-lg bg-[#181a22] border border-white/10 flex items-center justify-center text-white shrink-0 overflow-hidden shadow-sm">
                          {sound.category === 'sfx' ? (
                            <Radio className="w-3.5 h-3.5 text-[#1db954]" />
                          ) : (
                            <Disc3 className={`w-4 h-4 text-[#1db954] ${isPlayingThis ? 'animate-spin' : ''}`} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className={`text-xs font-bold truncate ${isCurrentThis ? 'text-[#1db954]' : 'text-white'}`}>
                            {sound.name}
                          </h4>
                          <p className="text-[10px] text-white/50 truncate">
                            {sound.category || 'Nightshift Audio'}
                          </p>
                        </div>

                        {/* Waveform preview */}
                        <WaveformBars isPlaying={isPlayingThis} />
                      </div>

                      {/* Duration */}
                      <span className="col-span-2 text-center text-white/60 font-mono text-[11px]">
                        {formatTime(sound.duration || 180 + ((idx * 37) % 120))}
                      </span>

                      {/* Size */}
                      <span className="col-span-1 text-center text-white/50 text-[11px] font-mono">
                        {formatBytes(sound.duration ? sound.duration * 24 * 1024 : 5.4 * 1024 * 1024)}
                      </span>

                      {/* Added by */}
                      <div className="col-span-1 flex items-center justify-center gap-1 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                          {user?.displayName ? user.displayName[0].toUpperCase() : 'S'}
                        </div>
                        <span className="text-[10px] text-white/70 truncate hidden md:inline">
                          {user?.displayName || 'Sool'}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-1.5 pr-1">
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => {
                            if (isPlayingThis) {
                              togglePauseSound(sound.id);
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

                        {/* Delete / Options button */}
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${sound.name}"?`)) {
                              deleteSound(sound.id);
                            }
                          }}
                          className="w-6 h-6 rounded-full bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete Sound"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* =======================================================
              3. RIGHT SIDEBAR (Now Playing + Queue Preview)
             ======================================================= */}
          <div className="w-64 shrink-0 bg-[#0e1015] border-l border-white/5 p-3.5 flex flex-col justify-between overflow-y-auto custom-scrollbar">
            {/* Top: Now Playing Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-white tracking-wide">Now Playing</h3>
                {isCurrentPlaying && (
                  <span className="w-2 h-2 rounded-full bg-[#1db954] animate-ping" />
                )}
              </div>

              {/* Album Art Card */}
              <div className="w-full aspect-video rounded-xl bg-gradient-to-br from-[#161821] to-[#0c0d12] border border-white/10 relative overflow-hidden flex items-center justify-center shadow-lg group">
                <Disc3 className={`w-16 h-16 text-white/20 ${isCurrentPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`} />

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
                      if (isCurrentPlaying) {
                        togglePauseSound(currentSoundId);
                      } else {
                        playSound(currentSoundId);
                      }
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

              {/* Volume Slider */}
              <div className="flex items-center gap-2 mt-3 px-1">
                <Volume1 className="w-3.5 h-3.5 text-white/40" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#23a55a]"
                />
                <Volume2 className="w-3.5 h-3.5 text-white/40" />
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
                            <span className="font-semibold text-white truncate block max-w-[110px] text-[10px]">
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
