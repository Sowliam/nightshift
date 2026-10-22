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
} from 'lucide-react';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useServerStore } from '../../stores/server.store';
import { useRoomStore } from '../../stores/room.store';
import { useAuthStore } from '../../stores/auth.store';
import { useSettingsStore } from '../../stores/settings.store';
import { ParticipantStrip } from './ParticipantStrip';
import { VoiceGrid } from '../voice/VoiceGrid';
import { CallControlBar } from '../controls/CallControlBar';
import { ConnectionState } from 'livekit-client';
import { api } from '../../lib/api';

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
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [streamVolume, setStreamVolume] = useState(100);
  const [isStreamMuted, setIsStreamMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [streamResolution, setStreamResolution] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    activeScreenTrack,
    screenSharerName,
    screenSharerIdentity,
    currentScreenOptions,
    isScreenSharing,
    connectionState,
    currentPing,
    isLocallySpeaking,
    connect,
    stopScreenShare,
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

  const isMyScreen = isScreenSharing && (!screenSharerIdentity || screenSharerIdentity === user?.id);

  // Attach active screen video track to HTMLVideoElement
  useEffect(() => {
    if (!videoRef.current) return;

    if (activeScreenTrack && activeScreenTrack.track) {
      activeScreenTrack.track.attach(videoRef.current);
    }

    return () => {
      if (activeScreenTrack && activeScreenTrack.track && videoRef.current) {
        activeScreenTrack.track.detach(videoRef.current);
      }
    };
  }, [activeScreenTrack]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Update video volume when slider changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isStreamMuted ? 0 : streamVolume / 100;
      videoRef.current.muted = isStreamMuted;
    }
  }, [streamVolume, isStreamMuted]);

  // Auto-hide stream controls on mouse inactivity in video area
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      if (videoWidth && videoHeight) {
        setStreamResolution(`${videoWidth}x${videoHeight}`);
      }
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (stageContainerRef.current) {
          await stageContainerRef.current.requestFullscreen();
        }
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP toggle failed:', err);
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      if (activeChannel?.serverId) {
        const invite = await api.createInvite(activeChannel.serverId);
        const inviteUrl = `${window.location.origin}#invite=${invite.code}`;
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

              {/* Real-Time Ping Badge */}
              <button
                onClick={onOpenServers}
                className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-mono text-accent transition-all cursor-pointer"
                title="Active RTT Latency - Click to view server ping monitor"
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
          )}

          <button
            onClick={handleCopyInviteLink}
            className="px-3 py-1.5 rounded-lg bg-bg-elevated hover:bg-bg-hover border border-border-subtle hover:border-accent text-xs font-medium text-text-primary flex items-center gap-1.5 transition-all"
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

      {/* Center Screen-sharing Stage */}
      <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 bg-bg-main overflow-hidden">
        {activeScreenTrack ? (
          /* Live Screen Share View with Native Fullscreen & Discord Overlay */
          <div
            ref={stageContainerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setShowControls(false)}
            className={`group relative w-full h-full rounded-xl overflow-hidden bg-black flex items-center justify-center border border-border-subtle shadow-card transition-all ${
              isFullscreen ? 'rounded-none border-0' : ''
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              onLoadedMetadata={handleVideoMetadata}
              onDoubleClick={toggleFullscreen}
              className="w-full h-full object-contain cursor-pointer"
              title="Double click to toggle fullscreen"
            />

            {/* Discord-Style Floating Header Overlay Bar */}
            <div
              className={`absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none transition-opacity duration-300 ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {/* Left Badge: Streamer Info & Quality */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-bg-main/85 backdrop-blur-md border border-border-subtle text-xs pointer-events-auto shadow-md">
                <div className="w-6 h-6 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent font-bold text-[11px]">
                  {(screenSharerName || 'S')[0].toUpperCase()}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">
                    {screenSharerName || 'Participant'}'s Screen
                  </span>
                  <span className="text-accent font-bold tracking-wider text-[10px] uppercase bg-accent-subtle px-1.5 py-0.5 rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    LIVE
                  </span>
                  {currentScreenOptions && (
                    <span className="text-text-muted font-mono text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded border border-border-subtle/50">
                      {currentScreenOptions.resolution} • {currentScreenOptions.frameRate}fps
                    </span>
                  )}
                  {streamResolution && !currentScreenOptions && (
                    <span className="text-text-muted font-mono text-[10px] bg-bg-elevated px-1.5 py-0.5 rounded border border-border-subtle/50">
                      {streamResolution}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Controls: Volume, PiP, Fullscreen, Stop */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-main/85 backdrop-blur-md border border-border-subtle text-xs pointer-events-auto shadow-md">
                {/* Stream Volume Control */}
                <div className="flex items-center gap-1.5 mr-2">
                  <button
                    onClick={() => setIsStreamMuted(!isStreamMuted)}
                    className="p-1 rounded text-text-secondary hover:text-text-primary transition-colors"
                    title={isStreamMuted ? 'Unmute Stream' : 'Mute Stream'}
                  >
                    {isStreamMuted || streamVolume === 0 ? (
                      <VolumeX className="w-4 h-4 text-destructive" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-accent" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isStreamMuted ? 0 : streamVolume}
                    onChange={(e) => {
                      setStreamVolume(Number(e.target.value));
                      setIsStreamMuted(false);
                    }}
                    className="w-16 h-1.5 bg-bg-elevated rounded-lg accent-accent cursor-pointer"
                    title={`Stream volume: ${streamVolume}%`}
                  />
                </div>

                {/* Picture in Picture */}
                <button
                  onClick={togglePiP}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  title="Picture in Picture (PiP)"
                >
                  <PictureInPicture className="w-4 h-4" />
                </button>

                {/* True Fullscreen Toggle */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 text-accent" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>

                {/* If Local User: Stop Streaming Button */}
                {isMyScreen && (
                  <button
                    onClick={stopScreenShare}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive hover:bg-destructive-hover text-white text-xs font-semibold ml-1 transition-colors shadow-sm"
                    title="Stop Streaming"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Stop Sharing
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Discord Voice Users Grid */
          <VoiceGrid
            onOpenScreenShareModal={onOpenScreenShareModal}
            onJoinVoice={handleJoinCurrentRoom}
            isRoomActive={isRoomActive}
          />
        )}

        {/* Floating Call Control Bar (Docked at bottom of stage) */}
        {!isFullscreen && (
          <CallControlBar
            onOpenScreenShareModal={onOpenScreenShareModal}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>

      {/* Bottom Participant Strip */}
      {isRoomActive && !isFullscreen && <ParticipantStrip />}
    </div>
  );
};
