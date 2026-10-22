import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  Sliders,
  Palette,
  Info,
  LogOut,
  Check,
  Activity,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { APP_VERSION, APP_NAME } from '@nightshift/shared';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'audio' | 'appearance' | 'app'>('audio');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    audioInputDeviceId,
    audioOutputDeviceId,
    isDeafened,
    availableInputs,
    availableOutputs,
    refreshDevices,
    setInputDevice,
    setOutputDevice,
    setDeafened,
  } = useSettingsStore();

  const { user, updateDisplayName, logout } = useAuthStore();
  const { setAudioInputDevice, setAudioOutputDevice } = useLiveKitStore();

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      refreshDevices();
      if (user) {
        setDisplayNameInput(user.displayName);
      }
    } else {
      stopMicTest();
    }
    return () => {
      stopMicTest();
    };
  }, [isOpen]);

  const startMicTest = async () => {
    try {
      stopMicTest();
      const constraints: MediaStreamConstraints = {
        audio:
          audioInputDeviceId && audioInputDeviceId !== 'default'
            ? { deviceId: { exact: audioInputDeviceId } }
            : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      setIsTestingMic(true);

      const updateMeter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      console.warn('Could not start mic test:', err);
      setIsTestingMic(false);
    }
  };

  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setIsTestingMic(false);
  };

  if (!isOpen) return null;

  const handleInputDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setInputDevice(id);
    await setAudioInputDevice(id);
    if (isTestingMic) {
      startMicTest();
    }
  };

  const handleOutputDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setOutputDevice(id);
    await setAudioOutputDevice(id);
  };

  const handleSaveProfile = async () => {
    if (!displayNameInput.trim()) return;
    const ok = await updateDisplayName(displayNameInput.trim());
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-[680px] max-w-full bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center text-accent">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Settings</h3>
              <p className="text-xs text-text-secondary">Audio, Appearance, and System</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body with Left Tabs and Right Pane */}
        <div className="flex flex-1 min-h-[380px] overflow-hidden">
          {/* Left Navigation */}
          <div className="w-48 bg-bg-elevated/40 border-r border-border-subtle p-3 space-y-1 shrink-0">
            <button
              onClick={() => setActiveTab('audio')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'audio'
                  ? 'bg-accent text-bg-main shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <Mic className="w-4 h-4" />
              Voice & Audio
            </button>

            <button
              onClick={() => setActiveTab('appearance')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'appearance'
                  ? 'bg-accent text-bg-main shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <Palette className="w-4 h-4" />
              Appearance
            </button>

            <button
              onClick={() => setActiveTab('app')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'app'
                  ? 'bg-accent text-bg-main shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <Info className="w-4 h-4" />
              Application
            </button>
          </div>

          {/* Right Pane */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* AUDIO TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                    Input Device (Microphone)
                  </h4>
                  <select
                    value={audioInputDeviceId}
                    onChange={handleInputDeviceChange}
                    className="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="default">Default System Microphone</option>
                    {availableInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.substring(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Mic Meter Test */}
                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-accent" />
                      Mic Input Level Meter
                    </span>
                    <button
                      onClick={isTestingMic ? stopMicTest : startMicTest}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isTestingMic
                          ? 'bg-destructive/20 text-destructive border border-destructive/40'
                          : 'bg-accent text-bg-main hover:bg-accent-hover'
                      }`}
                    >
                      {isTestingMic ? 'Stop Test' : 'Test Mic'}
                    </button>
                  </div>

                  {/* Level Progress Bar */}
                  <div className="w-full h-3 rounded-full bg-bg-main overflow-hidden border border-border-subtle/80 flex items-center px-0.5">
                    <div
                      className="h-2 rounded-full bg-accent transition-all duration-75"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-muted">
                    Speak into your microphone to verify real-time voice pickup.
                  </span>
                </div>

                {/* Output Device */}
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                    Output Device (Headphones / Speakers)
                  </h4>
                  <select
                    value={audioOutputDeviceId}
                    onChange={handleOutputDeviceChange}
                    className="w-full px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="default">Default System Playback</option>
                    {availableOutputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Speaker ${d.deviceId.substring(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Deafen toggle */}
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-bg-elevated border border-border-subtle">
                  <div>
                    <span className="text-xs font-medium text-text-primary block">
                      Deafen Audio
                    </span>
                    <span className="text-[11px] text-text-muted">
                      Silences all incoming room voices while keeping your microphone state intact
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isDeafened}
                    onChange={(e) => setDeafened(e.target.checked)}
                    className="w-4 h-4 accent-[#C4D36A] rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                    Design Theme
                  </h4>
                  <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-text-primary block">
                        Dark Graphite & Lime Accent
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Engineered specifically for low-fatigue night sessions
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-bg-main border border-border-subtle" />
                      <div className="w-5 h-5 rounded-full bg-accent" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-2">
                    Visual Palette
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-between">
                      <span className="text-text-secondary">Main Background</span>
                      <span className="font-mono text-text-muted">#17191C</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-between">
                      <span className="text-text-secondary">Primary Lime Accent</span>
                      <span className="font-mono text-accent">#C4D36A</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* APPLICATION TAB */}
            {activeTab === 'app' && (
              <div className="space-y-5">
                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                    Profile
                  </h4>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="Display Name"
                      className="flex-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={handleSaveProfile}
                      className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-bg-main text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      {saveSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-bg-main" />
                          Saved
                        </>
                      ) : (
                        'Save'
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold tracking-wider text-text-secondary uppercase mb-3">
                    System Diagnostics
                  </h4>
                  <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Application</span>
                      <span className="text-text-primary font-medium">{APP_NAME} Desktop</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Version</span>
                      <span className="text-text-primary font-mono">{APP_VERSION}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">WebRTC Infrastructure</span>
                      <span className="text-accent font-medium">LiveKit Cloud Global Edge</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Media Protocol</span>
                      <span className="text-text-primary">E2E WebRTC ICE/DTLS/SRTP</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Reset Device Identity & Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
