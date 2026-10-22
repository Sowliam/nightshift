import { create } from 'zustand';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  LocalParticipant,
  RemoteParticipant,
  ConnectionState,
  LocalVideoTrack,
  TrackPublication,
} from 'livekit-client';
import { useSettingsStore } from './settings.store';

interface LiveKitState {
  room: Room | null;
  connectionState: ConnectionState;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  localParticipant: LocalParticipant | null;
  remoteParticipants: RemoteParticipant[];
  activeSpeakers: Set<string>;
  activeScreenTrack: TrackPublication | null;
  screenSharerIdentity: string | null;
  screenSharerName: string | null;
  error: string | null;

  connect: (url: string, token: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  startScreenShare: (sourceId?: string) => Promise<boolean>;
  stopScreenShare: () => Promise<void>;
  setAudioInputDevice: (deviceId: string) => Promise<void>;
  setAudioOutputDevice: (deviceId: string) => Promise<void>;
}

export const useLiveKitStore = create<LiveKitState>((set, get) => {
  let activeCustomScreenTrack: LocalVideoTrack | null = null;

  const updateScreenShareState = (room: Room) => {
    // Check if local participant is sharing screen
    const localScreenPub = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (pub) => pub.source === Track.Source.ScreenShare
    );

    if (localScreenPub && localScreenPub.track) {
      set({
        isScreenSharing: true,
        activeScreenTrack: localScreenPub,
        screenSharerIdentity: room.localParticipant.identity,
        screenSharerName: room.localParticipant.name || 'You',
      });
      return;
    }

    // Check if any remote participant is sharing screen
    for (const remote of room.remoteParticipants.values()) {
      const screenPub = Array.from(remote.videoTrackPublications.values()).find(
        (pub) => pub.source === Track.Source.ScreenShare && pub.isSubscribed && pub.track
      );
      if (screenPub && screenPub.track) {
        set({
          isScreenSharing: false, // Local user is not the one sharing
          activeScreenTrack: screenPub,
          screenSharerIdentity: remote.identity,
          screenSharerName: remote.name || remote.identity,
        });
        return;
      }
    }

    // No screen share active
    set({
      isScreenSharing: false,
      activeScreenTrack: null,
      screenSharerIdentity: null,
      screenSharerName: null,
    });
  };

  const applyDeafenToRemoteTracks = (room: Room, deafened: boolean) => {
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && pub.track.mediaStreamTrack) {
          pub.track.mediaStreamTrack.enabled = !deafened;
        }
      });
    });
  };

  return {
    room: null,
    connectionState: ConnectionState.Disconnected,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    localParticipant: null,
    remoteParticipants: [],
    activeSpeakers: new Set(),
    activeScreenTrack: null,
    screenSharerIdentity: null,
    screenSharerName: null,
    error: null,

    connect: async (url: string, token: string) => {
      // Clean up previous room if any
      await get().disconnect();

      set({ connectionState: ConnectionState.Connecting, error: null });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Set up room event listeners
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        set({ connectionState: state });
      });

      room.on(RoomEvent.Connected, () => {
        set({
          connectionState: ConnectionState.Connected,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
        });
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
      });

      room.on(RoomEvent.ParticipantDisconnected, () => {
        set({ remoteParticipants: Array.from(room.remoteParticipants.values()) });
        updateScreenShareState(room);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const speakingSet = new Set<string>();
        speakers.forEach((s) => speakingSet.add(s.identity));
        if (room.localParticipant.isSpeaking) {
          speakingSet.add(room.localParticipant.identity);
        }
        set({ activeSpeakers: speakingSet });
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          // Attach audio to element so it plays
          const element = track.attach();
          element.autoplay = true;

          // If currently deafened, mute the track immediately
          if (get().isDeafened && track.mediaStreamTrack) {
            track.mediaStreamTrack.enabled = false;
          }
        }
        updateScreenShareState(room);
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        updateScreenShareState(room);
      });

      room.on(RoomEvent.LocalTrackPublished, () => {
        updateScreenShareState(room);
      });

      room.on(RoomEvent.LocalTrackUnpublished, () => {
        updateScreenShareState(room);
      });

      try {
        await room.connect(url, token);

        // Apply audio settings
        const settings = useSettingsStore.getState();
        if (settings.audioInputDeviceId && settings.audioInputDeviceId !== 'default') {
          try {
            await room.switchActiveDevice('audioinput', settings.audioInputDeviceId);
          } catch (e) {
            console.warn('Could not switch to preferred audio input device:', e);
          }
        }

        // Enable microphone by default unless muted
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          set({ isMuted: false });
        } catch (micErr: any) {
          console.warn('Microphone permission or hardware error:', micErr);
          set({ isMuted: true, error: 'Could not access microphone: ' + (micErr.message || 'Permission denied') });
        }

        set({
          room,
          localParticipant: room.localParticipant,
          remoteParticipants: Array.from(room.remoteParticipants.values()),
          connectionState: ConnectionState.Connected,
        });

        return true;
      } catch (err: any) {
        console.error('Failed to connect to LiveKit room:', err);
        set({
          error: err.message || 'Failed to connect to room',
          connectionState: ConnectionState.Disconnected,
        });
        return false;
      }
    },

    disconnect: async () => {
      const { room } = get();
      if (activeCustomScreenTrack) {
        activeCustomScreenTrack.stop();
        activeCustomScreenTrack = null;
      }

      if (room) {
        try {
          await room.disconnect(true);
        } catch (e) {
          console.warn('Error during room disconnect:', e);
        }
      }

      set({
        room: null,
        localParticipant: null,
        remoteParticipants: [],
        activeSpeakers: new Set(),
        activeScreenTrack: null,
        screenSharerIdentity: null,
        screenSharerName: null,
        isScreenSharing: false,
        connectionState: ConnectionState.Disconnected,
      });
    },

    toggleMute: async () => {
      const { room, isMuted } = get();
      if (!room || !room.localParticipant) return;

      const newMuted = !isMuted;
      try {
        await room.localParticipant.setMicrophoneEnabled(!newMuted);
        set({ isMuted: newMuted });
      } catch (err: any) {
        console.error('Failed to toggle microphone state:', err);
      }
    },

    toggleDeafen: async () => {
      const { room, isDeafened } = get();
      const newDeafened = !isDeafened;

      set({ isDeafened: newDeafened });
      useSettingsStore.getState().setDeafened(newDeafened);

      if (room) {
        applyDeafenToRemoteTracks(room, newDeafened);
      }
    },

    startScreenShare: async (sourceId?: string) => {
      const { room } = get();
      if (!room || !room.localParticipant) return false;

      try {
        if (sourceId && (window as any).nightshift?.isElectron) {
          // Native Electron Desktop Capturer stream
          const stream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1920,
                maxFrameRate: 30,
              },
            },
          });

          const videoTrack = stream.getVideoTracks()[0];
          videoTrack.onended = () => {
            get().stopScreenShare();
          };

          const localTrack = new LocalVideoTrack(videoTrack);
          activeCustomScreenTrack = localTrack;

          await room.localParticipant.publishTrack(localTrack, {
            source: Track.Source.ScreenShare,
          });
        } else {
          // Standard browser getDisplayMedia fallback
          await room.localParticipant.setScreenShareEnabled(true, {
            audio: false,
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: 30,
            },
          });
        }

        updateScreenShareState(room);
        return true;
      } catch (err: any) {
        console.error('Failed to start screen share:', err);
        set({ error: err.message || 'Screen sharing cancelled or failed' });
        return false;
      }
    },

    stopScreenShare: async () => {
      const { room } = get();
      if (!room || !room.localParticipant) return;

      try {
        if (activeCustomScreenTrack) {
          await room.localParticipant.unpublishTrack(activeCustomScreenTrack);
          activeCustomScreenTrack.stop();
          activeCustomScreenTrack = null;
        } else {
          await room.localParticipant.setScreenShareEnabled(false);
        }
      } catch (err) {
        console.warn('Error stopping screen share:', err);
      } finally {
        updateScreenShareState(room);
      }
    },

    setAudioInputDevice: async (deviceId: string) => {
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audioinput', deviceId);
      }
    },

    setAudioOutputDevice: async (deviceId: string) => {
      const { room } = get();
      if (room) {
        await room.switchActiveDevice('audiooutput', deviceId);
      }
    },
  };
});
