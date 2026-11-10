import { create } from 'zustand';
import { sounds } from '../services/sound.service';
import { InputProfileType } from '@nightshift/shared';

interface SettingsState {
  // Input Profile matching Discord screenshot
  inputProfile: InputProfileType;
  autoSensitivity: boolean;
  sensitivityThreshold: number; // 0-100
  noiseSuppression: 'none' | 'standard' | 'krisp';
  echoCancellation: boolean;
  noiseAmount: number;
  echoAmount: number;
  pushToTalk: boolean;
  pushToTalkKey: string;

  // Audio I/O devices
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  inputVolume: number;
  outputVolume: number;

  // Self Mute / Deafen
  isSelfMuted: boolean;
  isSelfDeafened: boolean;

  // Sound effects
  soundEffectsEnabled: boolean;
  soundVolume: number;
  pttSoundEnabled: boolean;
  joinLeaveSoundEnabled: boolean;
  muteSoundEnabled: boolean;
  uiSoundEnabled: boolean;

  // Available hardware
  availableInputs: MediaDeviceInfo[];
  availableOutputs: MediaDeviceInfo[];

  // Compatibility fields for LiveKit voice engine and global hotkeys
  inputMode: 'voice-activity' | 'push-to-talk';
  voiceActivationThreshold: number;
  participantVolumes: Record<string, number>;
  localMutedUsers: Record<string, boolean>;
  soundboardVolumes: Record<string, number>;
  localMutedSoundboards: Record<string, boolean>;

  // Actions
  refreshDevices: () => Promise<void>;
  syncSystemDevices: () => Promise<{ inputChanged: boolean; outputChanged: boolean }>;
  setInputProfile: (profile: InputProfileType) => void;
  setAutoSensitivity: (val: boolean) => void;
  setSensitivityThreshold: (val: number) => void;
  setNoiseSuppression: (val: 'none' | 'standard' | 'krisp') => void;
  setEchoCancellation: (val: boolean) => void;
  setNoiseAmount: (val: number) => void;
  setEchoAmount: (val: number) => void;
  setPushToTalk: (val: boolean) => void;
  setPushToTalkKey: (key: string) => void;
  setInputMode: (mode: 'voice-activity' | 'push-to-talk') => void;
  setVoiceActivationThreshold: (threshold: number) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setLocalMuted: (userId: string, muted: boolean) => void;
  toggleLocalMute: (userId: string) => void;
  setSoundboardVolume: (userId: string, volume: number) => void;
  setLocalMutedSoundboard: (userId: string, muted: boolean) => void;
  toggleLocalMutedSoundboard: (userId: string) => void;
  setDeafened: (val: boolean) => void;

  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
  setInputVolume: (vol: number) => void;
  setOutputVolume: (vol: number) => void;

  setSelfMuted: (val: boolean) => void;
  setSelfDeafened: (val: boolean) => void;
  setSoundEffectsEnabled: (val: boolean) => void;
  setSoundVolume: (val: number) => void;
  setPttSoundEnabled: (val: boolean) => void;
  setJoinLeaveSoundEnabled: (val: boolean) => void;
  setMuteSoundEnabled: (val: boolean) => void;
  setUiSoundEnabled: (val: boolean) => void;
}

const SETTINGS_KEY = 'nightshift_user_voice_settings_v2';

function loadPersistedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // The automatic device picker stored a guessed device and left some
      // people with no audio. Return everyone to the system default once.
      if (!localStorage.getItem('nightshift_devices_reset_v1')) {
        parsed.audioInputDeviceId = 'default';
        parsed.audioOutputDeviceId = 'default';
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
        localStorage.setItem('nightshift_devices_reset_v1', '1');
      }
      return parsed;
    }
  } catch {}
  return {
    inputProfile: 'custom' as InputProfileType,
    autoSensitivity: true,
    sensitivityThreshold: 35,
    noiseSuppression: 'standard' as const,
    echoCancellation: true,
    noiseAmount: 75,
    echoAmount: 70,
    pushToTalk: false,
    pushToTalkKey: 'Space',
    audioInputDeviceId: 'default',
    audioOutputDeviceId: 'default',
    inputVolume: 100,
    outputVolume: 100,
    isSelfMuted: false,
    isSelfDeafened: false,
    soundEffectsEnabled: true,
    soundVolume: 50,
    pttSoundEnabled: true,
    joinLeaveSoundEnabled: true,
    muteSoundEnabled: true,
    uiSoundEnabled: false,
    participantVolumes: {},
    localMutedUsers: {},
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadPersistedSettings();
  const soundVolume = initial.soundVolumeDefault === 50 && typeof initial.soundVolume === 'number'
    ? initial.soundVolume
    : typeof initial.soundVolume !== 'number' || initial.soundVolume === 25
      ? 50
      : initial.soundVolume;

  // Initialize SoundService with persisted preferences
  sounds.updatePreferences({
    masterEnabled: initial.soundEffectsEnabled ?? true,
    masterVolume: soundVolume,
    pttSound: initial.pttSoundEnabled ?? true,
    joinLeaveSound: initial.joinLeaveSoundEnabled ?? true,
    muteSound: initial.muteSoundEnabled ?? true,
    uiSound: initial.uiSoundEnabled ?? false,
  });

  const persist = (partial: Partial<SettingsState>) => {
    try {
      const current = {
        inputProfile: get().inputProfile,
        autoSensitivity: get().autoSensitivity,
        sensitivityThreshold: get().sensitivityThreshold,
        noiseSuppression: get().noiseSuppression,
        echoCancellation: get().echoCancellation,
        noiseAmount: get().noiseAmount,
        echoAmount: get().echoAmount,
        pushToTalk: get().pushToTalk,
        pushToTalkKey: get().pushToTalkKey,
        audioInputDeviceId: get().audioInputDeviceId,
        audioOutputDeviceId: get().audioOutputDeviceId,
        inputVolume: get().inputVolume,
        outputVolume: get().outputVolume,
        isSelfMuted: get().isSelfMuted,
        isSelfDeafened: get().isSelfDeafened,
        soundEffectsEnabled: get().soundEffectsEnabled,
        soundVolume: get().soundVolume,
        soundVolumeDefault: 50,
        pttSoundEnabled: get().pttSoundEnabled,
        joinLeaveSoundEnabled: get().joinLeaveSoundEnabled,
        muteSoundEnabled: get().muteSoundEnabled,
        uiSoundEnabled: get().uiSoundEnabled,
        participantVolumes: get().participantVolumes,
        localMutedUsers: get().localMutedUsers,
        ...partial,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {}
  };

  return {
    inputProfile: initial.inputProfile || 'custom',
    autoSensitivity: initial.autoSensitivity ?? true,
    sensitivityThreshold: initial.sensitivityThreshold ?? 35,
    noiseSuppression: initial.noiseSuppression || 'standard',
    echoCancellation: initial.echoCancellation ?? true,
    noiseAmount: typeof initial.noiseAmount === 'number'
      ? initial.noiseAmount
      : initial.noiseSuppression === 'none'
        ? 0
        : initial.noiseSuppression === 'krisp'
          ? 85
          : 65,
    echoAmount: typeof initial.echoAmount === 'number'
      ? initial.echoAmount
      : initial.echoCancellation === false
        ? 0
        : 70,
    pushToTalk: initial.pushToTalk ?? false,
    pushToTalkKey: initial.pushToTalkKey || 'Space',
    audioInputDeviceId: initial.audioInputDeviceId || 'default',
    audioOutputDeviceId: initial.audioOutputDeviceId || 'default',
    inputVolume: initial.inputVolume ?? 100,
    outputVolume: initial.outputVolume ?? 100,
    isSelfMuted: initial.isSelfMuted ?? false,
    isSelfDeafened: initial.isSelfDeafened ?? false,
    soundEffectsEnabled: initial.soundEffectsEnabled ?? true,
    soundVolume,
    pttSoundEnabled: initial.pttSoundEnabled ?? true,
    joinLeaveSoundEnabled: initial.joinLeaveSoundEnabled ?? true,
    muteSoundEnabled: initial.muteSoundEnabled ?? true,
    uiSoundEnabled: initial.uiSoundEnabled ?? false,
    availableInputs: [],
    availableOutputs: [],

    inputMode: (initial.pushToTalk ? 'push-to-talk' : 'voice-activity') as 'voice-activity' | 'push-to-talk',
    voiceActivationThreshold: initial.sensitivityThreshold ?? 35,
    participantVolumes: initial.participantVolumes || {},
    localMutedUsers: initial.localMutedUsers || {},
    soundboardVolumes: initial.soundboardVolumes || {},
    localMutedSoundboards: initial.localMutedSoundboards || {},

    refreshDevices: async () => {
      await get().syncSystemDevices();
    },

    syncSystemDevices: async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          return { inputChanged: false, outputChanged: false };
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        const keep = (id: string, list: MediaDeviceInfo[]) => {
          if (!id || id === 'default' || id === 'communications') return 'default';
          return list.some((d) => d.deviceId === id) ? id : 'default';
        };
        const inputId = keep(get().audioInputDeviceId, inputs);
        const outputId = keep(get().audioOutputDeviceId, outputs);
        const inputChanged = inputId !== get().audioInputDeviceId;
        const outputChanged = outputId !== get().audioOutputDeviceId;
        set({
          availableInputs: inputs,
          availableOutputs: outputs,
          ...(inputChanged ? { audioInputDeviceId: inputId } : {}),
          ...(outputChanged ? { audioOutputDeviceId: outputId } : {}),
        });
        if (inputChanged || outputChanged) {
          persist({
            audioInputDeviceId: inputId,
            audioOutputDeviceId: outputId,
          });
        }
        return { inputChanged, outputChanged };
      } catch (err) {
        console.warn('Device enumeration error:', err);
        return { inputChanged: false, outputChanged: false };
      }
    },

    setInputProfile: (inputProfile: InputProfileType) => {
      // Set presets based on profile
      let echo = get().echoCancellation;
      let noise: 'none' | 'standard' | 'krisp' = get().noiseSuppression;
      let auto = get().autoSensitivity;

      if (inputProfile === 'voice-isolation') {
        echo = true;
        noise = 'krisp';
        auto = true;
      } else if (inputProfile === 'studio') {
        echo = false;
        noise = 'none';
        auto = false;
      }

      set({ inputProfile, echoCancellation: echo, noiseSuppression: noise, autoSensitivity: auto });
      persist({ inputProfile, echoCancellation: echo, noiseSuppression: noise, autoSensitivity: auto });
    },

    setAutoSensitivity: (autoSensitivity: boolean) => {
      set({ autoSensitivity });
      persist({ autoSensitivity });
    },

    setSensitivityThreshold: (sensitivityThreshold: number) => {
      set({ sensitivityThreshold, voiceActivationThreshold: sensitivityThreshold });
      persist({ sensitivityThreshold });
    },

    setNoiseSuppression: (noiseSuppression: 'none' | 'standard' | 'krisp') => {
      const noiseAmount = noiseSuppression === 'none' ? 0 : noiseSuppression === 'krisp' ? 85 : 65;
      set({ noiseSuppression, noiseAmount });
      persist({ noiseSuppression, noiseAmount });
    },

    setEchoCancellation: (echoCancellation: boolean) => {
      const echoAmount = echoCancellation ? Math.max(get().echoAmount, 70) : 0;
      set({ echoCancellation, echoAmount });
      persist({ echoCancellation, echoAmount });
    },

    setNoiseAmount: (noiseAmount: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(noiseAmount)));
      set({
        noiseAmount: clamped,
        noiseSuppression: clamped <= 0 ? 'none' : 'standard',
      });
      persist({ noiseAmount: clamped, noiseSuppression: clamped <= 0 ? 'none' : 'standard' });
    },

    setEchoAmount: (echoAmount: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(echoAmount)));
      set({ echoAmount: clamped, echoCancellation: clamped > 0 });
      persist({ echoAmount: clamped, echoCancellation: clamped > 0 });
    },

    setPushToTalk: (pushToTalk: boolean) => {
      set({ pushToTalk, inputMode: pushToTalk ? 'push-to-talk' : 'voice-activity' });
      persist({ pushToTalk });
    },

    setPushToTalkKey: (pushToTalkKey: string) => {
      set({ pushToTalkKey });
      persist({ pushToTalkKey });
    },

    setInputMode: (inputMode: 'voice-activity' | 'push-to-talk') => {
      const pushToTalk = inputMode === 'push-to-talk';
      set({ inputMode, pushToTalk });
      persist({ pushToTalk });
    },

    setVoiceActivationThreshold: (voiceActivationThreshold: number) => {
      set({ voiceActivationThreshold, sensitivityThreshold: voiceActivationThreshold });
      persist({ sensitivityThreshold: voiceActivationThreshold });
    },

    setParticipantVolume: (userId: string, volume: number) => {
      set((state) => {
        const updated = { ...state.participantVolumes, [userId]: volume };
        persist({ participantVolumes: updated });
        return { participantVolumes: updated };
      });
    },

    setLocalMuted: (userId: string, muted: boolean) => {
      set((state) => {
        const updated = { ...state.localMutedUsers, [userId]: muted };
        persist({ localMutedUsers: updated });
        return { localMutedUsers: updated };
      });
    },

    toggleLocalMute: (userId: string) => {
      const current = !!get().localMutedUsers[userId];
      get().setLocalMuted(userId, !current);
    },

    setSoundboardVolume: (userId: string, volume: number) => {
      set((state) => {
        const updated = { ...state.soundboardVolumes, [userId]: volume };
        persist({ soundboardVolumes: updated });
        return { soundboardVolumes: updated };
      });
    },

    setLocalMutedSoundboard: (userId: string, muted: boolean) => {
      set((state) => {
        const updated = { ...state.localMutedSoundboards, [userId]: muted };
        persist({ localMutedSoundboards: updated });
        return { localMutedSoundboards: updated };
      });
    },

    toggleLocalMutedSoundboard: (userId: string) => {
      const current = !!get().localMutedSoundboards[userId];
      get().setLocalMutedSoundboard(userId, !current);
    },

    setDeafened: (val: boolean) => {
      get().setSelfDeafened(val);
    },

    setInputDevice: (audioInputDeviceId: string) => {
      set({ audioInputDeviceId });
      persist({ audioInputDeviceId });
    },

    setOutputDevice: (audioOutputDeviceId: string) => {
      set({ audioOutputDeviceId });
      persist({ audioOutputDeviceId });
    },

    setInputVolume: (inputVolume: number) => {
      set({ inputVolume });
      persist({ inputVolume });
    },

    setOutputVolume: (outputVolume: number) => {
      set({ outputVolume });
      persist({ outputVolume });
    },

    setSelfMuted: (isSelfMuted: boolean) => {
      set({ isSelfMuted });
      persist({ isSelfMuted });
      if (isSelfMuted) {
        sounds.playMute();
      } else {
        sounds.playUnmute();
      }
    },

    setSelfDeafened: (isSelfDeafened: boolean) => {
      set({ isSelfDeafened });
      persist({ isSelfDeafened });
      if (isSelfDeafened) {
        sounds.playDeafen();
      } else {
        sounds.playUndeafen();
      }
    },

    setSoundEffectsEnabled: (soundEffectsEnabled: boolean) => {
      set({ soundEffectsEnabled });
      sounds.setEnabled(soundEffectsEnabled);
      persist({ soundEffectsEnabled });
    },

    setSoundVolume: (soundVolume: number) => {
      set({ soundVolume });
      sounds.setVolume(soundVolume);
      persist({ soundVolume });
    },

    setPttSoundEnabled: (pttSoundEnabled: boolean) => {
      set({ pttSoundEnabled });
      sounds.setPttSoundEnabled(pttSoundEnabled);
      persist({ pttSoundEnabled });
    },

    setJoinLeaveSoundEnabled: (joinLeaveSoundEnabled: boolean) => {
      set({ joinLeaveSoundEnabled });
      sounds.setJoinLeaveSoundEnabled(joinLeaveSoundEnabled);
      persist({ joinLeaveSoundEnabled });
    },

    setMuteSoundEnabled: (muteSoundEnabled: boolean) => {
      set({ muteSoundEnabled });
      sounds.setMuteSoundEnabled(muteSoundEnabled);
      persist({ muteSoundEnabled });
    },

    setUiSoundEnabled: (uiSoundEnabled: boolean) => {
      set({ uiSoundEnabled });
      sounds.setUiSoundEnabled(uiSoundEnabled);
      persist({ uiSoundEnabled });
    },
  };
});
