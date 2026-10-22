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

  // Available hardware
  availableInputs: MediaDeviceInfo[];
  availableOutputs: MediaDeviceInfo[];

  // Compatibility fields for LiveKit voice engine and global hotkeys
  inputMode: 'voice-activity' | 'push-to-talk';
  voiceActivationThreshold: number;
  participantVolumes: Record<string, number>;

  // Actions
  refreshDevices: () => Promise<void>;
  setInputProfile: (profile: InputProfileType) => void;
  setAutoSensitivity: (val: boolean) => void;
  setSensitivityThreshold: (val: number) => void;
  setNoiseSuppression: (val: 'none' | 'standard' | 'krisp') => void;
  setEchoCancellation: (val: boolean) => void;
  setPushToTalk: (val: boolean) => void;
  setPushToTalkKey: (key: string) => void;
  setInputMode: (mode: 'voice-activity' | 'push-to-talk') => void;
  setVoiceActivationThreshold: (threshold: number) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setDeafened: (val: boolean) => void;

  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
  setInputVolume: (vol: number) => void;
  setOutputVolume: (vol: number) => void;

  setSelfMuted: (val: boolean) => void;
  setSelfDeafened: (val: boolean) => void;
  setSoundEffectsEnabled: (val: boolean) => void;
  setSoundVolume: (val: number) => void;
}

const SETTINGS_KEY = 'nightshift_user_voice_settings_v2';

function loadPersistedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    inputProfile: 'custom' as InputProfileType,
    autoSensitivity: true,
    sensitivityThreshold: 35,
    noiseSuppression: 'standard' as const,
    echoCancellation: true,
    pushToTalk: false,
    pushToTalkKey: 'Space',
    audioInputDeviceId: 'default',
    audioOutputDeviceId: 'default',
    inputVolume: 100,
    outputVolume: 100,
    isSelfMuted: false,
    isSelfDeafened: false,
    soundEffectsEnabled: true,
    soundVolume: 70,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadPersistedSettings();

  const persist = (partial: Partial<SettingsState>) => {
    try {
      const current = {
        inputProfile: get().inputProfile,
        autoSensitivity: get().autoSensitivity,
        sensitivityThreshold: get().sensitivityThreshold,
        noiseSuppression: get().noiseSuppression,
        echoCancellation: get().echoCancellation,
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
    pushToTalk: initial.pushToTalk ?? false,
    pushToTalkKey: initial.pushToTalkKey || 'Space',
    audioInputDeviceId: initial.audioInputDeviceId || 'default',
    audioOutputDeviceId: initial.audioOutputDeviceId || 'default',
    inputVolume: initial.inputVolume ?? 100,
    outputVolume: initial.outputVolume ?? 100,
    isSelfMuted: initial.isSelfMuted ?? false,
    isSelfDeafened: initial.isSelfDeafened ?? false,
    soundEffectsEnabled: initial.soundEffectsEnabled ?? true,
    soundVolume: initial.soundVolume ?? 70,
    availableInputs: [],
    availableOutputs: [],

    inputMode: (initial.pushToTalk ? 'push-to-talk' : 'voice-activity') as 'voice-activity' | 'push-to-talk',
    voiceActivationThreshold: initial.sensitivityThreshold ?? 35,
    participantVolumes: {},

    refreshDevices: async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        set({ availableInputs: inputs, availableOutputs: outputs });
      } catch (err) {
        console.warn('Device enumeration error:', err);
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
      set({ sensitivityThreshold });
      persist({ sensitivityThreshold });
    },

    setNoiseSuppression: (noiseSuppression: 'none' | 'standard' | 'krisp') => {
      set({ noiseSuppression });
      persist({ noiseSuppression });
    },

    setEchoCancellation: (echoCancellation: boolean) => {
      set({ echoCancellation });
      persist({ echoCancellation });
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
      set((state) => ({
        participantVolumes: { ...state.participantVolumes, [userId]: volume },
      }));
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
  };
});
