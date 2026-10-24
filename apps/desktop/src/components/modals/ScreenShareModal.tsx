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

  // Quality & Stream Customization Settings (Faithful to Discord Screenshot 2)
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

  const loadSources = async () => {
    setIsLoading(true);
    try {
      if (window.nightshift?.isElectron) {
        const desktopSources = await window.nightshift.getScreenSources();
        setSources(desktopSources);
        if (desktopSources.length > 0 && !selectedSourceId) {
          const defaultSrc = desktopSources.find((s) => s.isWindow) || desktopSources[0];
          setSelectedSourceId(defaultSrc.id);
        }
      } else {
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

  let displayList: DesktopScreenSource[] = [];
  if (activeTab === 'applications') displayList = windows;
  else if (activeTab === 'screens') displayList = screens;

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

  // Quick SD / HD Buttons (Discord style)
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[720px] max-w-full max-h-[92vh] bg-[#313338] text-white rounded-2xl border border-[#1e1f22] shadow-2xl flex flex-col overflow-hidden relative">
        {/* Top Header Bar with Close Button */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between shrink-0">
          {/* Top Tabs (Applications | Entire Screen | Devices) */}
          <div className="flex items-center gap-6 border-b border-[#3f4147] flex-1 mr-4">
            <button
              onClick={() => setActiveTab('applications')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'applications'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#949ba4] hover:text-[#dbdee1]'
              }`}
            >
              <AppWindow className="w-4 h-4" />
              <span>Applications</span>
            </button>
            <button
              onClick={() => setActiveTab('screens')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'screens'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#949ba4] hover:text-[#dbdee1]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Entire Screen</span>
            </button>
            <button
              onClick={() => setActiveTab('devices')}
              className={`flex items-center gap-2 pb-3 font-semibold text-sm transition-all cursor-pointer ${
                activeTab === 'devices'
                  ? 'text-white border-b-2 border-[#5865F2]'
                  : 'text-[#949ba4] hover:text-[#dbdee1]'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Devices</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#949ba4] hover:text-white hover:bg-[#35373c] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Container (Thumbnails 2-column Grid) */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!window.nightshift?.isElectron ? (
            <div className="p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] flex items-center gap-3.5 mb-2">
              <div className="w-10 h-10 rounded-lg bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-xs">
                <span className="font-bold text-white">Browser Screen Capture</span>
                <span className="text-[#949ba4] leading-relaxed">
                  Clicking "Go Live" will prompt your browser to let you choose an Entire Screen, Window, or Tab.
                </span>
              </div>
            </div>
          ) : activeTab === 'devices' ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 bg-[#2b2d31]/50 rounded-xl border border-[#3f4147]">
              <Video className="w-8 h-8 text-[#949ba4] mb-2" />
              <span className="text-sm font-semibold text-white">No Capture Devices Found</span>
              <p className="text-xs text-[#949ba4] mt-1">Connect a capture card or webcam to stream video directly.</p>
            </div>
          ) : isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center text-[#949ba4]">
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
                    className={`group rounded-xl p-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[#2b2d31] ring-2 ring-[#5865F2]'
                        : 'bg-[#2b2d31]/60 hover:bg-[#2b2d31] hover:ring-1 hover:ring-[#4e5058]'
                    }`}
                  >
                    {/* Thumbnail Box */}
                    <div className="w-full h-28 rounded-lg bg-[#111214] overflow-hidden flex items-center justify-center border border-[#1e1f22] relative">
                      {source.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Monitor className="w-8 h-8 text-[#949ba4]" />
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center shadow-md">
                          <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Source Name & Icon */}
                    <div className="flex items-center gap-2 px-1">
                      {source.isWindow ? (
                        <AppWindow className="w-3.5 h-3.5 text-[#949ba4] shrink-0" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-[#949ba4] shrink-0" />
                      )}
                      <span className="text-xs font-medium text-[#dbdee1] truncate group-hover:text-white">
                        {source.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center p-6 bg-[#2b2d31]/50 rounded-xl border border-[#3f4147]">
              <AppWindow className="w-8 h-8 text-[#949ba4] mb-2" />
              <span className="text-sm font-semibold text-white">No {activeTab} detected</span>
              <p className="text-xs text-[#949ba4] mt-1">Make sure the application you want to share is open and not minimized.</p>
            </div>
          )}
        </div>

        {/* Discord Stream Quality Bottom Bar */}
        <div className="px-6 py-3.5 bg-[#2b2d31] border-t border-[#1e1f22] flex items-center justify-between shrink-0 relative">
          {/* Left: Selected Mode & Quality Summary */}
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white tracking-wide">{modeTitle}</span>
            <span className="text-[11px] text-[#949ba4] font-mono">{modeSubtitle}</span>
          </div>

          {/* Right: SD / HD / Settings Gear */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectSD}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isSDActive
                  ? 'bg-[#5865F2] text-white shadow-md'
                  : 'bg-[#1e1f22] text-[#949ba4] hover:text-white hover:bg-[#35373c]'
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
                  : 'bg-[#1e1f22] text-[#949ba4] hover:text-white hover:bg-[#35373c]'
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
                  ? 'bg-[#5865F2] text-white'
                  : 'bg-[#1e1f22] text-[#949ba4] hover:text-white hover:bg-[#35373c]'
              }`}
              title="Stream Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Discord Stream Settings Popover Menu (Faithful to Screenshot 2) */}
          {isSettingsOpen && (
            <div
              ref={settingsMenuRef}
              className="absolute bottom-16 right-6 w-64 bg-[#111214] border border-[#2b2d31] rounded-xl shadow-2xl p-2 z-50 text-xs text-[#dbdee1]"
            >
              <div className="px-2 py-1 text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">
                Stream Mode
              </div>

              {/* Gaming Mode Radio */}
              <div
                onClick={() => handleSelectMode('gaming')}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Gaming</span>
                  <span className="text-[10px] text-[#949ba4]">Smoother video (1080p, 60fps)</span>
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
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Screenshare</span>
                  <span className="text-[10px] text-[#949ba4]">Clearer text (Source, 15fps)</span>
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
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-white">Custom</span>
                  <span className="text-[10px] text-[#949ba4]">Custom resolution & FPS</span>
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

              <div className="h-[1px] bg-[#2b2d31] my-1" />

              {/* Screen Resolution Submenu */}
              <div className="relative">
                <div
                  onClick={() =>
                    setOpenSubmenu(openSubmenu === 'resolution' ? 'none' : 'resolution')
                  }
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer"
                >
                  <span className="font-medium text-white">Screen Resolution</span>
                  <div className="flex items-center gap-1 text-[#949ba4]">
                    <span className="font-mono text-[11px] text-[#5865F2]">{resolution}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Submenu Flyout for Resolution */}
                {openSubmenu === 'resolution' && (
                  <div className="absolute left-full bottom-0 ml-1.5 w-36 bg-[#111214] border border-[#2b2d31] rounded-xl shadow-2xl p-1.5 z-50">
                    {(['720p', '1080p', '1440p', 'source'] as ScreenShareResolution[]).map(
                      (res) => (
                        <div
                          key={res}
                          onClick={() => {
                            setResolution(res);
                            setStreamMode('custom');
                            setOpenSubmenu('none');
                          }}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#2b2d31] cursor-pointer ${
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
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer"
                >
                  <span className="font-medium text-white">Frame Rate</span>
                  <div className="flex items-center gap-1 text-[#949ba4]">
                    <span className="font-mono text-[11px] text-[#5865F2]">{frameRate}fps</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Submenu Flyout for Framerate */}
                {openSubmenu === 'framerate' && (
                  <div className="absolute left-full bottom-0 ml-1.5 w-28 bg-[#111214] border border-[#2b2d31] rounded-xl shadow-2xl p-1.5 z-50">
                    {([15, 30, 60] as ScreenShareFramerate[]).map((fps) => (
                      <div
                        key={fps}
                        onClick={() => {
                          setFrameRate(fps);
                          setStreamMode('custom');
                          setOpenSubmenu('none');
                        }}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#2b2d31] cursor-pointer ${
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

              <div className="h-[1px] bg-[#2b2d31] my-1" />

              {/* Mute stream audio checkbox */}
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#2b2d31] cursor-pointer">
                <span className="text-xs text-white">Mute stream audio</span>
                <input
                  type="checkbox"
                  checked={!includeAudio}
                  onChange={(e) => setIncludeAudio(!e.target.checked)}
                  className="w-4 h-4 rounded border-[#4e5058] text-[#5865F2] focus:ring-[#5865F2] bg-[#1e1f22] cursor-pointer accent-[#5865F2]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Modal Action Footer (Cancel & Go Live in Discord Indigo Blue) */}
        <div className="px-6 py-4 bg-[#2b2d31] border-t border-[#1e1f22] flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="text-xs font-semibold text-[#949ba4] hover:text-white hover:underline transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleShare}
            disabled={!selectedSourceId && sources.length > 0 && !!window.nightshift?.isElectron}
            className="px-6 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] active:scale-95 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            Go Live
          </button>
        </div>
      </div>
    </div>
  );
};
