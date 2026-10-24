import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Headphones,
  Search,
  Square,
  Play,
  Pause,
  Sliders,
  Check,
  AlertCircle,
  Loader2,
  Heart,
  ListPlus,
  ListMusic,
  Disc3,
  Music,
  FolderPlus,
  Cloud,
  CloudUpload,
  Download,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { Playlist, SoundboardItem } from '../../services/soundboard.storage';
import { CloudSoundItem } from '../../lib/api';

export const SoundboardModal: React.FC = () => {
  const {
    sounds,
    cloudSounds,
    isCloudLoading,
    isCloudUploading,
    cloudStorageStatus,
    playlists,
    activePlayingIds,
    activeSounds,
    masterVolume,
    localMonitorVolume,
    localMonitorMuted,
    allowWhileMuted,
    selectedCategory,
    searchQuery,
    isSoundboardOpen,
    isImporting,
    error,
    loadSounds,
    loadCloudSounds,
    loadCloudStorageStatus,
    uploadToCloud,
    deleteFromCloud,
    playCloudSound,
    saveCloudToLocal,
    loadPlaylists,
    importSound,
    playSound,
    stopSound,
    stopAll,
    togglePauseSound,
    updateSound,
    deleteSound,
    toggleFavorite,
    createPlaylist,
    deletePlaylist,
    addSoundToPlaylist,
    removeSoundFromPlaylist,
    playPlaylist,
    setMasterVolume,
    setLocalMonitorVolume,
    setLocalMonitorMuted,
    setAllowWhileMuted,
    setSelectedCategory,
    setSearchQuery,
    setSoundboardOpen,
    setQueueOpen,
    setQueue,
  } = useSoundboardStore();

  const [activeTab, setActiveTab] = useState<'library' | 'playlists' | 'favorites' | 'cloud' | 'settings'>('library');
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [assigningHotkeySoundId, setAssigningHotkeySoundId] = useState<string | null>(null);
  const [playlistPopoverSoundId, setPlaylistPopoverSoundId] = useState<string | null>(null);
  const [newPlaylistInput, setNewPlaylistInput] = useState('');
  const [isCreatingNewPlaylist, setIsCreatingNewPlaylist] = useState(false);
  const [savedLocalMap, setSavedLocalMap] = useState<Record<string, boolean>>({});

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

  // Listener for assigning hotkey to a sound
  useEffect(() => {
    if (!assigningHotkeySoundId) return;

    const handleKeyAssign = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        updateSound(assigningHotkeySoundId, { hotkey: null });
        setAssigningHotkeySoundId(null);
        return;
      }

      const conflict = sounds.find(
        (s) => s.id !== assigningHotkeySoundId && s.hotkey?.toLowerCase() === e.code.toLowerCase()
      );
      if (conflict) {
        updateSound(conflict.id, { hotkey: null });
      }

      updateSound(assigningHotkeySoundId, { hotkey: e.code });
      setAssigningHotkeySoundId(null);
    };

    window.addEventListener('keydown', handleKeyAssign, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyAssign, { capture: true });
    };
  }, [assigningHotkeySoundId, sounds]);

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

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    await updateSound(id, {
      name: editingName.trim(),
      category: editingCategory.trim() || 'General',
    });
    setEditingSoundId(null);
  };

  const categories = ['All', ...Array.from(new Set(sounds.map((s) => s.category || 'General')))];

  const filteredSounds = sounds.filter((s) => {
    if (activeTab === 'favorites' && !s.isFavorite) return false;
    const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.hotkey && s.hotkey.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

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

  const handleSaveToLocal = async (item: CloudSoundItem) => {
    setSavedLocalMap((prev) => ({ ...prev, [item.id]: true }));
    const success = await saveCloudToLocal(item);
    if (!success) {
      setSavedLocalMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const filteredCloudSounds = cloudSounds.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      (s.uploaderName && s.uploaderName.toLowerCase().includes(q))
    );
  });

  const formatHotkeyLabel = (code: string | null) => {
    if (!code) return 'None';
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Numpad/, 'Num ');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCreatePlaylistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistInput.trim()) return;
    await createPlaylist(newPlaylistInput.trim());
    setNewPlaylistInput('');
    setIsCreatingNewPlaylist(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="w-[880px] max-w-full h-[660px] max-h-[92vh] bg-[#101114] rounded-3xl border border-white/10 shadow-[0_25px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden">
        {/* Hidden Local File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Hidden Cloud File Input (Cloudflare R2) */}
        <input
          ref={cloudFileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          onChange={handleCloudFileUpload}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#16171b]/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-accent-primary to-accent-bright flex items-center justify-center text-white shadow-lg shadow-accent-bright/20">
              <Disc3 className="w-5 h-5 animate-[spin_8s_linear_infinite]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Audio & Soundboard Studio</h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-accent-bright/15 text-accent-bright border border-accent-bright/30">
                  Hi-Fi
                </span>
              </div>
              <p className="text-xs text-text-muted">Broadcast audio tracks, manage playlists & sound effects</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Open Full Music Player / Queue Button */}
            <button
              onClick={() => {
                setSoundboardOpen(false);
                setQueueOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10 transition-colors cursor-pointer"
              title="Open Now Playing Music Queue"
            >
              <ListMusic className="w-3.5 h-3.5 text-accent-bright" />
              <span>Music Player</span>
            </button>

            {/* Stop All Active Sounds */}
            {activePlayingIds.length > 0 && (
              <button
                onClick={stopAll}
                className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop all currently playing tracks"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop All ({activePlayingIds.length})</span>
              </button>
            )}

            {/* Close Modal */}
            <button
              onClick={() => setSoundboardOpen(false)}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border border-white/10 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 py-2.5 border-b border-white/5 bg-[#141519] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-[#1a1b21] p-1 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('library')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-accent-bright text-black shadow-md shadow-accent-bright/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              Library ({sounds.length})
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'favorites'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              Favorites ({sounds.filter((s) => s.isFavorite).length})
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'playlists'
                  ? 'bg-accent-bright text-black shadow-md shadow-accent-bright/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              Playlists ({playlists.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('cloud');
                loadCloudSounds();
                loadCloudStorageStatus();
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'cloud'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud ({cloudSounds.length})</span>
              {cloudStorageStatus?.r2Configured && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Cloudflare R2 Storage Connected" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-accent-bright text-black shadow-md shadow-accent-bright/20'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Audio Settings
            </button>
          </div>

          {activeTab !== 'playlists' && activeTab !== 'settings' && (
            <div className="flex items-center gap-2">
              {/* Search Bar */}
              <div className="relative w-44 sm:w-60">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={activeTab === 'cloud' ? 'Search cloud vault...' : 'Search title, category, hotkey...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#18191e] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright transition-all"
                />
              </div>

              {/* Upload Button based on Tab */}
              {activeTab === 'cloud' ? (
                <button
                  type="button"
                  disabled={isCloudUploading}
                  onClick={() => cloudFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-sky-500/20 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Upload audio to Cloudflare R2 (up to 40MB)"
                >
                  {isCloudUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                  <span>{isCloudUploading ? 'Uploading...' : 'Upload to Cloud'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-accent-bright hover:bg-white text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-accent-bright/15 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Upload audio file (MP3, WAV, OGG, M4A)"
                >
                  {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                  <span>{isImporting ? 'Importing...' : 'Add Sound'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Category Pills (Only in Library Tab) */}
        {activeTab === 'library' && (
          <div className="px-6 py-2 border-b border-white/5 bg-[#121316] flex items-center gap-1.5 overflow-x-auto shrink-0 custom-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-accent-bright text-black font-bold shadow-sm'
                    : 'bg-[#18191e] hover:bg-[#22232a] text-text-muted hover:text-white border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Error notification banner */}
        {error && (
          <div className="mx-6 mt-3 px-4 py-2 rounded-2xl bg-rose-500/90 text-white text-xs font-semibold flex items-center gap-2 shadow-sm shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Main Content Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-[300px]">
          {/* TAB 1 & 2: Library & Favorites */}
          {(activeTab === 'library' || activeTab === 'favorites') && (
            <>
              {activeTab === 'favorites' && sounds.filter((s) => s.isFavorite).length > 0 && (
                <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/40 via-[#18191e] to-[#121316] border border-rose-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                      <Heart className="w-5 h-5 fill-rose-500" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Your Favorites Collection</h4>
                      <p className="text-[11px] text-text-muted">Quick-play all your favorite tracks into the voice channel</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const favIds = sounds.filter((s) => s.isFavorite).map((s) => s.id);
                      if (favIds.length > 0) {
                        setQueue(favIds, 0);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Play Favorites Queue
                  </button>
                </div>
              )}

              {filteredSounds.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-text-muted">
                  <div className="w-14 h-14 rounded-3xl bg-[#18191e] border border-white/5 flex items-center justify-center text-accent-bright mb-3">
                    <Music className="w-7 h-7 opacity-40" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    {activeTab === 'favorites' ? 'No Favorites Yet' : 'No Sounds Found'}
                  </h3>
                  <p className="text-xs text-text-muted max-w-sm mb-4">
                    {activeTab === 'favorites'
                      ? 'Click the heart icon on any sound to add it to your favorites!'
                      : searchQuery
                      ? 'No tracks match your search filter.'
                      : 'Your library is empty. Click "Add Sound" above to import audio files.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredSounds.map((item) => {
                    const activeSound = activeSounds.find((s) => s.soundId === item.id);
                    const isPaused = !!activeSound && activeSound.isPaused;
                    const isLocalOnly = !!activeSound && activeSound.isLocalOnly;
                    const isBroadcasting = !!activeSound && !activeSound.isLocalOnly;
                    const isAssigningKey = assigningHotkeySoundId === item.id;
                    const isEditing = editingSoundId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`relative p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between group ${
                          isLocalOnly
                            ? 'bg-[#1b1528] border-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                            : isBroadcasting
                            ? 'bg-accent-bright/10 border-accent-bright shadow-[0_0_20px_rgba(82,183,136,0.2)]'
                            : 'bg-[#15161b] hover:bg-[#1a1c22] border-white/5 hover:border-white/10'
                        }`}
                      >
                        {/* Status Badges */}
                        {isLocalOnly && (
                          <div className="flex items-center justify-between text-[10px] font-bold text-purple-400 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-xl mb-2">
                            <span className="flex items-center gap-1">
                              <Headphones className="w-3 h-3 animate-pulse" />
                              <span>Private Audition</span>
                            </span>
                            <button
                              onClick={() => stopSound(item.id)}
                              className="text-purple-300 hover:text-white font-bold cursor-pointer"
                            >
                              Stop
                            </button>
                          </div>
                        )}

                        {isBroadcasting && (
                          <div className="flex items-center justify-between text-[10px] font-bold text-accent-bright bg-accent-bright/15 border border-accent-bright/30 px-2 py-0.5 rounded-xl mb-2">
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-accent-bright animate-ping'}`} />
                              <span>{isPaused ? '⏸ Paused' : '📡 Broadcasting'}</span>
                            </span>
                            {localMonitorMuted && (
                              <span className="text-amber-400 text-[9px] bg-amber-400/10 px-1 rounded">
                                Muted for Me
                              </span>
                            )}
                          </div>
                        )}

                        {/* Sound Card Header: Name + Favorite Heart */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-accent-bright shrink-0">
                              <Music className="w-4 h-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <div className="flex flex-col gap-1">
                                  <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="w-full bg-[#101114] border border-accent-bright rounded px-2 py-0.5 text-xs text-white"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleSaveEdit(item.id)}
                                      className="px-2 py-0.5 rounded bg-accent-bright text-black text-[10px] font-bold cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingSoundId(null)}
                                      className="px-2 py-0.5 rounded bg-white/10 text-white text-[10px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <h4
                                    onDoubleClick={() => {
                                      setEditingSoundId(item.id);
                                      setEditingName(item.name);
                                      setEditingCategory(item.category);
                                    }}
                                    className="font-bold text-xs text-white truncate cursor-text"
                                    title="Double-click to rename"
                                  >
                                    {item.name}
                                  </h4>
                                  <div className="flex items-center gap-1 text-[10px] text-text-muted mt-0.5">
                                    <span>{item.category}</span>
                                    <span>•</span>
                                    <span>{formatTime(item.duration)}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Quick Favorite Toggle */}
                            <button
                              onClick={() => toggleFavorite(item.id)}
                              className="p-1 rounded-lg text-text-muted hover:text-rose-500 transition-colors cursor-pointer"
                              title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Heart className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                            </button>

                            {/* Delete Sound Button */}
                            <button
                              onClick={() => deleteSound(item.id)}
                              className="p-1 rounded-lg text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete sound from library"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Sound Card Controls Row */}
                        <div className="flex items-center justify-between gap-1 mt-2 pt-2 border-t border-white/5">
                          {/* Play / Pause / Stop buttons */}
                          <div className="flex items-center gap-1.5">
                            {isBroadcasting ? (
                              <>
                                <button
                                  onClick={() => togglePauseSound(item.id)}
                                  className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-300 text-black flex items-center justify-center transition-all cursor-pointer shadow-sm"
                                  title={isPaused ? 'Resume playback' : 'Pause playback'}
                                >
                                  {isPaused ? <Play className="w-3.5 h-3.5 fill-current ml-0.5" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                                </button>
                                <button
                                  onClick={() => stopSound(item.id)}
                                  className="w-7 h-7 rounded-lg bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
                                  title="Stop playback"
                                >
                                  <Square className="w-3 h-3 fill-current" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => playSound(item.id, false)}
                                className="px-2.5 py-1 rounded-lg bg-accent-bright hover:bg-white text-black font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                title="Play to voice channel"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Play</span>
                              </button>
                            )}

                            {/* Listen Locally (Headphones) */}
                            <button
                              onClick={() => playSound(item.id, true)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 text-text-muted hover:text-purple-400 transition-colors cursor-pointer"
                              title="Listen locally in your headphones only (Private audition)"
                            >
                              <Headphones className="w-3.5 h-3.5" />
                            </button>

                            {/* Add to Playlist button */}
                            <button
                              onClick={() => {
                                setPlaylistPopoverSoundId(playlistPopoverSoundId === item.id ? null : item.id);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-accent-bright/20 text-text-muted hover:text-accent-bright transition-colors cursor-pointer"
                              title="Add to a playlist"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Hotkey Badge */}
                          <button
                            onClick={() => setAssigningHotkeySoundId(item.id)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                              isAssigningKey
                                ? 'bg-amber-400 text-black border-amber-400 animate-pulse'
                                : item.hotkey
                                ? 'bg-white/5 border-white/10 text-accent-bright'
                                : 'bg-white/5 border-white/5 text-text-muted hover:text-white'
                            }`}
                            title="Click to assign hotkey (Esc to remove)"
                          >
                            {isAssigningKey ? 'Press key...' : formatHotkeyLabel(item.hotkey)}
                          </button>
                        </div>

                        {/* Add to Playlist Quick Popover */}
                        {playlistPopoverSoundId === item.id && (
                          <div className="absolute top-full left-0 right-0 z-30 mt-1 p-3 rounded-2xl bg-[#1c1d24] border border-accent-bright/30 shadow-2xl flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-white">Add to Playlist</span>
                              <button
                                onClick={() => setPlaylistPopoverSoundId(null)}
                                className="text-text-muted hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {playlists.map((pl) => {
                                const isAdded = pl.soundIds.includes(item.id);
                                return (
                                  <button
                                    key={pl.id}
                                    onClick={async () => {
                                      if (isAdded) {
                                        await removeSoundFromPlaylist(pl.id, item.id);
                                      } else {
                                        await addSoundToPlaylist(pl.id, item.id);
                                      }
                                    }}
                                    className={`w-full px-2 py-1 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                      isAdded
                                        ? 'bg-accent-bright/20 text-accent-bright border border-accent-bright/30'
                                        : 'bg-white/5 text-text-muted hover:text-white'
                                    }`}
                                  >
                                    <span className="truncate">{pl.name}</span>
                                    {isAdded && <Check className="w-3 h-3" />}
                                  </button>
                                );
                              })}

                              {playlists.length === 0 && (
                                <p className="text-[10px] text-text-muted">No playlists created yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 3: Playlists Manager */}
          {activeTab === 'playlists' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-white">Your Audio Playlists</h3>
                  <p className="text-xs text-text-muted">Create collections of songs and play them consecutively</p>
                </div>

                <button
                  onClick={() => setIsCreatingNewPlaylist(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs flex items-center gap-1.5 hover:bg-accent-bright/90 transition-all cursor-pointer shadow-md"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  Create Playlist
                </button>
              </div>

              {/* Inline Create Playlist Form */}
              {isCreatingNewPlaylist && (
                <form
                  onSubmit={handleCreatePlaylistSubmit}
                  className="p-3.5 bg-[#18191e] rounded-2xl border border-accent-bright/40 flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Enter playlist title (e.g. Chill Beats, Hype)..."
                    value={newPlaylistInput}
                    onChange={(e) => setNewPlaylistInput(e.target.value)}
                    autoFocus
                    className="flex-1 bg-[#101114] px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white placeholder:text-text-muted focus:outline-none focus:border-accent-bright"
                  />
                  <button
                    type="submit"
                    disabled={!newPlaylistInput.trim()}
                    className="px-3 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs hover:bg-accent-bright/90 disabled:opacity-40 cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNewPlaylist(false);
                      setNewPlaylistInput('');
                    }}
                    className="p-1.5 rounded-xl bg-white/5 text-text-muted hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Playlists Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {playlists.map((pl: Playlist) => {
                  const playlistSounds = pl.soundIds
                    .map((id) => sounds.find((s) => s.id === id))
                    .filter((s): s is SoundboardItem => !!s);
                  const totalSeconds = playlistSounds.reduce((acc, s) => acc + s.duration, 0);

                  return (
                    <div
                      key={pl.id}
                      className="p-4 rounded-2xl bg-[#15161b] border border-white/5 hover:border-white/10 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-accent-bright/15 border border-accent-bright/30 flex items-center justify-center text-accent-bright shrink-0">
                            <Disc3 className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-white truncate max-w-[180px]">{pl.name}</h4>
                            <p className="text-[11px] text-text-muted">
                              {pl.soundIds.length} track{pl.soundIds.length === 1 ? '' : 's'} • {formatTime(totalSeconds)}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => deletePlaylist(pl.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 transition-colors cursor-pointer"
                          title="Delete playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Tracks Preview */}
                      <div className="space-y-1 my-1">
                        {playlistSounds.slice(0, 3).map((s, idx) => (
                          <div key={s.id} className="text-[11px] text-text-muted truncate flex items-center gap-1.5">
                            <span className="w-3 text-text-muted font-mono">{idx + 1}.</span>
                            <span className="truncate">{s.name}</span>
                          </div>
                        ))}
                        {playlistSounds.length > 3 && (
                          <span className="text-[10px] text-text-muted pl-4">
                            + {playlistSounds.length - 3} more track{playlistSounds.length - 3 === 1 ? '' : 's'}
                          </span>
                        )}
                        {playlistSounds.length === 0 && (
                          <p className="text-[11px] text-text-muted italic">Playlist is currently empty.</p>
                        )}
                      </div>

                      {/* Play All Controls */}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => playPlaylist(pl.id, 0)}
                          disabled={pl.soundIds.length === 0}
                          className="flex-1 py-1.5 rounded-xl bg-accent-bright text-black font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-white disabled:opacity-40 transition-all cursor-pointer shadow-md"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Play Playlist</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {playlists.length === 0 && !isCreatingNewPlaylist && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center text-center text-text-muted">
                    <ListMusic className="w-12 h-12 stroke-[1.2] opacity-30 mb-2" />
                    <h4 className="text-sm font-semibold text-white">No Playlists Yet</h4>
                    <p className="text-xs text-text-muted mt-1 max-w-xs">
                      Group sounds into custom playlists to play them one after another in voice channels!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: Cloud Library (Cloudflare R2 Object Storage) */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              {/* Cloudflare R2 Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/40 via-[#161a23] to-[#121316] border border-sky-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-sky-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 shadow-inner">
                    <Cloud className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white tracking-wide">Cloudflare R2 Audio Vault</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          cloudStorageStatus?.r2Configured
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            cloudStorageStatus?.r2Configured ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                        />
                        {cloudStorageStatus?.r2Configured ? 'Active R2 Storage' : 'Local Storage Mode'}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {cloudStorageStatus?.r2Configured
                        ? `Bucket: ${cloudStorageStatus.bucket} • 10 GB Free Tier • Zero egress bandwidth fees`
                        : 'Server fallback storage active. To connect your Cloudflare R2 bucket, set R2_ACCOUNT_ID and credentials.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => {
                      loadCloudSounds();
                      loadCloudStorageStatus();
                    }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-white border border-white/5 transition-all cursor-pointer"
                    title="Refresh cloud audio tracks"
                  >
                    <RefreshCw className={`w-4 h-4 ${isCloudLoading ? 'animate-spin text-sky-400' : ''}`} />
                  </button>

                  <button
                    onClick={() => cloudFileInputRef.current?.click()}
                    disabled={isCloudUploading}
                    className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-sky-500/20 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isCloudUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                    <span>{isCloudUploading ? 'Uploading to R2...' : 'Upload Track'}</span>
                  </button>
                </div>
              </div>

              {/* Loading State */}
              {isCloudLoading && cloudSounds.length === 0 && (
                <div className="py-20 flex flex-col items-center justify-center text-center text-text-muted">
                  <Loader2 className="w-8 h-8 animate-spin text-sky-400 mb-2" />
                  <p className="text-xs font-semibold text-white">Fetching Cloud Tracks from Cloudflare R2...</p>
                </div>
              )}

              {/* Empty State */}
              {!isCloudLoading && filteredCloudSounds.length === 0 && (
                <div className="py-16 flex flex-col items-center justify-center text-center text-text-muted">
                  <div className="w-14 h-14 rounded-3xl bg-[#18191e] border border-white/5 flex items-center justify-center text-sky-400 mb-3 shadow-lg shadow-sky-950/20">
                    <Cloud className="w-7 h-7 opacity-60" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">
                    {searchQuery ? 'No Cloud Tracks Match Search' : 'Your Cloud Audio Vault is Empty'}
                  </h3>
                  <p className="text-xs text-text-muted max-w-sm mb-4">
                    {searchQuery
                      ? 'Try adjusting your search query.'
                      : 'Upload tracks (up to 40MB each) to Cloudflare R2. Audio stored in the cloud persists forever, streams at high speed, and is available for everyone in voice channels!'}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={() => cloudFileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-500/20 cursor-pointer transition-all"
                    >
                      <CloudUpload className="w-4 h-4" />
                      <span>Upload Your First Song</span>
                    </button>
                  )}
                </div>
              )}

              {/* Cloud Sounds Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredCloudSounds.map((item) => {
                  const activeSound = activeSounds.find((s) => s.soundId === item.id);
                  const isBroadcasting = !!activeSound;
                  const isPaused = isBroadcasting && activeSound.isPaused;
                  const isSavedLocally =
                    savedLocalMap[item.id] ||
                    sounds.some((s) => s.id === `snd_local_${item.id}` || s.name === item.name);

                  return (
                    <div
                      key={item.id}
                      className={`relative p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between group ${
                        isBroadcasting
                          ? 'bg-gradient-to-b from-[#181f29] to-[#121316] border-sky-400/50 shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1 ring-sky-400/30'
                          : 'bg-[#15161b] hover:bg-[#18191f] border-white/5 hover:border-white/10'
                      }`}
                    >
                      {/* Top Info Row */}
                      <div>
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-white/5 text-sky-400 border border-sky-400/20 truncate max-w-[110px]">
                            {item.category || 'Music'}
                          </span>
                          <span className="text-[10px] font-mono text-text-muted">
                            {formatTime(item.duration)} • {formatBytes(item.sizeBytes)}
                          </span>
                        </div>

                        <h4 className="font-bold text-xs text-white truncate max-w-[200px]" title={item.name}>
                          {item.name}
                        </h4>

                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-muted">
                          <Cloud className="w-3 h-3 text-sky-400 shrink-0" />
                          <span className="truncate">By {item.uploaderName || 'Anonymous'}</span>
                        </div>
                      </div>

                      {/* Controls Row */}
                      <div className="flex items-center justify-between gap-1 mt-3 pt-2.5 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          {isBroadcasting ? (
                            <>
                              <button
                                onClick={() => togglePauseSound(item.id)}
                                className="w-7 h-7 rounded-lg bg-amber-400 hover:bg-amber-300 text-black flex items-center justify-center transition-all cursor-pointer shadow-sm"
                                title={isPaused ? 'Resume playback' : 'Pause playback'}
                              >
                                {isPaused ? (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                ) : (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                )}
                              </button>
                              <button
                                onClick={() => stopSound(item.id)}
                                className="w-7 h-7 rounded-lg bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
                                title="Stop playback"
                              >
                                <Square className="w-3 h-3 fill-current" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => playCloudSound(item, false)}
                              className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                              title="Stream to voice channel"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Play</span>
                            </button>
                          )}

                          {/* Listen Locally (Headphones only) */}
                          <button
                            onClick={() => playCloudSound(item, true)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/20 text-text-muted hover:text-purple-400 transition-colors cursor-pointer"
                            title="Private preview in your headphones only"
                          >
                            <Headphones className="w-3.5 h-3.5" />
                          </button>

                          {/* Save to Local Library */}
                          <button
                            onClick={() => handleSaveToLocal(item)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isSavedLocally
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-white/5 hover:bg-white/10 text-text-muted hover:text-white'
                            }`}
                            title={isSavedLocally ? 'Saved to local library' : 'Download copy to local library'}
                          >
                            {isSavedLocally ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Delete from R2 */}
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${item.name}" from Cloudflare R2?`)) {
                              deleteFromCloud(item.id);
                            }
                          }}
                          className="p-1 rounded-lg text-text-muted hover:text-rose-400 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                          title="Delete from cloud"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: Audio Settings */}
          {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-6 py-4">
              {/* Channel Volume */}
              <div className="p-4 rounded-2xl bg-[#15161b] border border-white/5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Voice Channel Output Volume</h4>
                    <p className="text-[11px] text-text-muted">How loud music sounds to other participants in the room</p>
                  </div>
                  <span className="font-mono text-accent-bright font-bold text-xs">{masterVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(Number(e.target.value))}
                  className="w-full h-1.5 accent-accent-bright bg-[#101114] rounded cursor-pointer mt-2"
                />
              </div>

              {/* Headphone Monitor Volume & Mute */}
              <div className="p-4 rounded-2xl bg-[#15161b] border border-white/5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Your Headphone Monitor</h4>
                    <p className="text-[11px] text-text-muted">
                      Optionally mute or adjust volume for yourself while streaming music to others
                    </p>
                  </div>
                  <button
                    onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      localMonitorMuted
                        ? 'bg-amber-400/20 text-amber-400 border-amber-400/40'
                        : 'bg-white/5 text-text-muted hover:text-white border-white/10'
                    }`}
                  >
                    {localMonitorMuted ? 'Muted for Me (Active)' : 'Hear in My Headphones'}
                  </button>
                </div>

                {!localMonitorMuted && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localMonitorVolume}
                      onChange={(e) => setLocalMonitorVolume(Number(e.target.value))}
                      className="flex-1 h-1.5 accent-accent-bright bg-[#101114] rounded cursor-pointer"
                    />
                    <span className="font-mono text-accent-bright font-bold text-xs w-8">{localMonitorVolume}%</span>
                  </div>
                )}
              </div>

              {/* Allow While Mic Muted */}
              <div className="p-4 rounded-2xl bg-[#15161b] border border-white/5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Allow Playback While Mic Muted</h4>
                  <p className="text-[11px] text-text-muted">
                    Play music even when your microphone is muted (recommended for DJing)
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={allowWhileMuted}
                  onChange={(e) => setAllowWhileMuted(e.target.checked)}
                  className="w-4 h-4 accent-accent-bright rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
