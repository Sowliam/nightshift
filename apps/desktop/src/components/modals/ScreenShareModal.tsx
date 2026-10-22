import React, { useState, useEffect } from 'react';
import { X, Monitor, AppWindow, Loader2, RefreshCw } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { DesktopScreenSource } from '@nightshift/shared';

interface ScreenShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({ isOpen, onClose }) => {
  const [sources, setSources] = useState<DesktopScreenSource[]>([]);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  const { startScreenShare } = useLiveKitStore();

  const loadSources = async () => {
    setIsLoading(true);
    try {
      if (window.nightshift?.isElectron) {
        const desktopSources = await window.nightshift.getScreenSources();
        setSources(desktopSources);
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
      setSelectedSourceId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const screens = sources.filter((s) => !s.isWindow);
  const windows = sources.filter((s) => s.isWindow);
  const displayList = activeTab === 'screens' ? screens : windows;

  const handleShare = async () => {
    if (!selectedSourceId && window.nightshift?.isElectron) return;

    const success = await startScreenShare(
      selectedSourceId === 'browser-display' ? undefined : selectedSourceId || undefined
    );
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[620px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent">
              <Monitor className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Share Your Screen
              </h3>
              <p className="text-xs text-text-secondary">
                Select a screen or application window to stream
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

        {/* Tab Selector */}
        <div className="px-5 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2 p-1 bg-bg-elevated rounded-xl border border-border-subtle text-xs">
            <button
              onClick={() => setActiveTab('screens')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'screens'
                  ? 'bg-accent text-bg-main shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Screens ({screens.length})
            </button>
            <button
              onClick={() => setActiveTab('windows')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'windows'
                  ? 'bg-accent text-bg-main shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <AppWindow className="w-3.5 h-3.5" />
              Application Windows ({windows.length})
            </button>
          </div>

          <button
            onClick={loadSources}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent p-1.5 rounded-lg hover:bg-bg-elevated transition-colors"
            title="Refresh Sources"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Source Thumbnails Grid */}
        <div className="p-5 max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center text-text-secondary">
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
                        : 'bg-bg-elevated/50 border-border-subtle hover:border-text-secondary hover:bg-bg-elevated'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="w-full h-28 rounded-lg bg-black/60 overflow-hidden flex items-center justify-center border border-border-subtle/50 relative">
                      {source.thumbnailUrl ? (
                        <img
                          src={source.thumbnailUrl}
                          alt={source.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Monitor className="w-8 h-8 text-text-muted" />
                      )}

                      {isSelected && (
                        <div className="absolute inset-0 bg-accent/10 border-2 border-accent rounded-lg" />
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
            <div className="h-44 flex flex-col items-center justify-center text-center p-4">
              <AppWindow className="w-8 h-8 text-text-muted mb-2" />
              <span className="text-xs font-medium text-text-secondary">
                No {activeTab} detected
              </span>
              <p className="text-[11px] text-text-muted mt-1">
                Make sure the applications you want to share are not minimized.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-border-subtle bg-bg-secondary flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover text-xs font-medium text-text-secondary hover:text-text-primary border border-border-subtle transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={!selectedSourceId && sources.length > 0 && !!window.nightshift?.isElectron}
            className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-bg-main text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            Start Sharing
          </button>
        </div>
      </div>
    </div>
  );
};
