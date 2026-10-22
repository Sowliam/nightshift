import React, { useState, useEffect } from 'react';
import {
  X,
  Monitor,
  AppWindow,
  Loader2,
  RefreshCw,
  Volume2,
  Sliders,
  Sparkles,
  Gamepad2,
  FileCode,
  Radio,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import {
  DesktopScreenSource,
  ScreenShareResolution,
  ScreenShareFramerate,
  ScreenShareContentPreset,
} from '@nightshift/shared';

interface ScreenShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({ isOpen, onClose }) => {
  const [sources, setSources] = useState<DesktopScreenSource[]>([]);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Quality & Stream Customization Settings (Discord-style)
  const [resolution, setResolution] = useState<ScreenShareResolution>('1080p');
  const [frameRate, setFrameRate] = useState<ScreenShareFramerate>(60);
  const [preset, setPreset] = useState<ScreenShareContentPreset>('motion');
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);

  const { startScreenShare } = useLiveKitStore();

  const loadSources = async () => {
    setIsLoading(true);
    try {
      if (window.nightshift?.isElectron) {
        const desktopSources = await window.nightshift.getScreenSources();
        setSources(desktopSources);
        if (desktopSources.length > 0 && !selectedSourceId) {
          const firstScreen = desktopSources.find((s) => !s.isWindow);
          setSelectedSourceId(firstScreen?.id || desktopSources[0].id);
        }
      } else {
        // In browser fallback mode
        setSources([
          {
            id: 'browser-display',
            name: 'Standard Display Capture',
            thumbnailUrl: '',
            isWindow: false,
          },
        ]);
        setSelectedSourceId('browser-display');
      }
    } catch (err) {
      console.error('Failed to enumerate screen sources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const screens = sources.filter((s) => !s.isWindow);
  const windows = sources.filter((s) => s.isWindow);
  const displayList = activeTab === 'screens' ? screens : windows;

  const handleShare = async () => {
    if (!selectedSourceId && window.nightshift?.isElectron) return;

    const success = await startScreenShare(
      selectedSourceId === 'browser-display' ? undefined : selectedSourceId || undefined,
      {
        resolution,
        frameRate,
        preset,
        includeAudio,
      }
    );
    if (success) {
      onClose();
    }
  };

  const handlePresetSelect = (chosenPreset: 'gaming' | 'reading') => {
    if (chosenPreset === 'gaming') {
      setResolution('1080p');
      setFrameRate(60);
      setPreset('motion');
      setIncludeAudio(true);
    } else {
      setResolution('1080p');
      setFrameRate(30);
      setPreset('detail');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[680px] max-w-full max-h-[92vh] bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-secondary/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary tracking-wide flex items-center gap-2">
                Screen Share Quality & Source
                <span className="text-[10px] font-bold text-accent bg-accent-subtle px-1.5 py-0.5 rounded uppercase">
                  HD PRO
                </span>
              </h3>
              <p className="text-xs text-text-secondary">
                Select your display or application and customize your streaming stream rate
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Source Selector */}
          <div>
            {!window.nightshift?.isElectron ? (
              <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle flex items-center gap-3.5 mb-1">
                <div className="w-10 h-10 rounded-lg bg-highlight/15 text-highlight flex items-center justify-center shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="flex flex-col text-xs">
                  <span className="font-bold text-text-primary">Browser Screen Share</span>
                  <span className="text-text-muted leading-relaxed">
                    Clicking "Start Sharing" will prompt your browser to let you choose an Entire Screen, Window, or Tab.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Select Source
                  </span>
                  <button
                    onClick={loadSources}
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent px-2 py-1 rounded-lg hover:bg-bg-elevated transition-colors"
                    title="Refresh Sources"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="flex items-center gap-2 p-1 bg-bg-elevated rounded-xl border border-border-subtle text-xs mb-3">
                  <button
                    onClick={() => setActiveTab('screens')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all ${
                      activeTab === 'screens'
                        ? 'bg-accent text-bg-main shadow-sm font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    Screens ({screens.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('windows')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-medium transition-all ${
                      activeTab === 'windows'
                        ? 'bg-accent text-bg-main shadow-sm font-semibold'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <AppWindow className="w-4 h-4" />
                    Applications ({windows.length})
                  </button>
                </div>

                {/* Source Thumbnails Grid */}
                <div className="max-h-[220px] overflow-y-auto pr-1">
                  {isLoading ? (
                    <div className="h-32 flex flex-col items-center justify-center text-text-secondary">
                      <Loader2 className="w-6 h-6 animate-spin text-accent mb-2" />
                      <span className="text-xs">Scanning available windows & displays...</span>
                    </div>
                  ) : displayList.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {displayList.map((source) => {
                        const isSelected = selectedSourceId === source.id;
                        return (
                          <div
                            key={source.id}
                            onClick={() => setSelectedSourceId(source.id)}
                            className={`group relative rounded-xl border p-2 cursor-pointer transition-all flex flex-col gap-2 ${
                              isSelected
                                ? 'bg-bg-elevated border-accent shadow-speaking'
                                : 'bg-bg-elevated/40 border-border-subtle hover:border-text-secondary hover:bg-bg-elevated'
                            }`}
                          >
                            {/* Thumbnail */}
                            <div className="w-full h-24 rounded-lg bg-black/60 overflow-hidden flex items-center justify-center border border-border-subtle/50 relative">
                              {source.thumbnailUrl ? (
                                <img
                                  src={source.thumbnailUrl}
                                  alt={source.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Monitor className="w-7 h-7 text-text-muted" />
                              )}

                              {isSelected && (
                                <div className="absolute inset-0 bg-highlight/15 border-2 border-highlight rounded-lg flex items-top justify-end p-1.5">
                                  <span className="w-2 h-2 rounded-full bg-online animate-ping" />
                                </div>
                              )}
                            </div>

                            {/* Source Name */}
                            <div className="flex items-center justify-between px-1">
                              <span className="text-xs font-medium text-text-primary truncate">
                                {source.name}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-28 flex flex-col items-center justify-center text-center p-4 bg-bg-elevated/30 rounded-xl border border-border-subtle">
                      <AppWindow className="w-6 h-6 text-text-muted mb-1" />
                      <span className="text-xs font-medium text-text-secondary">
                        No {activeTab} detected
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Discord-Style Stream Quality & Performance Section */}
          <div className="p-4 rounded-xl bg-bg-elevated/40 border border-border-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-accent" />
                <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Stream Quality Settings
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePresetSelect('gaming')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                    frameRate === 60 && preset === 'motion'
                      ? 'bg-accent text-bg-main border-accent font-bold'
                      : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Gamepad2 className="w-3.5 h-3.5" />
                  Gaming (60 FPS)
                </button>
                <button
                  type="button"
                  onClick={() => handlePresetSelect('reading')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                    frameRate === 30 && preset === 'detail'
                      ? 'bg-accent text-bg-main border-accent font-bold'
                      : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  Sharp Text (30 FPS)
                </button>
              </div>
            </div>

            {/* Resolution Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">Stream Resolution</span>
                <span className="text-[11px] font-mono text-accent">
                  {resolution === 'source' ? 'Native Original' : resolution}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(['720p', '1080p', '1440p', 'source'] as ScreenShareResolution[]).map((res) => {
                  const isActive = resolution === res;
                  return (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setResolution(res)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                        isActive
                          ? 'bg-accent text-bg-main border-accent font-bold shadow-sm'
                          : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-secondary'
                      }`}
                    >
                      {res === 'source' ? 'Source (4K)' : res.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Frame Rate Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-secondary">Frame Rate (FPS)</span>
                <span className="text-[11px] font-mono text-accent">{frameRate} FPS</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([15, 30, 60] as ScreenShareFramerate[]).map((fps) => {
                  const isActive = frameRate === fps;
                  return (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => setFrameRate(fps)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                        isActive
                          ? 'bg-accent text-bg-main border-accent font-bold shadow-sm'
                          : 'bg-bg-elevated border-border-subtle text-text-secondary hover:text-text-primary hover:border-text-secondary'
                      }`}
                    >
                      {fps} FPS {fps === 60 && '⚡'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audio Toggle Checkbox */}
            <label className="flex items-center justify-between p-2.5 rounded-lg bg-bg-elevated/60 border border-border-subtle cursor-pointer hover:border-text-secondary transition-colors">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-accent" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-text-primary">
                    Share System & Application Audio
                  </span>
                  <span className="text-[11px] text-text-muted">
                    Broadcast game sounds, videos, or music alongside the video stream
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={(e) => setIncludeAudio(e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle text-accent focus:ring-accent bg-bg-main cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border-subtle bg-bg-secondary flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Radio className="w-3.5 h-3.5 text-accent animate-pulse" />
            <span>High-fidelity WebRTC streaming powered by LiveKit Cloud</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover text-xs font-medium text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedSourceId && sources.length > 0 && !!window.nightshift?.isElectron}
              className="px-6 py-2 rounded-xl bg-highlight hover:bg-white text-highlight-text disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-2 transition-all shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Go Live ({resolution.toUpperCase()} @ {frameRate}FPS)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
