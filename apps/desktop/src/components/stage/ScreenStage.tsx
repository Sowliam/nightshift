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
  channelName: string;
  onOpenScreenShareModal: () => void;
  onOpenSettings: () => void;
}

const StreamTile: React.FC<StreamTileProps> = ({
  share,
  isFocused,
  onFocus,
  onStopWatching,
  onStopSharing,
  isMulti,
  channelName,
  onOpenScreenShareModal,
  onOpenSettings,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { room, isDeafened, currentScreenOptions } = useLiveKitStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamVolume, setStreamVolume] = useState(100);
  const [isStreamMuted, setIsStreamMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [resolution, setResolution] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringControlsRef = useRef(false);

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

    const remote = room.getParticipantByIdentity(share.participantIdentity);
    if (remote) {
      const pub = remote.getTrackPublication(Track.Source.ScreenShareAudio);
      if (pub?.track) {
        attachAudioTrack(pub.track);
      }
    }

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

  // Sync volume & mute changes
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

  // Seamless in-app CSS viewport fullscreen (Escape to exit)
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

  const resetHideTimer = (delay = 3000) => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isHoveringControlsRef.current) return;
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isHoveringControlsRef.current) {
        setShowControls(false);
      }
    }, delay);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    resetHideTimer();
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
    setIsFullscreen(!isFullscreen);
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

  // Derive display quality string
  const displayRes = resolution
    ? parseInt(resolution.split('x')[1] || '720') >= 1440
      ? '1440p'
      : parseInt(resolution.split('x')[1] || '720') >= 1080
      ? '1080p'
      : '720p'
    : currentScreenOptions?.resolution?.toUpperCase() || '720p';
  const displayFps = `${currentScreenOptions?.frameRate || 30}FPS`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (!isHoveringControlsRef.current) {
          resetHideTimer(1200);
        }
      }}
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

      {/* Audio element for remote screen share audio */}
      {!share.isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          className="hidden"
        />
      )}

      {/* Discord Top Floating Header Bar */}
      <div
        onMouseEnter={() => {
          isHoveringControlsRef.current = true;
          setShowControls(true);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        }}
        onMouseLeave={() => {
          isHoveringControlsRef.current = false;
          resetHideTimer(3000);
        }}
        className={`absolute top-3 left-3 right-3 flex items-center justify-between z-30 transition-all duration-200 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left Badge: Channel Name • Avatar & Streamer Name */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#111214]/90 backdrop-blur-md border border-[#2b2d31] text-xs shadow-xl">
          <Volume2 className="w-4 h-4 text-[#5865F2]" />
          <span className="font-semibold text-white text-xs">{channelName}</span>
          <span className="text-[#80848e] text-xs">•</span>
          <div className="w-5 h-5 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-bold text-[10px]">
            {(share.participantName || 'S')[0].toUpperCase()}
          </div>
          <span className="font-medium text-[#dbdee1] text-xs">
            {share.participantName}'s Screen {share.isLocal ? '(You)' : ''}
          </span>
        </div>

        {/* Right Controls: Quality Badge + Audio + PiP + Grid + Fullscreen + Stop */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111214]/90 backdrop-blur-md border border-[#2b2d31] text-xs shadow-xl">
          {/* Quality & LIVE indicator pill */}
          <div className="flex items-center gap-1.5 bg-[#2b2d31] border border-[#3f4147] px-2 py-1 rounded-lg">
            <span className="text-[11px] font-mono font-bold text-white tracking-wide">
              {displayRes} {displayFps}
            </span>
            <span className="flex items-center gap-1 bg-[#da373c] text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={() => setIsStreamMuted(!isStreamMuted)}
              className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#313338] transition-colors cursor-pointer"
              title={isStreamMuted ? 'Unmute Stream' : 'Mute Stream'}
            >
              {isStreamMuted || streamVolume === 0 ? (
                <VolumeX className="w-4 h-4 text-[#da373c]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#dbdee1]" />
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
              className="w-16 h-1 bg-[#313338] rounded-lg accent-[#5865F2] cursor-pointer"
              title={`Stream volume: ${streamVolume}%`}
            />
          </div>

          {/* Picture in Picture */}
          <button
            onClick={togglePiP}
            className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#313338] transition-colors cursor-pointer"
            title="Picture in Picture"
          >
            <PictureInPicture className="w-4 h-4" />
          </button>

          {/* Grid View toggle in Multi-stream */}
          {isMulti && onFocus && (
            <button
              onClick={onFocus}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isFocused
                  ? 'bg-[#5865F2] text-white'
                  : 'text-[#949ba4] hover:text-white hover:bg-[#313338]'
              }`}
              title={isFocused ? 'Switch to Grid View' : 'Focus this Stream'}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen Toggle (only in non-fullscreen) */}
          {!isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-[#949ba4] hover:text-white hover:bg-[#313338] transition-colors cursor-pointer"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* Stop Button: Local = Stop Sharing, Remote = Stop Watching */}
          {share.isLocal ? (
            <button
              onClick={onStopSharing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#da373c] hover:bg-[#a1282c] text-white text-xs font-semibold transition-all shadow-md cursor-pointer ml-1"
              title="Stop Sharing Your Screen"
            >
              <StopCircle className="w-4 h-4" />
              <span>Stop Sharing</span>
            </button>
          ) : (
            <button
              onClick={onStopWatching}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#2b2d31] hover:bg-[#da373c] text-[#dbdee1] hover:text-white text-xs font-semibold border border-[#3f4147] transition-all shadow-md cursor-pointer ml-1"
              title="Stop watching this live stream"
            >
              <EyeOff className="w-4 h-4" />
              <span>Stop Watching</span>
            </button>
          )}
        </div>
      </div>

      {/* Discord Floating Call Dock at Bottom Center when Fullscreen */}
      {isFullscreen && (
        <div
          onMouseEnter={() => {
            isHoveringControlsRef.current = true;
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          }}
          onMouseLeave={() => {
            isHoveringControlsRef.current = false;
            resetHideTimer(3000);
          }}
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 transition-all duration-200 ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <CallControlBar
            onOpenScreenShareModal={onOpenScreenShareModal}
            onOpenSettings={onOpenSettings}
            onToggleGrid={isMulti ? onFocus : undefined}
            isGrid={!isFocused}
          />
        </div>
      )}

      {/* Discord Exit Full Screen Button at Bottom Right */}
      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          onMouseEnter={() => {
            isHoveringControlsRef.current = true;
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          }}
          onMouseLeave={() => {
            isHoveringControlsRef.current = false;
            resetHideTimer(3000);
          }}
          className={`absolute bottom-6 right-6 z-30 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1e1f22]/95 backdrop-blur-md border border-[#313338] hover:border-[#5865F2] hover:bg-[#2b2d31] text-xs font-semibold text-[#dbdee1] hover:text-white shadow-2xl transition-all duration-200 cursor-pointer ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          title="Exit Full Screen (Esc)"
        >
          <span>Exit Full Screen</span>
          <Minimize2 className="w-4 h-4 text-[#5865F2]" />
        </button>
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
  const { getSelectedRoom } = useRoomStore();
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

  const isRoomActive = isConnected;

  // Keep activeVoiceChannelId in sync whenever user is connected to voice
  useEffect(() => {
    if (isConnected && activeChannel?.type === 'voice' && !activeVoiceChannelId) {
      setActiveVoiceChannel(activeChannel.id);
    }
  }, [isConnected, activeChannel, activeVoiceChannelId, setActiveVoiceChannel]);

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
      {/* Voice Channel Header */}
      <div className="h-12 px-5 border-b border-[#232428] flex items-center justify-between shrink-0 bg-[#0e0f11]/85 backdrop-blur-md z-10 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${isRoomActive ? 'text-[#23a55a] animate-pulse' : 'text-[#949ba4]'}`}
            />
            <h1 className="text-sm font-bold text-[#f2f3f5] tracking-wide">
              {channelName}
            </h1>
          </div>

          {(activeChannel || selectedRoom) && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#18191c] border border-[#232428] text-xs text-[#949ba4]">
              <Users className="w-3.5 h-3.5" />
              <span>{isRoomActive ? 'Connected' : 'Voice Channel'}</span>
            </div>
          )}

          {/* Connection Status Badge */}
          {isRoomActive ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#23a55a]/15 text-[#23a55a] text-[11px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#23a55a] animate-pulse" />
                Live Room
              </span>

              {/* Real-Time Ping Badge */}
              <button
                onClick={onOpenServers}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#18191c] hover:bg-[#2b2d31] border border-[#232428] hover:border-[#35373c] text-[11px] font-mono text-[#f2f3f5] transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Active WebRTC RTT Latency"
              >
                <Zap
                  className={`w-3 h-3 ${
                    currentPing === null
                      ? 'text-[#52B788]'
                      : currentPing < 140
                      ? 'text-[#52B788]'
                      : currentPing <= 350
                      ? 'text-amber-400'
                      : 'text-destructive'
                  }`}
                />
                <span
                  className={
                    currentPing === null
                      ? 'text-[#f2f3f5]'
                      : currentPing < 140
                      ? 'text-[#52B788]'
                      : currentPing <= 350
                      ? 'text-amber-400'
                      : 'text-destructive'
                  }
                >
                  {currentPing !== null ? `${currentPing} ms` : 'Testing...'}
                </span>
              </button>

              {/* Push To Talk Status Pill */}
              {inputMode === 'push-to-talk' && (
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    isLocallySpeaking
                      ? 'bg-[#52B788] text-black border-[#52B788] font-bold shadow-sm'
                      : 'bg-[#18191c] border-[#232428] text-[#949ba4]'
                  }`}
                  title={`Push-to-Talk active. Hold [${pushToTalkKey}] to speak.`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isLocallySpeaking ? 'bg-black animate-ping' : 'bg-[#949ba4]'
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
            <span className="text-xs text-[#949ba4]">Disconnected</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {!isRoomActive && (activeChannel || selectedRoom) && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleJoinCurrentRoom}
                disabled={isConnecting}
                className="px-3.5 py-1.5 rounded-xl bg-highlight hover:bg-white text-highlight-text font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
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
                  className="px-2.5 py-1.5 rounded-xl bg-destructive/15 hover:bg-destructive text-destructive hover:text-white border border-destructive/30 text-xs font-semibold flex items-center gap-1 transition-all hover:scale-105 active:scale-95 cursor-pointer"
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
            className="px-3 py-1.5 rounded-xl bg-[#18191c] hover:bg-[#2b2d31] border border-[#232428] hover:border-[#35373c] text-xs font-medium text-[#f2f3f5] flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Copy Invite Link"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#52B788]" />
                <span className="text-[#52B788]">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#949ba4]" />
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
                channelName={channelName}
                onOpenScreenShareModal={onOpenScreenShareModal}
                onOpenSettings={onOpenSettings}
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
                channelName={channelName}
                onOpenScreenShareModal={onOpenScreenShareModal}
                onOpenSettings={onOpenSettings}
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
                    channelName={channelName}
                    onOpenScreenShareModal={onOpenScreenShareModal}
                    onOpenSettings={onOpenSettings}
                  />
                </div>
              ))}
            </div>
          )
        ) : (
          /* Discord Voice Users Grid */
          <div className="w-full h-full flex-1 flex items-center justify-center overflow-hidden pb-20">
            <VoiceGrid
              onOpenScreenShareModal={onOpenScreenShareModal}
              onJoinVoice={handleJoinCurrentRoom}
              isRoomActive={isRoomActive}
            />
          </div>
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
