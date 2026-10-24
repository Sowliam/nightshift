import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
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
} from 'lucide-react';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { ConnectionState } from 'livekit-client';

export const SoundboardModal: React.FC = () => {
  const {
    sounds,
    activePlayingIds,
    activeSounds,
    masterVolume,
    localMonitorVolume,
    localMonitorMuted,
    allowWhileMuted,
    selectedCategory,
    searchQuery,
    isSoundboardOpen,
    isLoading,
    error,
    loadSounds,
    importSound,
    playSound,
    stopSound,
    stopAll,
    togglePauseSound,
    updateSound,
    deleteSound,
    setMasterVolume,
    setLocalMonitorVolume,
    setLocalMonitorMuted,
    setAllowWhileMuted,
    setSelectedCategory,
    setSearchQuery,
    setSoundboardOpen,
  } = useSoundboardStore();

  const { connectionState, isMuted } = useLiveKitStore();
  const isConnected = connectionState === ConnectionState.Connected;

  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [assigningHotkeySoundId, setAssigningHotkeySoundId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSoundboardOpen && sounds.length === 0) {
      loadSounds();
    }
  }, [isSoundboardOpen]);

  // Listener for assigning hotkey to a sound
  useEffect(() => {
    if (!assigningHotkeySoundId) return;

    const handleKeyAssign = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        // Clear hotkey
        updateSound(assigningHotkeySoundId, { hotkey: null });
        setAssigningHotkeySoundId(null);
        return;
      }

      // Check conflict
      const conflict = sounds.find(
        (s) => s.id !== assigningHotkeySoundId && s.hotkey?.toLowerCase() === e.code.toLowerCase()
      );
      if (conflict) {
        // Remove from conflicting sound
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

  // Extract unique categories
  const categories = ['All', ...Array.from(new Set(sounds.map((s) => s.category || 'General')))];

  // Filter sounds
  const filteredSounds = sounds.filter((s) => {
    const matchesCat = selectedCategory === 'All' || (s.category || 'General') === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.hotkey && s.hotkey.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await importSound(file, undefined, selectedCategory === 'All' ? 'General' : selectedCategory);
  };

  const formatDuration = (secs: number) => {
    if (!secs || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatHotkeyLabel = (code: string | null) => {
    if (!code) return 'No Key';
    return code
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Numpad', 'Num ')
      .toUpperCase();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-150"
      onClick={() => setSoundboardOpen(false)}
    >
      <div
        className="w-full max-w-3xl bg-[#121316] border border-[#2b2d31] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="audio/mp3, audio/wav, audio/ogg, audio/mpeg, audio/webm, audio/flac, audio/x-m4a, .mp3, .wav, .ogg, .m4a"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#232428] flex items-center justify-between shrink-0 bg-[#0e0f11]/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent-bright/15 text-accent-bright rounded-2xl border border-accent-bright/25 shadow-sm">
              <Volume2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-black text-[#f2f3f5] tracking-tight">Soundboard</h2>
                {isConnected ? (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#52B788]/15 text-[#52B788] border border-[#52B788]/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#52B788] animate-ping" />
                    LiveKit Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#232428] text-text-muted border border-[#313338]">
                    <Headphones className="w-3 h-3" />
                    Local Preview Only
                  </span>
                )}
                {isConnected && isMuted && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      allowWhileMuted
                        ? 'bg-amber-400/15 text-amber-400 border-amber-400/25'
                        : 'bg-destructive/15 text-destructive border-destructive/25'
                    }`}
                  >
                    {allowWhileMuted ? 'Muted (Transmitting Allowed)' : 'Muted (Playback Silenced)'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted mt-0.5">
                Play sound effects to your voice room or test locally. Press assigned keys anytime.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stop All Emergency Button */}
            {activePlayingIds.length > 0 && (
              <button
                onClick={stopAll}
                className="px-3 py-1.5 rounded-xl bg-destructive hover:bg-destructive/90 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-md cursor-pointer animate-pulse"
                title="Stop all active playing sounds immediately"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop All ({activePlayingIds.length})</span>
              </button>
            )}

            {/* Soundboard Audio Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl transition-all border cursor-pointer ${
                showSettings
                  ? 'bg-accent-bright text-black border-accent-bright font-bold'
                  : 'bg-[#18191c] hover:bg-[#232428] text-text-muted hover:text-white border-[#2b2d31]'
              }`}
              title="Soundboard Volumes & Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              onClick={() => setSoundboardOpen(false)}
              className="p-2 text-[#949ba4] hover:text-white hover:bg-[#232428] rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Audio Volume Settings Drawer (Collapsible) */}
        {showSettings && (
          <div className="px-6 py-3.5 border-b border-[#232428] bg-[#16171a] flex flex-wrap items-center justify-between gap-4 text-xs animate-in slide-in-from-top-2 duration-150">
            {/* Master Volume */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                Voice Room Volume:
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                onChange={(e) => setMasterVolume(Number(e.target.value))}
                className="w-28 accent-accent-bright h-1.5 bg-[#232428] rounded-lg cursor-pointer"
              />
              <span className="font-mono text-text-primary font-bold w-9">{masterVolume}%</span>
            </div>

            {/* Local Headphones Volume & Self-Monitor Mute (شنیدن فقط توسط بقیه) */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLocalMonitorMuted(!localMonitorMuted)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  localMonitorMuted
                    ? 'bg-amber-400/20 text-amber-400 border-amber-400/40 shadow-sm'
                    : 'bg-[#232428] hover:bg-[#2b2d31] text-text-primary hover:text-white border-[#313338]'
                }`}
                title={
                  localMonitorMuted
                    ? 'Click to unmute soundboard in your headphones'
                    : 'Click to mute soundboard in your headphones (Music continues streaming to everyone else in channel)'
                }
              >
                {localMonitorMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                    <span>Muted for Me (Channel Hears)</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-accent-bright" />
                    <span>Hear in My Headphones</span>
                  </>
                )}
              </button>

              {!localMonitorMuted && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localMonitorVolume}
                    onChange={(e) => setLocalMonitorVolume(Number(e.target.value))}
                    className="w-24 accent-accent-bright h-1.5 bg-[#232428] rounded-lg cursor-pointer"
                  />
                  <span className="font-mono text-text-primary font-bold w-8">{localMonitorVolume}%</span>
                </div>
              )}
            </div>

            {/* Allow Playback While Mic is Muted */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowWhileMuted}
                onChange={(e) => setAllowWhileMuted(e.target.checked)}
                className="rounded bg-[#232428] border-border-subtle text-accent-bright focus:ring-0 cursor-pointer"
              />
              <span className="text-[11px] font-medium text-text-primary">
                Allow soundboard while microphone is muted
              </span>
            </label>
          </div>
        )}

        {/* Action Controls & Search Bar */}
        <div className="px-6 py-3 border-b border-[#232428] bg-[#121316] flex items-center justify-between gap-3 shrink-0">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-[#5f6368] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search sounds or hotkeys..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#18191c] border border-[#2b2d31] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#f2f3f5] placeholder-[#5f6368] focus:outline-none focus:border-accent-bright transition-all"
            />
          </div>

          {/* Add Sound Button */}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 bg-accent-bright hover:bg-white text-black font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
            title="Import an audio file (MP3, WAV, OGG, M4A)"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-[2.5]" />}
            <span>Add Sound</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="px-6 py-2 border-b border-[#232428] bg-[#0e0f11]/60 flex items-center gap-1.5 overflow-x-auto shrink-0 custom-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-accent-bright text-black shadow-sm font-bold'
                  : 'bg-[#18191c] hover:bg-[#232428] text-text-muted hover:text-white border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mx-6 mt-3 px-4 py-2 rounded-xl bg-destructive/90 text-white text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Soundboard Grid Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-[300px]">
          {filteredSounds.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 select-none">
              <div className="w-16 h-16 rounded-3xl bg-[#18191c] border border-[#2b2d31] flex items-center justify-center text-accent-bright mb-3 shadow-lg">
                <VolumeX className="w-8 h-8 opacity-60" />
              </div>
              <h3 className="text-sm font-bold text-text-primary mb-1">No Sounds Found</h3>
              <p className="text-xs text-text-muted max-w-sm mb-4 leading-relaxed">
                {searchQuery
                  ? 'No sounds match your search query.'
                  : 'Your soundboard library is empty. Click "Add Sound" to import audio files from your computer (MP3, WAV, OGG).'}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-[#232428] hover:bg-accent-bright hover:text-black text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Import Local Audio File</span>
              </button>
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
                        ? 'bg-[#1e172e] border-purple-500/80 shadow-[0_0_20px_rgba(168,85,247,0.25)]'
                        : isBroadcasting
                        ? 'bg-accent-bright/10 border-accent-bright shadow-[0_0_15px_rgba(82,183,136,0.2)]'
                        : 'bg-[#18191c] hover:bg-[#1f2024] border-[#2b2d31] hover:border-[#35373c]'
                    }`}
                  >
                    {/* Private Preview Banner */}
                    {isLocalOnly && (
                      <div className="flex items-center justify-between text-[10px] font-bold text-purple-400 bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-xl mb-2.5">
                        <span className="flex items-center gap-1.5">
                          <Headphones className="w-3.5 h-3.5 animate-pulse" />
                          <span>فقط شما می‌شنوید (Private Preview)</span>
                        </span>
                        <button
                          onClick={() => stopSound(item.id)}
                          className="px-2 py-0.5 rounded bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-bold cursor-pointer transition-all"
                        >
                          توقف تست
                        </button>
                      </div>
                    )}

                    {/* Broadcasting Banner */}
                    {isBroadcasting && (
                      <div className="flex items-center justify-between text-[10px] font-bold text-accent-bright bg-accent-bright/15 border border-accent-bright/30 px-2.5 py-1 rounded-xl mb-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-accent-bright animate-ping'}`} />
                          <span>{isPaused ? '⏸ متوقف موقت (Paused)' : '📡 در حال پخش در چنل'}</span>
                        </span>
                        {localMonitorMuted && (
                          <span className="text-amber-400 text-[10px] font-semibold bg-amber-400/10 px-1.5 py-0.5 rounded">
                            بی‌صدا در هدفون شما
                          </span>
                        )}
                      </div>
                    )}

                    {/* Top Row: Play/Pause/Stop Buttons + Sound Name + Delete */}
                    <div className="flex items-start gap-2.5 mb-2.5">
                      {/* Playback Action Buttons */}
                      {isBroadcasting ? (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Pause / Resume button */}
                          <button
                            onClick={() => togglePauseSound(item.id)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-400 hover:bg-amber-300 text-black transition-all active:scale-95 cursor-pointer shadow-md font-bold"
                            title={isPaused ? 'ادامه پخش (یا زدن دکمه هات‌کی)' : 'توقف موقت (یا یک بار زدن هات‌کی)'}
                          >
                            {isPaused ? (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            ) : (
                              <Pause className="w-4 h-4 fill-current" />
                            )}
                          </button>
                          {/* Stop button */}
                          <button
                            onClick={() => stopSound(item.id)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-destructive hover:bg-destructive/90 text-white transition-all active:scale-95 cursor-pointer shadow-md animate-pulse"
                            title="قطع کامل پخش (یا دوبار زدن سریع هات‌کی)"
                          >
                            <Square className="w-3.5 h-3.5 fill-current" />
                          </button>
                        </div>
                      ) : isLocalOnly ? (
                        <button
                          onClick={() => stopSound(item.id)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-purple-600 hover:bg-purple-500 text-white transition-all active:scale-95 cursor-pointer shadow-md animate-pulse"
                          title="توقف تست خصوصی"
                        >
                          <Square className="w-4 h-4 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={() => playSound(item.id, false)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent-bright hover:bg-white text-black hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer shadow-md"
                          title="پخش در چنل صوتی و هدفون"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      )}

                      {/* Title & Category Info */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="w-full bg-[#111214] border border-accent-bright rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                              autoFocus
                            />
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                placeholder="Category"
                                value={editingCategory}
                                onChange={(e) => setEditingCategory(e.target.value)}
                                className="flex-1 bg-[#111214] border border-[#2b2d31] rounded px-1.5 py-0.5 text-[10px] text-text-muted focus:outline-none"
                              />
                              <button
                                onClick={() => {
                                  if (editingName.trim()) {
                                    updateSound(item.id, {
                                      name: editingName.trim(),
                                      category: editingCategory.trim() || 'General',
                                    });
                                  }
                                  setEditingSoundId(null);
                                }}
                                className="p-1 bg-accent-bright text-black rounded text-[10px] font-bold"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h4
                              className="text-xs font-bold text-[#f2f3f5] truncate cursor-pointer hover:text-accent-bright transition-colors"
                              title="Click to rename"
                              onClick={() => {
                                setEditingSoundId(item.id);
                                setEditingName(item.name);
                                setEditingCategory(item.category || 'General');
                              }}
                            >
                              {item.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-mono text-text-muted">
                                {formatDuration(item.duration)}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#232428] text-text-muted font-medium truncate max-w-[80px]">
                                {item.category || 'General'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Delete Button (visible on hover) */}
                      {!isEditing && (
                        <button
                          onClick={() => deleteSound(item.id)}
                          className="p-1 text-[#5f6368] hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
                          title="Delete sound"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Bottom Controls Row: Hotkey Badge + Per-Sound Volume + Local Preview */}
                    <div className="pt-2 border-t border-[#232428] flex items-center justify-between gap-2 mt-1">
                      {/* Hotkey Badge */}
                      <button
                        onClick={() => setAssigningHotkeySoundId(isAssigningKey ? null : item.id)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                          isAssigningKey
                            ? 'bg-amber-400 text-black border-amber-400 animate-pulse'
                            : item.hotkey
                            ? 'bg-[#232428] hover:bg-[#2b2d31] text-accent-bright border-[#313338]'
                            : 'bg-transparent hover:bg-[#232428] text-[#5f6368] hover:text-text-muted border-dashed border-[#313338]'
                        }`}
                        title={
                          isAssigningKey
                            ? 'Press any key on keyboard (or Escape to clear)'
                            : item.hotkey
                            ? `Hotkey: ${item.hotkey}. 1 Tap: Pause/Resume. 2 Taps (<380ms): Stop.`
                            : 'کلیک کنید برای تنظیم دکمه کیبورد'
                        }
                      >
                        {isAssigningKey ? 'Press Key...' : formatHotkeyLabel(item.hotkey)}
                      </button>

                      {/* Right Sub-actions: Per-Sound Volume slider + Local Preview Button */}
                      <div className="flex items-center gap-1.5">
                        {/* Per-sound volume */}
                        <div className="flex items-center gap-1" title={`Sound Volume: ${item.volume}%`}>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={item.volume}
                            onChange={(e) => updateSound(item.id, { volume: Number(e.target.value) })}
                            className="w-14 accent-accent-bright h-1 bg-[#232428] rounded cursor-pointer"
                          />
                        </div>

                        {/* Local Preview Only (Headphone Icon) */}
                        {isLocalOnly ? (
                          <button
                            onClick={() => stopSound(item.id)}
                            className="px-2 py-1 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-md cursor-pointer animate-pulse"
                            title="توقف تست خصوصی (فقط شما می‌شنوید)"
                          >
                            <Headphones className="w-3 h-3" />
                            <span>تست خصوصی</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => playSound(item.id, true)}
                            className="p-1 rounded-lg hover:bg-purple-500/20 text-[#949ba4] hover:text-purple-400 transition-colors cursor-pointer"
                            title="Listen Locally (تست خصوصی در هدفون خودتان بدون شنیدن دیگران)"
                          >
                            <Headphones className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-6 py-2.5 border-t border-[#232428] bg-[#0e0f11] flex items-center justify-between text-[11px] text-[#5f6368] shrink-0 font-mono">
          <span>{sounds.length} sound(s) loaded</span>
          <span>Shortcut: Ctrl+Shift+S</span>
        </div>
      </div>
    </div>
  );
};
