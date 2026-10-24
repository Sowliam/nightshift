import React, { useRef, useEffect, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Radio,
  Users,
  LogIn,
  Zap,
  Volume2,
  VolumeX,
  PictureInPicture,
  StopCircle,
  Loader2,
  EyeOff,
  LayoutGrid,
  Play,
  Pause,
  PhoneOff,
} from 'lucide-react';
import { useLiveKitStore, ActiveScreenShare } from '../../stores/livekit.store';
import { useServerStore } from '../../stores/server.store';
import { useRoomStore } from '../../stores/room.store';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { ParticipantStrip } from './ParticipantStrip';
import { VoiceGrid } from '../voice/VoiceGrid';
import { CallControlBar } from '../controls/CallControlBar';
import { ConnectionState, Track, RoomEvent, RemoteAudioTrack } from 'livekit-client';
import { api } from '../../lib/api';
import { DEFAULT_PRODUCTION_WEB } from '@nightshift/shared';

interface StreamTileProps {
  share: ActiveScreenShare;
  isFocused?: boolean;
  onFocus?: () => void;
  onStopWatching: () => void;
  onStopSharing: () => void;
  isMulti: boolean;
}

const StreamTile: React.FC<StreamTileProps> = ({
  share,
  isFocused,
  onFocus,
  onStopWatching,
  onStopSharing,
  isMulti,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { room, isDeafened } = useLiveKitStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLocalPreviewPaused, setIsLocalPreviewPaused] = useState(false);
  const [streamVolume, setStreamVolume] = useState(100);
  const [isStreamMuted, setIsStreamMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [resolution, setResolution] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Attach WebRTC video track to this tile's video element
  useEffect(() => {
    const el = videoRef.current;
    const track = share.publication?.track;
    if (el && track) {
      track.attach(el);
    }
    return () => {
      if (el && track) {
        track.detach(el);
      }
    };
  }, [share.publication, share.publication?.track]);

  // Attach remote screen share audio track to audio element
  useEffect(() => {
    // If local user is broadcasting their own screen, never play local audio to avoid echo loop
    if (share.isLocal || !room) return;

    const el = audioRef.current;
    let currentTrack: Track | null = null;

    const attachAudioTrack = (track: Track) => {
      if (!el) return;
      track.attach(el);
      currentTrack = track;
      const effectiveMuted = isDeafened || isStreamMuted;
      el.volume = effectiveMuted ? 0 : Math.min(streamVolume / 100, 1.0);
      el.muted = effectiveMuted;
      if (typeof (track as RemoteAudioTrack).setVolume === 'function') {
        (track as RemoteAudioTrack).setVolume(effectiveMuted ? 0 : streamVolume / 100);
      }
      el.play().catch((err) => console.warn('Stream audio autoplay prevented:', err));
    };

    // 1. Check existing participant publications
    const remote = room.getParticipantByIdentity(share.participantIdentity);
    if (remote) {
      const pub = remote.getTrackPublication(Track.Source.ScreenShareAudio);
      if (pub?.track) {
        attachAudioTrack(pub.track);
      }
    }

    // 2. Listen to room track subscribed / unsubscribed
    const onTrackSubscribed = (track: Track, publication: any, participant: any) => {
      if (
        participant.identity === share.participantIdentity &&
        publication.source === Track.Source.ScreenShareAudio
      ) {
        attachAudioTrack(track);
      }
    };

    const onTrackUnsubscribed = (track: Track, publication: any, participant: any) => {
      if (
        participant.identity === share.participantIdentity &&
        publication.source === Track.Source.ScreenShareAudio
      ) {
        if (el) track.detach(el);
        if (currentTrack === track) currentTrack = null;
      }
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      if (currentTrack && el) {
        currentTrack.detach(el);
      }
    };
  }, [share.isLocal, share.participantIdentity, room]);

  // Sync volume & mute changes to audio element and LiveKit RemoteAudioTrack
  useEffect(() => {
    const el = audioRef.current;
    const effectiveMuted = isDeafened || isStreamMuted;
    if (el) {
      el.volume = effectiveMuted ? 0 : Math.min(streamVolume / 100, 1.0);
      el.muted = effectiveMuted;
    }
    if (room && !share.isLocal) {
      const remote = room.getParticipantByIdentity(share.participantIdentity);
      const pub = remote?.getTrackPublication(Track.Source.ScreenShareAudio);
      if (pub?.track && typeof (pub.track as RemoteAudioTrack).setVolume === 'function') {
        (pub.track as RemoteAudioTrack).setVolume(effectiveMuted ? 0 : streamVolume / 100);
      }
    }
  }, [streamVolume, isStreamMuted, isDeafened, room, share.isLocal, share.participantIdentity]);

  // Seamless in-app CSS viewport fullscreen (avoids D3D11 swapchain reset & green screen DXGI error)
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight) {
        setResolution(`${videoWidth}x${videoHeight}`);
      }
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP failed:', e);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setShowControls(false)}
      className={`group flex items-center justify-center bg-black transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none border-0'
          : 'relative w-full h-full rounded-2xl overflow-hidden border border-border-subtle shadow-card'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={handleVideoMetadata}
        onDoubleClick={toggleFullscreen}
        className="w-full h-full object-contain cursor-pointer select-none"
        style={{
          backgroundColor: '#000000',
          colorScheme: 'dark',
          transform: 'translateZ(0)',
        }}
        title={isFullscreen ? 'Double-click to exit fullscreen (Esc)' : 'Double-click for fullscreen'}
      />

      {/* Dedicated audio element for remote screen share audio */}
      {!share.isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />
      )}

      {/* Floating Header Overlay Bar */}
      <div
        className={`absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Left Badge: Streamer Info & Quality */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-bg-main/90 backdrop-blur-md border border-border-subtle text-xs pointer-events-auto shadow-md">
          <div className="w-5 h-5 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-bold text-[10px]">
            {(share.participantName || 'S')[0].toUpperCase()}
          </div>
          <span className="font-semibold text-text-primary text-xs">
            {share.participantName}{share.isLocal ? ' (You)' : ''}
          </span>
          <span className="text-accent font-bold tracking-wider text-[9px] uppercase bg-accent-subtle px-1.5 py-0.5 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {isLocalPreviewPaused ? 'FROZEN PREVIEW' : 'LIVE'}
          </span>
          {resolution && (
            <span className="text-text-muted font-mono text-[9px] bg-bg-elevated px-1.5 py-0.5 rounded border border-border-subtle/50 hidden sm:inline">
              {resolution}
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-bg-main/90 backdrop-blur-md border border-border-subtle text-xs pointer-events-auto shadow-md">
          {/* Stream Volume Control */}
          <div className="flex items-center gap-1 mr-1">
            <button
              onClick={() => setIsStreamMuted(!isStreamMuted)}
              className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title={isStreamMuted ? 'Unmute Stream' : 'Mute Stream'}
            >
              {isStreamMuted || streamVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-destructive" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-accent" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="200"
              value={isStreamMuted ? 0 : streamVolume}
              onChange={(e) => {
                setStreamVolume(Number(e.target.value));
                setIsStreamMuted(false);
              }}
              className="w-16 h-1 bg-bg-elevated rounded-lg accent-accent cursor-pointer"
              title={`Stream volume: ${streamVolume}%`}
            />
            <span className="text-[10px] text-text-muted font-mono w-7 text-right">
              {isStreamMuted ? '0%' : `${streamVolume}%`}
            </span>
          </div>

          {/* Picture in Picture */}
          <button
            onClick={togglePiP}
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
            title="Picture in Picture"
          >
            <PictureInPicture className="w-3.5 h-3.5" />
          </button>

          {/* Focus Toggle in Multi-Stream mode */}
          {isMulti && onFocus && (
            <button
              onClick={onFocus}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isFocused
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title={isFocused ? 'Switch to Grid View' : 'Focus this Stream'}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          )}

          {/* If streaming own screen, add Freeze / Resume Preview button */}
          {share.isLocal && (
            <button
              onClick={() => {
                if (videoRef.current) {
                  if (isLocalPreviewPaused) {
                    videoRef.current.play().catch(() => {});
                    setIsLocalPreviewPaused(false);
                  } else {
                    videoRef.current.pause();
                    setIsLocalPreviewPaused(true);
                  }
                }
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer mr-1 ${
                isLocalPreviewPaused
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'bg-bg-elevated hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle'
              }`}
              title={
                isLocalPreviewPaused
                  ? 'Resume live stream preview'
                  : 'Freeze preview to inspect lossless sharpness without infinite mirror loop'
              }
            >
              {isLocalPreviewPaused ? (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-accent" />
                  <span className="text-accent hidden sm:inline">Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Freeze</span>
                </>
              )}
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Stop Button: If local, stop sharing; if remote, stop watching for this user */}
          {share.isLocal ? (
            <button
              onClick={onStopSharing}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-destructive hover:bg-destructive-hover text-white text-[11px] font-semibold transition-colors shadow-sm cursor-pointer ml-1"
              title="Stop Sharing Your Screen"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Stop Sharing</span>
            </button>
          ) : (
            <button
              onClick={onStopWatching}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-elevated hover:bg-destructive/80 hover:text-white text-text-secondary text-[11px] font-semibold border border-border-subtle transition-colors shadow-sm cursor-pointer ml-1"
              title="Stop watching this live stream (بستن لایو برای من)"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>Stop Watching</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom ESC exit hint when in Fullscreen */}
      {isFullscreen && (
        <div
          className={`absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-bg-main/90 backdrop-blur-md border border-border-subtle text-xs text-text-muted z-20 pointer-events-none shadow-2xl transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span>Press</span>
          <kbd className="px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle text-accent font-mono text-xs font-bold shadow-sm">
            ESC
          </kbd>
          <span>or double-click to exit fullscreen</span>
        </div>
      )}
    </div>
  );
};

interface ScreenStageProps {
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
  onOpenInvite: () => void;
  onOpenServers?: () => void;
}

export const ScreenStage: React.FC<ScreenStageProps> = ({
  onOpenScreenShareModal,
  onOpenSettings,
  onOpenInvite,
  onOpenServers,
}) => {
  const [copied, setCopied] = useState(false);

  const {
    availableScreenShares,
    watchedScreenShareIds,
    focusedScreenShareId,
    startWatchingStream,
    stopWatchingStream,
    setFocusedScreenShare,
    stopScreenShare,
    connectionState,
    currentPing,
    isLocallySpeaking,
    connect,
    disconnect,
  } = useLiveKitStore();

  const { inputMode, pushToTalkKey } = useSettingsStore();
  const { getSelectedRoom, activeRoomId } = useRoomStore();
  const {
    channels,
    activeChannelId,
    activeVoiceChannelId,
    setActiveVoiceChannel,
    setJoiningVoiceChannel,
  } = useServerStore();
  const { user } = useAuthStore();

  const selectedRoom = getSelectedRoom();
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const channelName = activeChannel?.name || selectedRoom?.name || 'Voice Channel';

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting;

  const isRoomActive =
    (isConnected &&
      ((activeChannel && activeVoiceChannelId === activeChannel.id) ||
        (selectedRoom && activeRoomId === selectedRoom.id))) ||
    false;

  // Streams that the user is actively watching
  const watchedShares = availableScreenShares.filter((s) =>
    watchedScreenShareIds.has(s.participantIdentity)
  );

  // Available streams that the user is NOT currently watching
  const unwatchedShares = availableScreenShares.filter(
    (s) => !s.isLocal && !watchedScreenShareIds.has(s.participantIdentity)
  );

  const handleCopyInviteLink = async () => {
    try {
      if (activeChannel?.serverId) {
        const invite = await api.createInvite(activeChannel.serverId);
        const origin =
          typeof window !== 'undefined' &&
          window.location.origin &&
          !window.location.origin.startsWith('file:') &&
          !window.location.origin.includes('localhost') &&
          !window.location.origin.includes('127.0.0.1')
            ? window.location.origin
            : DEFAULT_PRODUCTION_WEB;
        const inviteUrl = `${origin}#invite=${invite.code}`;
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        onOpenInvite();
      }
    } catch {
      onOpenInvite();
    }
  };

  const handleJoinCurrentRoom = async () => {
    if (!user) {
      alert('Please log in first to join voice');
      return;
    }
    const targetId = activeChannel?.id || activeVoiceChannelId || selectedRoom?.id;
    if (!targetId) return;

    try {
      setJoiningVoiceChannel(targetId);
      const joinData = await api.joinVoiceChannel(targetId);
      setActiveVoiceChannel(targetId);
      const ok = await connect(joinData.livekitUrl, joinData.token);
      setJoiningVoiceChannel(null);
      if (!ok) {
        const lastErr = useLiveKitStore.getState().error;
        console.warn('LiveKit connect returned false:', lastErr);
      }
    } catch (err: any) {
      console.error('Failed to join current voice room:', err);
      setJoiningVoiceChannel(null);
      alert(err.message || 'Failed to join voice channel');
    }
  };

  // Determine what stream to render if focused
  const focusedShare = focusedScreenShareId
    ? watchedShares.find((s) => s.participantIdentity === focusedScreenShareId)
    : null;

  return (
    <div className="flex-1 h-full bg-bg-main flex flex-col relative overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-14 px-6 border-b border-border-subtle flex items-center justify-between shrink-0 bg-bg-secondary/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${isRoomActive ? 'text-accent animate-pulse' : 'text-text-muted'}`}
            />
            <h1 className="text-base font-semibold text-text-primary tracking-wide">
              {channelName}
            </h1>
          </div>

          {(activeChannel || selectedRoom) && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bg-elevated border border-border-subtle text-xs text-text-secondary">
              <Users className="w-3.5 h-3.5" />
              <span>{isRoomActive ? 'Connected' : 'Voice Channel'}</span>
            </div>
          )}

          {/* Connection Status Badge */}
          {isRoomActive ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-subtle text-accent text-xs font-semibold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Live Room
              </span>

              {/* Real-Time Ping Badge (Accurate WebRTC RTT) */}
              <button
                onClick={onOpenServers}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-mono text-accent transition-all cursor-pointer"
                title="Active WebRTC RTT Latency to Frankfurt Server"
              >
                <Zap className="w-3 h-3 text-accent" />
                <span>{currentPing !== null ? `${currentPing} ms` : 'Testing...'}</span>
              </button>

              {/* Push To Talk Status Pill */}
              {inputMode === 'push-to-talk' && (
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    isLocallySpeaking
                      ? 'bg-accent text-bg-main border-accent font-bold shadow-[0_0_8px_rgba(196,211,106,0.5)]'
                      : 'bg-bg-elevated border-border-subtle text-text-secondary'
                  }`}
                  title={`Push-to-Talk active. Hold [${pushToTalkKey}] to speak.`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isLocallySpeaking ? 'bg-bg-main animate-ping' : 'bg-text-muted'
                    }`}
                  />
                  {isLocallySpeaking ? 'Transmitting' : `PTT: [${pushToTalkKey}]`}
                </span>
              )}
            </div>
          ) : isConnecting ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              Connecting...
            </span>
          ) : (
            <span className="text-xs text-text-muted">Disconnected</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isRoomActive && (activeChannel || selectedRoom) && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleJoinCurrentRoom}
                disabled={isConnecting}
                className="px-3.5 py-1.5 rounded-xl bg-highlight hover:bg-white text-highlight-text font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Join Voice Channel</span>
                  </>
                )}
              </button>
              {isConnecting && (
                <button
                  onClick={() => disconnect()}
                  className="px-2.5 py-1.5 rounded-xl bg-destructive/15 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                  title="Cancel Connection / Disconnect"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              )}
            </div>
          )}

          <button
            onClick={handleCopyInviteLink}
            className="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary flex items-center gap-1.5 transition-all cursor-pointer"
            title="Copy Invite Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-accent" />
                <span className="text-accent">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-text-secondary" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unwatched Screen Share Banner when in Screen Stage */}
      {unwatchedShares.length > 0 && watchedShares.length > 0 && (
        <div className="bg-red-500/15 border-b border-red-500/30 px-6 py-2 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            <span className="text-xs text-text-primary font-medium">
              <span className="font-bold text-red-400">
                {unwatchedShares.map((s) => s.participantName).join(', ')}
              </span>{' '}
              is also sharing screen!
            </span>
          </div>
          <div className="flex items-center gap-2">
            {unwatchedShares.map((s) => (
              <button
                key={s.participantIdentity}
                onClick={() => startWatchingStream(s.participantIdentity)}
                className="px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Watch {s.participantName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multi-Stream Switcher Bar (Shown when 2+ streams watched) */}
      {watchedShares.length > 1 && (
        <div className="bg-bg-secondary/60 border-b border-border-subtle px-6 py-1.5 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setFocusedScreenShare(null)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                !focusedShare
                  ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                  : 'bg-bg-elevated hover:bg-bg-hover text-text-secondary'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Split View ({watchedShares.length})</span>
            </button>

            {watchedShares.map((s) => {
              const isSelected = focusedShare?.participantIdentity === s.participantIdentity;
              return (
                <button
                  key={s.participantIdentity}
                  onClick={() => setFocusedScreenShare(s.participantIdentity)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-highlight text-highlight-text font-bold shadow-sm'
                      : 'bg-bg-elevated hover:bg-bg-hover text-text-secondary'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span>{s.participantName}</span>
                </button>
              );
            })}
          </div>

          <span className="text-[11px] text-text-muted font-mono hidden md:inline">
            Multi-Stream Live
          </span>
        </div>
      )}

      {/* Main Center Stage */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 bg-bg-main overflow-hidden">
        {watchedShares.length > 0 ? (
          /* Multi-stream / Single-stream View */
          focusedShare ? (
            /* Single Focused Stream from multi-stream switcher */
            <div className="w-full h-full">
              <StreamTile
                share={focusedShare}
                isFocused={true}
                onFocus={() => setFocusedScreenShare(null)}
                onStopWatching={() => stopWatchingStream(focusedShare.participantIdentity)}
                onStopSharing={stopScreenShare}
                isMulti={watchedShares.length > 1}
              />
            </div>
          ) : watchedShares.length === 1 ? (
            /* Exactly 1 stream watched */
            <div className="w-full h-full">
              <StreamTile
                share={watchedShares[0]}
                isFocused={false}
                onStopWatching={() => stopWatchingStream(watchedShares[0].participantIdentity)}
                onStopSharing={stopScreenShare}
                isMulti={false}
              />
            </div>
          ) : (
            /* Split Grid View for 2+ Streams */
            <div
              className={`w-full h-full grid gap-3 ${
                watchedShares.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {watchedShares.map((share) => (
                <div key={share.participantIdentity} className="w-full h-full min-h-[220px]">
                  <StreamTile
                    share={share}
                    isFocused={false}
                    onFocus={() => setFocusedScreenShare(share.participantIdentity)}
                    onStopWatching={() => stopWatchingStream(share.participantIdentity)}
                    onStopSharing={stopScreenShare}
                    isMulti={true}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          /* Discord Voice Users Grid */
          <VoiceGrid
            onOpenScreenShareModal={onOpenScreenShareModal}
            onJoinVoice={handleJoinCurrentRoom}
            isRoomActive={isRoomActive}
          />
        )}

        {/* Floating Call Control Bar (Docked at bottom of stage) */}
        <CallControlBar
          onOpenScreenShareModal={onOpenScreenShareModal}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {/* Bottom Participant Strip */}
      {isRoomActive && <ParticipantStrip />}
    </div>
  );
};
