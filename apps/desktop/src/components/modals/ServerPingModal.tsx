import React, { useState, useEffect } from 'react';
import { X, Globe, RefreshCw, Zap, Shield, CheckCircle2 } from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { getApiBase } from '../../lib/api';

interface ServerPingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ServerRegion {
  id: string;
  name: string;
  location: string;
  endpoint: string;
  isPrimary: boolean;
  ping: number | null;
  status: 'idle' | 'testing' | 'online' | 'unreachable';
}

export const ServerPingModal: React.FC<ServerPingModalProps> = ({ isOpen, onClose }) => {
  const { currentPing } = useLiveKitStore();

  const [servers, setServers] = useState<ServerRegion[]>([
    {
      id: 'cloudflare-gateway',
      name: 'Cloudflare Edge Proxy (Iran Gateway)',
      location: 'Global Anycast Edge Network',
      endpoint: `${getApiBase()}/api/health`,
      isPrimary: true,
      ping: null,
      status: 'idle',
    },
    {
      id: 'livekit-cloud',
      name: 'LiveKit Cloud Voice & Video Edge',
      location: 'Low-Latency WebRTC Smart Routing',
      endpoint: 'https://voiceline-qy3slc6n.livekit.cloud',
      isPrimary: false,
      ping: currentPing,
      status: currentPing ? 'online' : 'idle',
    },
    {
      id: 'render-backend',
      name: 'Render Origin Core Backend',
      location: 'Frankfurt EU (Core API & DB)',
      endpoint: 'https://nightshift-server-cfch.onrender.com/api/health',
      isPrimary: false,
      ping: null,
      status: 'idle',
    },
    {
      id: 'vercel-web',
      name: 'Vercel Global Frontend CDN',
      location: 'Global High-Speed Edge CDN',
      endpoint: 'https://dist-three-gray-67.vercel.app',
      isPrimary: false,
      ping: null,
      status: 'idle',
    },
  ]);

  const [isTestingAll, setIsTestingAll] = useState(false);

  const pingServer = async (server: ServerRegion): Promise<{ ping: number; status: 'online' | 'unreachable' }> => {
    // 1. If testing LiveKit voice and we already have real WebRTC UDP ping, return real WebRTC ping!
    if (server.id === 'livekit-cloud' && currentPing) {
      return { ping: currentPing, status: 'online' };
    }

    // 2. Direct fast probe without failed HEAD roundtrip
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const startTime = performance.now();

    try {
      await fetch(server.endpoint, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - startTime);
      return { ping: latency, status: 'online' };
    } catch {
      clearTimeout(timeout);
      return { ping: 0, status: 'unreachable' };
    }
  };

  const testAllServers = async () => {
    setIsTestingAll(true);
    const updated = [...servers];

    for (let i = 0; i < updated.length; i++) {
      updated[i].status = 'testing';
      setServers([...updated]);

      if (updated[i].id === 'livekit-cloud' && currentPing) {
        updated[i].ping = currentPing;
        updated[i].status = 'online';
      } else {
        const result = await pingServer(updated[i]);
        updated[i].ping = result.status === 'online' ? result.ping : null;
        updated[i].status = result.status;
      }

      setServers([...updated]);
    }
    setIsTestingAll(false);
  };

  useEffect(() => {
    if (isOpen) {
      testAllServers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getPingBadge = (ping: number | null, status: string) => {
    if (status === 'testing') {
      return (
        <span className="text-xs text-amber-400 font-mono flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          measuring...
        </span>
      );
    }
    if (status === 'unreachable' || ping === null) {
      return <span className="text-xs text-text-muted font-mono">Unreachable</span>;
    }
    if (ping < 140) {
      return (
        <span className="px-2 py-0.5 rounded bg-online/20 text-online font-mono text-xs font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-online animate-pulse" />
          {ping} ms (Optimal)
        </span>
      );
    }
    if (ping <= 350) {
      return (
        <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-400 font-mono text-xs font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          {ping} ms (Good)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded bg-destructive/20 text-destructive font-mono text-xs font-bold flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
        {ping} ms (High)
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[580px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Voice Servers & Network Ping
              </h3>
              <p className="text-xs text-text-secondary">
                Real-time latency to WebRTC media gateways
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

        {/* Server List */}
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold tracking-wider text-text-secondary uppercase">
              Available Regions
            </span>
            <button
              onClick={testAllServers}
              disabled={isTestingAll}
              className="flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
              Test All Pings
            </button>
          </div>

          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                  server.isPrimary
                    ? 'bg-bg-elevated border-accent/40 shadow-sm'
                    : 'bg-bg-elevated/40 border-border-subtle'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      server.isPrimary
                        ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                        : 'bg-bg-secondary text-text-secondary border border-border-subtle'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-text-primary">
                        {server.name}
                      </span>
                      {server.isPrimary && (
                        <span className="text-[10px] font-bold text-accent uppercase bg-accent-subtle px-1.5 py-0.2 rounded">
                          Connected
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-text-muted">{server.location}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {getPingBadge(server.ping, server.status)}
                </div>
              </div>
            ))}
          </div>

          {/* Network Notes */}
          <div className="p-3.5 rounded-xl bg-bg-elevated/40 border border-border-subtle/60 text-xs text-text-secondary flex items-start gap-2.5 mt-4">
            <Shield className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            <div className="leading-relaxed text-[11px]">
              <span className="text-text-primary font-medium block">
                Automatic Low-Latency Routing & Fallback
              </span>
              NIGHTSHIFT automatically routes voice packets through the lowest-latency edge server and uses TLS/TCP fallback if standard UDP is restricted on your network.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-subtle bg-bg-secondary flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-online">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Active WebRTC Session Healthy</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover text-xs font-medium text-text-primary border border-border-subtle transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
