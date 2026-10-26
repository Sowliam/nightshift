import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Monitor,
  AppWindow,
  Loader2,
  Settings,
  ChevronRight,
  Check,
  Video,
  RefreshCw,
  Globe,
  Sparkles,
  Info,
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
  const [activeTab, setActiveTab] = useState<'applications' | 'screens' | 'devices'>('applications');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Quality & Stream Customization Settings
  const [streamMode, setStreamMode] = useState<'gaming' | 'screenshare' | 'custom'>('custom');
  const [resolution, setResolution] = useState<ScreenShareResolution>('720p');
  const [frameRate, setFrameRate] = useState<ScreenShareFramerate>(30);
  const [preset, setPreset] = useState<ScreenShareContentPreset>('motion');
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);

  // Settings Gear Popover State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<'none' | 'resolution' | 'framerate'>('none');

  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const { startScreenShare } = useLiveKitStore();

  const isElectron = !!window.nightshift?.isElectron;

  const loadSources = async () => {
    setIsLoading(true);
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
              name: 'Entire Screen (Primary Monitor)',
              thumbnailUrl: '',
              isWindow: false,
            },
            {
              id: 'browser-window',
              name: 'Application Window (Direct Picker)',
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
            name: 'Entire Screen (Primary Display)',
            thumbnailUrl: '',
            isWindow: false,
          },
          {
            id: 'browser-window',
            name: 'Application Window (Games, IDE, Apps)',
            thumbnailUrl: '',
            isWindow: true,
          },
          {
            id: 'browser-tab',
            name: 'Browser Tab (with Audio)',
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
      setOpenSubmenu('none');
    }
  }, [isOpen]);

  // Click outside to close settings popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
        setOpenSubmenu('none');
      }
    };
    if (isSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsOpen]);

  if (!isOpen) return null;

  const windows = sources.filter((s) => s.isWindow);
  const screens = sources.filter((s) => !s.isWindow);

  const handleTabChange = (tab: 'applications' | 'screens' | 'devices') => {
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
            name: 'Application Window (Choose active window)',
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
            name: 'Entire Screen (Primary Monitor)',
            thumbnailUrl: '',
            isWindow: false,
          },
        ];
  }

  const handleShare = async () => {
    const targetSourceId = selectedSourceId;
    if (!targetSourceId) return;

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
      onClose();
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

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-[740px] max-w-full max-h-[92vh] bg-[#0A0908] text-white rounded-2xl border border-[#232428] shadow-[0_20px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden relative">
        {/* Top Header Bar with Tabs and Refresh/Close */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between shrink-0 bg-[#0A0908]">
          {/* Top Tabs (Applications | Entire Screen | Devices) */}
          <div className="flex items-center gap-6 border-b border-[#232428] flex-1 mr-4">
            <button
              onClick={() => handleTabChange('applications')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'applications'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#80848e] hover:text-[#dbdee1]'
              }`}
            >
              <AppWindow className="w-4 h-4" />
              <span>Applications</span>
              {windows.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#1e1f22] text-[#80848e]">
                  {windows.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('screens')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'screens'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#80848e] hover:text-[#dbdee1]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Entire Screen</span>
              {screens.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#1e1f22] text-[#80848e]">
                  {screens.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('devices')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'devices'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#80848e] hover:text-[#dbdee1]'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Devices</span>
            </button>
          </div>

          {/* Action buttons (Refresh & Close) */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadSources}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#80848e] hover:text-white hover:bg-[#18191d] border border-[#232428] transition-all cursor-pointer"
              title="Rescan open applications and screens"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#5865F2]' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#80848e] hover:text-white hover:bg-[#1a1b1f] transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Container (Thumbnails 2-column Grid) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#0A0908]">
          {!isElectron && (
            <div className="p-3.5 rounded-xl bg-[#121316] border border-[#232428] flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center shrink-0">
                <Info className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-xs">
                <span className="font-semibold text-white">Browser Screen Capture</span>
                <span className="text-[#80848e] text-[11px] leading-relaxed">
                  Select your preferred capture target below. Clicking "Go Live" will prompt the system picker for seamless streaming.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'devices' ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-[#121316]/50 rounded-xl border border-[#232428]">
              <Video className="w-8 h-8 text-[#80848e] mb-2" />
              <span className="text-sm font-semibold text-white">No Capture Devices Found</span>
              <p className="text-xs text-[#80848e] mt-1">Connect a capture card or webcam to stream video directly.</p>
            </div>
          ) : isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-[#80848e]">
              <Loader2 className="w-7 h-7 animate-spin text-[#5865F2] mb-2" />
              <span className="text-xs">Scanning open windows & screens...</span>
            </div>
          ) : displayList.length > 0 ? (
            <div className="grid grid-cols-2 gap-3.5">
              {displayList.map((source) => {
                const isSelected = selectedSourceId === source.id;
                return (
                  <div
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    className={`group rounded-xl p-2.5 cursor-pointer transition-all flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[#18191e] border border-[#5865F2] ring-2 ring-[#5865F2]/40 shadow-lg'
                        : 'bg-[#121316] border border-[#232428] hover:bg-[#18191d] hover:border-[#383a40]'
                    }`}
                  >
                    {/* Thumbnail Box */}
                    <div className="w-full h-32 rounded-lg bg-[#050506] overflow-hidden flex items-center justify-center border border-[#1c1d21] relative">
                      {source.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      ) : source.isWindow ? (
                        /* Sleek simulated window wireframe when no thumbnail */
                        <div className="w-full h-full p-2.5 flex flex-col justify-between bg-gradient-to-br from-[#121316] to-[#0a0a0c]">
                          <div className="flex items-center justify-between border-b border-[#232428] pb-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full bg-[#ed4245]/60" />
                              <div className="w-2 h-2 rounded-full bg-[#fee75c]/60" />
                              <div className="w-2 h-2 rounded-full bg-[#57f287]/60" />
                            </div>
                            <span className="text-[10px] text-[#80848e] truncate max-w-[120px] font-mono">
                              {source.name}
                            </span>
                          </div>
                          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-[#80848e]">
                            <AppWindow className="w-7 h-7 text-[#5865F2]" />
                            <span className="text-[10px] font-medium text-[#dbdee1]">Application Window</span>
                          </div>
                        </div>
                      ) : (
                        /* Sleek simulated monitor display when no thumbnail */
                        <div className="w-full h-full p-3 flex flex-col items-center justify-center bg-gradient-to-br from-[#101114] to-[#08080a] text-[#80848e]">
                          <div className="w-24 h-16 rounded-md border-2 border-[#2b2d31] bg-[#0c0d0f] flex flex-col items-center justify-between p-1.5 relative shadow-inner">
                            <div className="w-full h-2 rounded-xs bg-[#5865F2]/20 flex items-center justify-end px-1">
                              <div className="w-1 h-1 rounded-full bg-[#5865F2]" />
                            </div>
                            <Monitor className="w-5 h-5 text-[#5865F2]" />
                            <div className="w-8 h-1 rounded-full bg-[#232428]" />
                          </div>
                          <div className="w-5 h-1.5 bg-[#2b2d31] rounded-b-xs" />
                          <div className="w-10 h-0.5 bg-[#3f4147] rounded-full mt-0.5" />
                          <span className="text-[10px] font-medium text-[#dbdee1] mt-1.5">Primary Display</span>
                        </div>
                      )}

                      {/* Selected Checkmark Badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center shadow-md">
                          <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Source Name & Icon */}
                    <div className="flex items-center gap-2 px-1">
                      {source.appIconUrl ? (
                        <img
                          src={source.appIconUrl}
                          alt=""
                          className="w-4 h-4 rounded shrink-0 object-contain"
                        />
                      ) : source.id === 'browser-tab' ? (
                        <Globe className="w-4 h-4 text-[#5865F2] shrink-0" />
                      ) : source.isWindow ? (
                        <AppWindow className="w-4 h-4 text-[#5865F2] shrink-0" />
                      ) : (
                        <Monitor className="w-4 h-4 text-[#5865F2] shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span
                          className="text-xs font-semibold text-[#dbdee1] truncate group-hover:text-white"
                          title={source.name}
                        >
                          {source.name}
                        </span>
                        <span className="text-[10px] text-[#80848e]">
                          {source.isWindow ? 'Application Window' : 'Screen Display'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center p-6 bg-[#121316]/50 rounded-xl border border-[#232428]">
              <AppWindow className="w-8 h-8 text-[#80848e] mb-2" />
              <span className="text-sm font-semibold text-white">No {activeTab} detected</span>
              <p className="text-xs text-[#80848e] mt-1">Make sure the application you want to share is open and not minimized.</p>
              <button
                onClick={loadSources}
                className="mt-3 px-3 py-1.5 rounded-lg bg-[#1e1f22] hover:bg-[#2b2d31] text-xs font-semibold text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rescan Applications</span>
              </button>
            </div>
          )}
        </div>

        {/* Stream Quality Bottom Bar */}
        <div className="px-6 py-3.5 bg-[#0f1013] border-t border-[#232428] flex items-center justify-between shrink-0 relative">
          {/* Left: Selected Mode & Quality Summary */}
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white tracking-wide">{modeTitle}</span>
            <span className="text-[11px] text-[#80848e] font-mono">{modeSubtitle}</span>
          </div>

          {/* Right: SD / HD / Settings Gear */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectSD}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isSDActive
                  ? 'bg-[#5865F2] text-white shadow-md'
                  : 'bg-[#18191d] border border-[#2e3036] text-[#949ba4] hover:text-white hover:bg-[#232429]'
              }`}
              title="Standard Definition (720p 30fps)"
            >
              SD
            </button>
            <button
              onClick={handleSelectHD}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isHDActive
                  ? 'bg-[#5865F2] text-white shadow-md'
                  : 'bg-[#18191d] border border-[#2e3036] text-[#949ba4] hover:text-white hover:bg-[#232429]'
              }`}
              title="High Definition (1080p 60fps)"
            >
              HD
            </button>
            <button
              onClick={() => {
                setIsSettingsOpen(!isSettingsOpen);
                setOpenSubmenu('none');
              }}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                isSettingsOpen
                  ? 'bg-[#5865F2] text-white shadow-md'
                  : 'bg-[#18191d] border border-[#2e3036] text-[#949ba4] hover:text-white hover:bg-[#232429]'
              }`}
              title="Stream Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Stream Settings Popover Menu */}
          {isSettingsOpen && (
            <div
              ref={settingsMenuRef}
              className="absolute bottom-16 right-6 w-64 bg-[#0e0f12] border border-[#26282e] rounded-xl shadow-2xl p-2 z-50 text-xs text-[#dbdee1]"
            >
              <div className="px-2 py-1 text-[11px] font-bold text-[#80848e] uppercase tracking-wider">
                Stream Mode
              </div>

              {/* Gaming Mode Radio */}
              <div
                onClick={() => handleSelectMode('gaming')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Gaming</span>
                  <span className="text-[10px] text-[#80848e]">Smoother video (1080p, 60fps)</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    streamMode === 'gaming'
                      ? 'border-[#5865F2] bg-[#5865F2]'
                      : 'border-[#4e5058]'
                  }`}
                >
                  {streamMode === 'gaming' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              {/* Screenshare Mode Radio */}
              <div
                onClick={() => handleSelectMode('screenshare')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Screenshare</span>
                  <span className="text-[10px] text-[#80848e]">Clearer text (Source, 15fps)</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    streamMode === 'screenshare'
                      ? 'border-[#5865F2] bg-[#5865F2]'
                      : 'border-[#4e5058]'
                  }`}
                >
                  {streamMode === 'screenshare' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              {/* Custom Mode Radio */}
              <div
                onClick={() => handleSelectMode('custom')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Custom</span>
                  <span className="text-[10px] text-[#80848e]">Custom resolution & FPS</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    streamMode === 'custom'
                      ? 'border-[#5865F2] bg-[#5865F2]'
                      : 'border-[#4e5058]'
                  }`}
                >
                  {streamMode === 'custom' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <div className="h-[1px] bg-[#232428] my-1" />

              {/* Screen Resolution Submenu */}
              <div className="relative">
                <div
                  onClick={() =>
                    setOpenSubmenu(openSubmenu === 'resolution' ? 'none' : 'resolution')
                  }
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors"
                >
                  <span className="font-medium text-white">Screen Resolution</span>
                  <div className="flex items-center gap-1 text-[#80848e]">
                    <span className="font-mono text-[11px] text-[#5865F2]">{resolution}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Submenu Flyout for Resolution */}
                {openSubmenu === 'resolution' && (
                  <div className="absolute left-full bottom-0 ml-1.5 w-36 bg-[#0e0f12] border border-[#26282e] rounded-xl shadow-2xl p-1.5 z-50">
                    {(['720p', '1080p', '1440p', 'source'] as ScreenShareResolution[]).map(
                      (res) => (
                        <div
                          key={res}
                          onClick={() => {
                            setResolution(res);
                            setStreamMode('custom');
                            setOpenSubmenu('none');
                          }}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#18191d] cursor-pointer ${
                            resolution === res ? 'text-[#5865F2] font-bold' : 'text-[#dbdee1]'
                          }`}
                        >
                          <span className="capitalize">{res === 'source' ? 'Source' : res}</span>
                          {resolution === res && <Check className="w-3.5 h-3.5" />}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Frame Rate Submenu */}
              <div className="relative">
                <div
                  onClick={() =>
                    setOpenSubmenu(openSubmenu === 'framerate' ? 'none' : 'framerate')
                  }
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors"
                >
                  <span className="font-medium text-white">Frame Rate</span>
                  <div className="flex items-center gap-1 text-[#80848e]">
                    <span className="font-mono text-[11px] text-[#5865F2]">{frameRate}fps</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Submenu Flyout for Framerate */}
                {openSubmenu === 'framerate' && (
                  <div className="absolute left-full bottom-0 ml-1.5 w-28 bg-[#0e0f12] border border-[#26282e] rounded-xl shadow-2xl p-1.5 z-50">
                    {([15, 30, 60] as ScreenShareFramerate[]).map((fps) => (
                      <div
                        key={fps}
                        onClick={() => {
                          setFrameRate(fps);
                          setStreamMode('custom');
                          setOpenSubmenu('none');
                        }}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#18191d] cursor-pointer ${
                          frameRate === fps ? 'text-[#5865F2] font-bold' : 'text-[#dbdee1]'
                        }`}
                      >
                        <span>{fps} fps</span>
                        {frameRate === fps && <Check className="w-3.5 h-3.5" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-[1px] bg-[#232428] my-1" />

              {/* Mute stream audio checkbox */}
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#18191d] cursor-pointer transition-colors">
                <span className="text-xs text-white">Mute stream audio</span>
                <input
                  type="checkbox"
                  checked={!includeAudio}
                  onChange={(e) => setIncludeAudio(!e.target.checked)}
                  className="w-4 h-4 rounded border-[#383a40] text-[#5865F2] focus:ring-[#5865F2] bg-[#0A0908] cursor-pointer accent-[#5865F2]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="px-6 py-4 bg-[#0A0908] border-t border-[#232428] flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-[#80848e] hover:text-white hover:underline transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleShare}
            disabled={!selectedSourceId || isLoading}
            className="px-6 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] active:scale-95 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-all shadow-lg cursor-pointer flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Go Live</span>
          </button>
        </div>
      </div>
    </div>
  );
};
