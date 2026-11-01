import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, RefreshCw, Radio, CheckCircle2 } from 'lucide-react';
import { api, getApiBase } from '../../lib/api';

interface PreLaunchGatewayProps {
  onReady: () => void;
}

type ConnectionState = 'checking' | 'offline' | 'connected' | 'launching';

export const PreLaunchGateway: React.FC<PreLaunchGatewayProps> = ({ onReady }) => {
  const [connState, setConnState] = useState<ConnectionState>('checking');
  const [countdown, setCountdown] = useState<number>(3);
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Probes internet & backend connectivity
  const probeConnectivity = async (): Promise<boolean> => {
    // 1. First check browser network status
    if (!navigator.onLine) {
      return false;
    }

    // 2. Perform live network fetch probe (with 3-second timeout)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      // Probe backend health or fallback to origin ping
      await Promise.any([
        api.getHealth(),
        fetch(`${getApiBase()}/health`, { method: 'GET', signal: controller.signal, cache: 'no-store' }),
        fetch('/logo.png', { method: 'HEAD', signal: controller.signal, cache: 'no-store' }),
      ]);

      clearTimeout(timeoutId);
      return true;
    } catch (err: any) {
      // If navigator is strictly online and we can fetch origin or health
      if (navigator.onLine) {
        try {
          const res = await fetch(window.location.origin + '/?probe=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
          if (res.ok || res.status < 500) return true;
        } catch {
          // offline
        }
      }
      return false;
    }
  };

  const startCountdown = () => {
    setConnState('connected');
    setCountdown(3);
    setProgress(10);

    // Smooth progress bar update over 3000ms
    const startTime = Date.now();
    const duration = 3000;

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      const secondsRemaining = Math.max(1, Math.ceil((duration - elapsed) / 1000));
      setCountdown(secondsRemaining);

      if (elapsed >= duration) {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        setProgress(100);
        setConnState('launching');
        setTimeout(() => {
          onReady();
        }, 350);
      }
    }, 50);
  };

  const cancelCountdown = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setProgress(0);
  };

  const checkConnection = async (manual = false) => {
    if (manual) setIsRetrying(true);
    setConnState((prev) => (prev === 'connected' ? prev : 'checking'));

    const isConnected = await probeConnectivity();

    if (manual) setIsRetrying(false);

    if (isConnected) {
      setErrorMessage('');
      // If we are not already counting down or launching, start the 3-second sequence
      setConnState((curr) => {
        if (curr !== 'connected' && curr !== 'launching') {
          startCountdown();
          return 'connected';
        }
        return curr;
      });
    } else {
      cancelCountdown();
      setConnState('offline');
      setErrorMessage(
        !navigator.onLine
          ? 'دستگاه شما به شبکه اینترنت متصل نیست.'
          : 'اتصال به شبکه اینترنت برقرار نشد. در حال بررسی مجدد...'
      );
    }
  };

  useEffect(() => {
    // Initial connection verification
    checkConnection();

    // Listen to browser online/offline events
    const handleOnline = () => {
      checkConnection();
    };

    const handleOffline = () => {
      cancelCountdown();
      setConnState('offline');
      setErrorMessage('اتصال شبکه قطع شد.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Continuous poll every 2.5s if offline to auto-detect connection recovery
    pollTimerRef.current = setInterval(() => {
      if (connState === 'offline' || connState === 'checking') {
        checkConnection();
      }
    }, 2500);

    return () => {
      cancelCountdown();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connState]);

  return (
    <div className="fixed inset-0 z-[999999] bg-[#0A0908] flex flex-col items-center justify-center select-none font-sans overflow-hidden text-white">
      {/* Background ambient neon glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className={`w-[480px] h-[480px] rounded-full blur-[120px] transition-all duration-700 ${
            connState === 'offline'
              ? 'bg-destructive/20'
              : 'bg-[#52B788]/20'
          }`}
        />
      </div>

      {/* Futuristic grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
        {/* Emblem with animated sonar wave rings */}
        <div className="relative mb-8 flex items-center justify-center">
          {connState === 'connected' || connState === 'launching' ? (
            <>
              <div className="absolute w-36 h-36 rounded-full border border-[#52B788]/30 animate-ping opacity-75" />
              <div className="absolute w-44 h-44 rounded-full border border-[#52B788]/15 animate-pulse" />
            </>
          ) : connState === 'offline' ? (
            <div className="absolute w-36 h-36 rounded-full border border-destructive/40 animate-pulse" />
          ) : (
            <div className="absolute w-36 h-36 rounded-full border border-border-subtle animate-spin duration-1000" />
          )}

          <div
            className={`w-24 h-24 rounded-3xl p-4 flex items-center justify-center transition-all duration-500 shadow-2xl relative ${
              connState === 'offline'
                ? 'bg-destructive/15 border-2 border-destructive/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                : 'bg-bg-surface/80 border-2 border-[#52B788]/60 shadow-[0_0_35px_rgba(82,183,136,0.35)]'
            }`}
          >
            <img
              src="/logo.png"
              alt="NIGHTSHIFT"
              className="w-16 h-16 object-contain drop-shadow-[0_0_12px_rgba(82,183,136,0.6)]"
            />

            {/* Offline badge overlay */}
            {connState === 'offline' && (
              <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-destructive flex items-center justify-center shadow-lg border-2 border-[#0A0908]">
                <WifiOff className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black tracking-[4px] uppercase text-white mb-1.5 flex items-center gap-2">
          <span>NIGHTSHIFT</span>
        </h1>
        <p className="text-[11px] font-bold tracking-[2px] text-text-muted uppercase mb-7">
          Ultra-Low Latency Audio Mesh
        </p>

        {/* State Display Card */}
        <div className="w-full bg-[#141312]/90 border border-border-subtle/60 rounded-2xl p-5 backdrop-blur-md shadow-card mb-6">
          {connState === 'offline' ? (
            <div className="flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-xs font-bold mb-3">
                <WifiOff className="w-3.5 h-3.5" />
                <span>اتصال اینترنت قطع است</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                {errorMessage || 'برای اجرای نایت‌شیفت اتصال به اینترنت الزامی است. برنامه در انتظار اتصال شبکه است...'}
              </p>
              <button
                onClick={() => checkConnection(true)}
                disabled={isRetrying}
                className="w-full py-2.5 px-4 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'در حال بررسی...' : 'تلاش مجدد برای اتصال'}</span>
              </button>
            </div>
          ) : connState === 'checking' ? (
            <div className="flex flex-col items-center py-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-text-secondary text-xs font-medium mb-3">
                <Radio className="w-3.5 h-3.5 animate-pulse text-[#52B788]" />
                <span>در حال بررسی اتصال به شبکه...</span>
              </div>
              <p className="text-[11px] text-text-muted">
                Connecting to high-speed voice gateway
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#52B788]/15 border border-[#52B788]/40 text-[#52B788] text-xs font-bold mb-3 shadow-[0_0_12px_rgba(82,183,136,0.25)]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اتصال برقرار شد</span>
              </div>

              {/* Countdown & Status */}
              <div className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                <span>ورود به اپلیکیشن تا</span>
                <span className="font-mono font-black text-sm text-[#52B788] px-1.5 py-0.5 rounded bg-[#52B788]/20">
                  {countdown}
                </span>
                <span>ثانیه دیگر...</span>
              </div>

              {/* Discord-style Progress Bar */}
              <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden border border-white/10 p-[1px]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2D6A4F] via-[#52B788] to-[#74C69D] transition-all duration-75 shadow-[0_0_10px_#52B788]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="w-full flex items-center justify-between text-[10px] font-mono text-text-muted mt-2">
                <span>VERIFYING AUDIO SFU</span>
                <span>{progress}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted/60">
          <span className="w-1.5 h-1.5 rounded-full bg-[#52B788]" />
          <span>NIGHTSHIFT v0.1.0 • Frankfurt EU Routing</span>
        </div>
      </div>
    </div>
  );
};
