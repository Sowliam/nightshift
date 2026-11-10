import React, { useState, useEffect } from 'react';
import {
  X,
  Monitor,
  AppWindow,
  Loader2,
  Settings,
  Check,
  RefreshCw,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useServerStore } from '../../stores/server.store';
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
  const [activeTab, setActiveTab] = useState<'applications' | 'screens'>('applications');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Quality & Stream Customization Settings
  const [streamMode, setStreamMode] = useState<'gaming' | 'screenshare' | 'custom'>('custom');
  const [resolution, setResolution] = useState<ScreenShareResolution>('720p');
  const [frameRate, setFrameRate] = useState<ScreenShareFramerate>(30);
  const [preset, setPreset] = useState<ScreenShareContentPreset>('motion');
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);

  // Settings Gear Popover State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const { startScreenShare } = useLiveKitStore();

  const isElectron = !!window.nightshift?.isElectron;

  const loadSources = async () => {
    setIsLoading(true);
    setShareError(null);
    try {
      if (isElectron && window.nightshift?.getScreenSources) {
        const desktopSources = await window.nightshift.getScreenSources();
        const winSources = desktopSources.filter((s) => s.isWindow);
        const scrSources = desktopSources.filter((s) => !s.isWindow);

        if (desktopSources.length > 0) {
          setSources(desktopSources);

          if (activeTab === 'applications') {
            if (winSources.length > 0) {
              setSelectedSourceId((prev) =>
                prev && winSources.some((w) => w.id === prev) ? prev : winSources[0].id
              );
            } else if (scrSources.length > 0) {
              // If no open windows were detected, switch to screens tab
              setActiveTab('screens');
              setSelectedSourceId(scrSources[0].id);
            }
          } else if (activeTab === 'screens') {
            if (scrSources.length > 0) {
              setSelectedSourceId((prev) =>
                prev && scrSources.some((s) => s.id === prev) ? prev : scrSources[0].id
              );
            }
          }
        } else {
          // If desktop capturer returned empty in Electron, provide selectable fallbacks
          const fallbackSources: DesktopScreenSource[] = [
            {
              id: 'browser-display',
              name: 'Entire screen',
              thumbnailUrl: '',
              isWindow: false,
            },
            {
              id: 'browser-window',
              name: 'Application window',
              thumbnailUrl: '',
              isWindow: true,
            },
          ];
          setSources(fallbackSources);
          setSelectedSourceId(activeTab === 'applications' ? 'browser-window' : 'browser-display');
        }
      } else {
        // Browser / Web mode: provide interactive, selectable cards for both tabs
        const browserSources: DesktopScreenSource[] = [
          {
            id: 'browser-display',
            name: 'Entire screen',
            thumbnailUrl: '',
            isWindow: false,
          },
          {
            id: 'browser-window',
            name: 'Application window',
            thumbnailUrl: '',
            isWindow: true,
          },
          {
            id: 'browser-tab',
            name: 'Browser tab',
            thumbnailUrl: '',
            isWindow: true,
          },
        ];
        setSources(browserSources);
        setSelectedSourceId(activeTab === 'applications' ? 'browser-window' : 'browser-display');
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
      setIsSettingsOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const windows = sources.filter((s) => s.isWindow);
  const screens = sources.filter((s) => !s.isWindow);

  const handleTabChange = (tab: 'applications' | 'screens') => {
    setActiveTab(tab);
    if (tab === 'applications') {
      const firstWin = windows[0];
      if (firstWin) {
        setSelectedSourceId(firstWin.id);
      } else {
        setSelectedSourceId('browser-window');
      }
    } else if (tab === 'screens') {
      const firstScr = screens[0];
      if (firstScr) {
        setSelectedSourceId(firstScr.id);
      } else {
        setSelectedSourceId('browser-display');
      }
    }
  };

  let displayList: DesktopScreenSource[] = [];
  if (activeTab === 'applications') {
    displayList = windows.length > 0
      ? windows
      : [
          {
            id: 'browser-window',
            name: 'Application window',
            thumbnailUrl: '',
            isWindow: true,
          },
        ];
  } else if (activeTab === 'screens') {
    displayList = screens.length > 0
      ? screens
      : [
          {
            id: 'browser-display',
            name: 'Entire screen',
            thumbnailUrl: '',
            isWindow: false,
          },
        ];
  }

  const handleShare = async () => {
    const targetSourceId = selectedSourceId;
    if (!targetSourceId || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setShareError(null);

      const isBrowserTarget =
        targetSourceId.startsWith('browser-') || !isElectron;

      const success = await startScreenShare(
        isBrowserTarget ? targetSourceId : targetSourceId,
        {
          resolution,
          frameRate,
          preset,
          includeAudio,
        }
      );

      if (success) {
        // Automatically focus active voice channel so user immediately sees their live stream
        const { activeVoiceChannelId, selectChannel } = useServerStore.getState();
        if (activeVoiceChannelId) {
          selectChannel(activeVoiceChannelId);
        }
        onClose();
      } else {
        const lastErr = useLiveKitStore.getState().error;
        if (lastErr) setShareError(lastErr);
        else if (!useLiveKitStore.getState().room) setShareError('Join a voice channel first.');
      }
    } catch (err: any) {
      console.error('Error starting screen share in modal:', err);
      setShareError(err.message || 'خطا در برقراری استریم لایو');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick SD / HD Buttons
  const handleSelectSD = () => {
    setResolution('720p');
    setFrameRate(30);
    setPreset('motion');
    setStreamMode('custom');
  };

  const handleSelectHD = () => {
    setResolution('1080p');
    setFrameRate(60);
    setPreset('motion');
    setStreamMode('custom');
  };

  // Stream Mode Radios
  const handleSelectMode = (mode: 'gaming' | 'screenshare' | 'custom') => {
    setStreamMode(mode);
    if (mode === 'gaming') {
      setResolution('1080p');
      setFrameRate(60);
      setPreset('motion');
    } else if (mode === 'screenshare') {
      setResolution('source');
      setFrameRate(15);
      setPreset('detail');
    }
  };

  const isSDActive = resolution === '720p' && frameRate === 30;
  const isHDActive = resolution === '1080p' && frameRate === 60;

  const modeTitle =
    streamMode === 'gaming' ? 'Gaming' : streamMode === 'screenshare' ? 'Screenshare' : 'Custom';
  const modeSubtitle = `${resolution} · ${frameRate}fps`;

  const tabClass = (on: boolean) =>
    `flex items-center gap-2 pb-2.5 text-sm font-semibold border-b-2 ${
      on ? 'text-text-primary border-highlight' : 'text-text-muted border-transparent hover:text-text-secondary'
    }`;
  const choiceClass = (on: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-bold ${
      on ? 'bg-highlight text-highlight-text' : 'bg-bg-main text-text-muted hover:text-text-primary'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 select-none">
      <div className="w-[640px] max-w-full max-h-[92vh] bg-bg-secondary text-text-primary rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden relative">
        <div className="px-5 pt-4 pb-0 flex items-end justify-between shrink-0 border-b border-border">
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => handleTabChange('applications')} className={tabClass(activeTab === 'applications')}>
              <AppWindow className="w-4 h-4" />
              <span>Applications</span>
              {windows.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted">{windows.length}</span>
              )}
            </button>
            <button type="button" onClick={() => handleTabChange('screens')} className={tabClass(activeTab === 'screens')}>
              <Monitor className="w-4 h-4" />
              <span>Entire screen</span>
              {screens.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted">{screens.length}</span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1 pb-2">
            <button
              type="button"
              onClick={loadSources}
              disabled={isLoading}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-hover"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Container (Thumbnails 2-column Grid) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-bg-main">
          {isSettingsOpen && (
            <div className="mb-3 rounded-xl border border-border bg-bg-elevated p-3">
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                <button type="button" onClick={() => handleSelectMode('gaming')} className={choiceClass(streamMode === 'gaming')}>Gaming</button>
                <button type="button" onClick={() => handleSelectMode('screenshare')} className={choiceClass(streamMode === 'screenshare')}>Screenshare</button>
                <button type="button" onClick={() => handleSelectMode('custom')} className={choiceClass(streamMode === 'custom')}>Custom</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {(['720p', '1080p', '1440p', 'source'] as ScreenShareResolution[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => {
                      setResolution(res);
                      setStreamMode('custom');
                    }}
                    className={choiceClass(resolution === res)}
                  >
                    {res === 'source' ? 'Source' : res}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {([15, 30, 60] as ScreenShareFramerate[]).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => {
                        setFrameRate(fps);
                        setStreamMode('custom');
                      }}
                      className={choiceClass(frameRate === fps)}
                    >
                      {fps} fps
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeAudio}
                    onChange={(e) => setIncludeAudio(e.target.checked)}
                    className="accent-highlight"
                  />
                  Share audio
                </label>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="h-40 flex flex-col items-center justify-center text-text-muted">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs">Looking for windows...</span>
            </div>
          ) : displayList.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {displayList.map((source) => {
                const isSelected = selectedSourceId === source.id;
                const SourceIcon = source.id === 'browser-tab' ? Globe : source.isWindow ? AppWindow : Monitor;
                return (
                  <button
                    type="button"
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`rounded-xl p-2 text-left flex flex-col gap-2 border ${
                      isSelected
                        ? 'bg-bg-elevated border-highlight'
                        : 'bg-bg-elevated/60 border-border hover:border-border-strong'
                    }`}
                  >
                    <div className="w-full h-24 rounded-lg bg-bg-main overflow-hidden flex items-center justify-center border border-border-subtle relative">
                      {source.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <SourceIcon className="w-7 h-7 text-text-muted" />
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-highlight text-highlight-text flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-1 min-w-0">
                      {source.appIconUrl ? (
                        <img src={source.appIconUrl} alt="" className="w-4 h-4 rounded shrink-0 object-contain" />
                      ) : (
                        <SourceIcon className="w-4 h-4 text-text-muted shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-text-primary truncate" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="h-40 flex flex-col items-center justify-center text-center rounded-xl border border-border bg-bg-elevated">
              <AppWindow className="w-7 h-7 text-text-muted mb-2" />
              <span className="text-sm font-semibold text-text-primary">Nothing to share</span>
              <button
                type="button"
                onClick={loadSources}
                className="mt-3 px-3 py-1.5 rounded-xl bg-bg-hover text-xs font-semibold text-text-primary"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-bg-secondary border-t border-border flex items-center justify-between gap-3 shrink-0 relative">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-primary">{modeTitle}</div>
              <div className="text-[11px] text-text-muted">{modeSubtitle}</div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSelectSD}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  isSDActive ? 'bg-highlight text-highlight-text' : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                }`}
                title="720p, 30fps"
              >
                SD
              </button>
              <button
                type="button"
                onClick={handleSelectHD}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                  isHDActive ? 'bg-highlight text-highlight-text' : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                }`}
                title="1080p, 60fps"
              >
                HD
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen((open) => !open)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isSettingsOpen ? 'bg-highlight text-highlight-text' : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                }`}
                title="Stream settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-bg-hover disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleShare}
              disabled={!selectedSourceId || isLoading || isSubmitting}
              className="px-4 py-2 rounded-xl bg-highlight text-highlight-text disabled:opacity-40 text-xs font-bold flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>{isSubmitting ? 'Starting...' : 'Go Live'}</span>
            </button>
          </div>
        </div>

        {shareError && (
          <div className="mx-6 mb-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{shareError}</div>
          </div>
        )}

      </div>
    </div>
  );
};
