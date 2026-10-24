import React, { useState } from 'react';
import {
  X,
  ListMusic,
  Trash2,
  Plus,
  Loader2,
  Clock,
  User,
  Music2,
} from 'lucide-react';
import { useMusicStore } from '../../stores/music.store';
import { useServerStore } from '../../stores/server.store';

export const MusicQueueModal: React.FC = () => {
  const { activeServerId, activeChannelId } = useServerStore();
  const {
    session,
    isQueueOpen,
    setQueueOpen,
    play,
    removeTrack,
    clearQueue,
  } = useMusicStore();

  const [inputQuery, setInputQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  if (!isQueueOpen) return null;

  const current = session?.currentTrack;
  const queue = session?.queue || [];

  const handleAddTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || !activeServerId) return;

    setActionLoading(true);
    const query = inputQuery.trim();
    setInputQuery('');
    await play(activeServerId, query, activeChannelId || undefined);
    setActionLoading(false);
  };

  const handleRemove = async (position: number) => {
    if (!activeServerId) return;
    await removeTrack(activeServerId, position);
  };

  const handleClear = async () => {
    if (!activeServerId) return;
    await clearQueue(activeServerId);
  };

  const formatDuration = (secs: number) => {
    if (!secs || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-[#1e1f22] border border-[#2b2d31] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2b2d31] flex items-center justify-between shrink-0 bg-[#18191c]/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-accent-bright/10 text-accent-bright rounded-xl border border-accent-bright/20">
              <ListMusic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-[#f2f3f5] leading-none">Music Queue</h2>
              <p className="text-[12px] text-[#949ba4] mt-1">
                {session?.channelName ? `Connected to ${session.channelName}` : 'Server Music Session'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setQueueOpen(false)}
            className="p-1.5 text-[#949ba4] hover:text-white hover:bg-[#313338] rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Add Song Bar */}
        <div className="p-4 border-b border-[#2b2d31] bg-[#141517]/50 shrink-0">
          <form onSubmit={handleAddTrack} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Song name or YouTube / SoundCloud link..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                className="w-full bg-[#111214] border border-[#2b2d31] rounded-xl px-3.5 py-2.5 text-[13px] text-[#f2f3f5] placeholder-[#5f6368] focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!inputQuery.trim() || actionLoading}
              className="px-4 py-2.5 bg-accent-bright hover:bg-accent-bright/90 text-black font-bold rounded-xl text-[13px] flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-md"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Add</span>
            </button>
          </form>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {/* Now Playing Banner */}
          {current ? (
            <div>
              <span className="text-[11px] font-bold text-accent-bright uppercase tracking-wider block mb-2">
                Now Playing
              </span>
              <div className="p-3.5 bg-[#18191c] border border-[#2b2d31] rounded-xl flex items-center gap-3.5 shadow-sm">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#111214] shrink-0 border border-[#2b2d31]">
                  {current.thumbnailUrl ? (
                    <img src={current.thumbnailUrl} alt={current.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music2 className="w-6 h-6 text-accent-bright" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-[14px] font-bold text-[#f2f3f5] truncate">{current.title}</h4>
                  <p className="text-[12px] text-[#949ba4] truncate mt-0.5">{current.artist}</p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-[#949ba4]">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {formatDuration(current.durationSeconds)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {current.requestingUserName || 'Member'}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                        current.source === 'youtube'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {current.source}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-[#2b2d31] rounded-xl">
              <Music2 className="w-8 h-8 text-[#5f6368] mx-auto mb-2" />
              <p className="text-[13px] text-[#949ba4]">No song is currently playing</p>
              <p className="text-[11px] text-[#5f6368] mt-0.5">Use the search box above or type /play in chat</p>
            </div>
          )}

          {/* Queue List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#949ba4] uppercase tracking-wider">
                Up Next ({queue.length})
              </span>
              {queue.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-[11px] text-destructive hover:underline font-medium cursor-pointer"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <p className="text-[12px] text-[#5f6368] italic py-2">The queue is currently empty.</p>
            ) : (
              <div className="space-y-2">
                {queue.map((item, index) => {
                  const pos = index + 1;
                  return (
                    <div
                      key={item.id}
                      className="px-3.5 py-2.5 bg-[#141517] hover:bg-[#18191c] border border-[#232428] rounded-xl flex items-center justify-between gap-3 group transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-5 text-center text-[12px] font-bold font-mono text-[#5f6368] shrink-0">
                          #{pos}
                        </span>

                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#1e1f22] shrink-0 border border-[#2b2d31]">
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music2 className="w-4 h-4 text-[#949ba4]" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-[13px] font-semibold text-[#f2f3f5] truncate">{item.title}</h5>
                          <div className="flex items-center gap-2 text-[11px] text-[#949ba4] mt-0.5">
                            <span className="truncate">{item.artist}</span>
                            <span>•</span>
                            <span className="font-mono">{formatDuration(item.durationSeconds)}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemove(pos)}
                        className="p-1.5 text-[#5f6368] hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title={`Remove #${pos}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-[#2b2d31] bg-[#141517] flex items-center justify-between text-[11px] text-[#5f6368] shrink-0">
          <span>Supported: YouTube & SoundCloud</span>
          <span>Commands: /play, /skip, /pause, /volume</span>
        </div>
      </div>
    </div>
  );
};
