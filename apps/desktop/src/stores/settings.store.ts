import { create } from 'zustand';

interface SettingsState {
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  isDeafened: boolean;
  theme: 'dark';
  availableInputs: MediaDeviceInfo[];
  availableOutputs: MediaDeviceInfo[];
  refreshDevices: () => Promise<void>;
  setInputDevice: (deviceId: string) => void;
  setOutputDevice: (deviceId: string) => void;
  setInputVolume: (vol: number) => void;
  setOutputVolume: (vol: number) => void;
  setDeafened: (val: boolean) => void;
}

const SETTINGS_KEY = 'nightshift_user_settings';

function loadPersistedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    audioInputDeviceId: 'default',
    audioOutputDeviceId: 'default',
    inputVolume: 100,
    outputVolume: 100,
    isDeafened: false,
    theme: 'dark',
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const initial = loadPersistedSettings();

  const persist = (partial: Partial<SettingsState>) => {
    try {
      const current = {
        audioInputDeviceId: get().audioInputDeviceId,
        audioOutputDeviceId: get().audioOutputDeviceId,
        inputVolume: get().inputVolume,
        outputVolume: get().outputVolume,
        isDeafened: get().isDeafened,
        theme: get().theme,
        ...partial,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {}
  };

  return {
    audioInputDeviceId: initial.audioInputDeviceId || 'default',
    audioOutputDeviceId: initial.audioOutputDeviceId || 'default',
    inputVolume: initial.inputVolume ?? 100,
    outputVolume: initial.outputVolume ?? 100,
    isDeafened: initial.isDeafened ?? false,
    theme: 'dark',
    availableInputs: [],
    availableOutputs: [],

    refreshDevices: async () => {
      try {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        set({ availableInputs: inputs, availableOutputs: outputs });
      } catch (err) {
        console.warn('Could not enumerate media devices:', err);
      }
    },

    setInputDevice: (deviceId: string) => {
      set({ audioInputDeviceId: deviceId });
      persist({ audioInputDeviceId: deviceId });
    },

    setOutputDevice: (deviceId: string) => {
      set({ audioOutputDeviceId: deviceId });
      persist({ audioOutputDeviceId: deviceId });
    },

    setInputVolume: (vol: number) => {
      set({ inputVolume: vol });
      persist({ inputVolume: vol });
    },

    setOutputVolume: (vol: number) => {
      set({ outputVolume: vol });
      persist({ outputVolume: vol });
    },

    setDeafened: (val: boolean) => {
      set({ isDeafened: val });
      persist({ isDeafened: val });
    },
  };
});
