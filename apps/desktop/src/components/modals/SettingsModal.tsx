import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  Sliders,
  Check,
  Volume2,
  SlidersHorizontal,
  Info,
  LogOut,
  ChevronDown,
  Camera,
  Upload,
  Trash2,
  AlertCircle,
  Music,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { sounds } from '../../services/sound.service';
import { APP_VERSION, APP_NAME } from '@nightshift/shared';
import { getFullAvatarUrl } from '../../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'sounds' | 'account' | 'about'>('voice');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    inputProfile,
    autoSensitivity,
    sensitivityThreshold,
    noiseSuppression,
    echoCancellation,
    pushToTalk,
    pushToTalkKey,
    audioInputDeviceId,
    audioOutputDeviceId,
    availableInputs,
    availableOutputs,
    refreshDevices,
    setInputProfile,
    setAutoSensitivity,
    setSensitivityThreshold,
    setNoiseSuppression,
    setEchoCancellation,
    setPushToTalk,
    setPushToTalkKey,
    setInputDevice,
    setOutputDevice,
    // Sound effects customization
    soundEffectsEnabled,
    soundVolume,
    pttSoundEnabled,
    joinLeaveSoundEnabled,
    muteSoundEnabled,
    uiSoundEnabled,
    setSoundEffectsEnabled,
    setSoundVolume,
    setPttSoundEnabled,
    setJoinLeaveSoundEnabled,
    setMuteSoundEnabled,
    setUiSoundEnabled,
  } = useSettingsStore();

  const { user, updateDisplayName, updateAvatar, logout } = useAuthStore();
  const { setAudioInputDevice, setAudioOutputDevice } = useLiveKitStore();
  const { allowWhileMuted, setAllowWhileMuted } = useSoundboardStore();

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const filteredSourceRef = useRef<AudioNode | null>(null);
  const micTestGainRef = useRef<GainNode | null>(null);

  const [isMicTesting, setIsMicTesting] = useState(false);
  const [isSpeakerTesting, setIsSpeakerTesting] = useState(false);
  const [isRecordingPttKey, setIsRecordingPttKey] = useState(false);

  useEffect(() => {
    if (!isRecordingPttKey) return;

    let cleanupElectron: (() => void) | undefined;
    if (window.nightshift?.startRecordingKey && window.nightshift?.onKeyRecorded) {
      window.nightshift.startRecordingKey().catch(() => {});
      cleanupElectron = window.nightshift.onKeyRecorded((detectedKey: string) => {
        if (detectedKey === 'ESCAPE') {
          setIsRecordingPttKey(false);
          return;
        }
        setPushToTalkKey(detectedKey);
        window.nightshift?.setGlobalPttKey?.(detectedKey, true);
        setIsRecordingPttKey(false);
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecordingPttKey(false);
        return;
      }

      let keyName = e.code;
      if (e.code === 'Space') keyName = 'Space';
      else if (e.code === 'CapsLock') keyName = 'CapsLock';
      else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
      else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
      else if (e.code.startsWith('Numpad')) keyName = e.code;
      else if (e.code === 'ControlLeft' || e.code === 'ControlRight') keyName = 'Ctrl';
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keyName = 'Shift';
      else if (e.code === 'AltLeft' || e.code === 'AltRight') keyName = 'Alt';
      else if (e.code === 'Tab') keyName = 'Tab';
      else if (e.code === 'Backquote') keyName = '~';
      else if (e.code.startsWith('F') && !isNaN(Number(e.code.slice(1)))) keyName = e.code;
      else keyName = e.key.length === 1 ? e.key.toUpperCase() : (e.code || e.key);

      setPushToTalkKey(keyName);
      window.nightshift?.setGlobalPttKey?.(keyName, true);
      setIsRecordingPttKey(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      // Left Click (button 0) is ignored per instructions
      if (e.button === 0) return;

      e.preventDefault();
      e.stopPropagation();

      let mouseName = `Mouse ${e.button + 1}`;
      if (e.button === 1) mouseName = 'Mouse 3'; // Middle Click
      else if (e.button === 2) mouseName = 'Mouse 2'; // Right Click
      else if (e.button === 3) mouseName = 'Mouse 4'; // Back / Thumb 1
      else if (e.button === 4) mouseName = 'Mouse 5'; // Forward / Thumb 2

      setPushToTalkKey(mouseName);
      window.nightshift?.setGlobalPttKey?.(mouseName, true);
      setIsRecordingPttKey(false);
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      window.nightshift?.stopRecordingKey?.().catch(() => {});
      if (cleanupElectron) cleanupElectron();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [isRecordingPttKey]);

  useEffect(() => {
    if (isOpen) {
      refreshDevices();
      if (user) {
        setDisplayNameInput(user.displayName);
      }
      startMicListener();
    } else {
      stopMicListener();
    }
    return () => {
      stopMicListener();
    };
  }, [isOpen, audioInputDeviceId]);

  const startMicListener = async () => {
    try {
      stopMicListener();
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId:
            audioInputDeviceId && audioInputDeviceId !== 'default'
              ? { exact: audioInputDeviceId }
              : undefined,
          echoCancellation,
          noiseSuppression: noiseSuppression !== 'none',
          autoGainControl: true,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      let audioCtx: AudioContext;
      try {
        audioCtx = new AudioCtx({ sampleRate: 48000 });
      } catch {
        audioCtx = new AudioCtx();
      }
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      // Cascaded Vocal Bandpass Filtering (140 Hz 4th-order High-Pass + 3400 Hz Low-Pass)
      const highpass1 = audioCtx.createBiquadFilter();
      highpass1.type = 'highpass';
      highpass1.frequency.setValueAtTime(140, audioCtx.currentTime);
      highpass1.Q.setValueAtTime(1.0, audioCtx.currentTime);

      const highpass2 = audioCtx.createBiquadFilter();
      highpass2.type = 'highpass';
      highpass2.frequency.setValueAtTime(140, audioCtx.currentTime);
      highpass2.Q.setValueAtTime(1.0, audioCtx.currentTime);

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(3400, audioCtx.currentTime);
      lowpass.Q.setValueAtTime(0.7, audioCtx.currentTime);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.2;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(highpass1);
      highpass1.connect(highpass2);
      highpass2.connect(lowpass);
      lowpass.connect(analyser);

      filteredSourceRef.current = lowpass;

      const timeBuffer = new Uint8Array(analyser.fftSize);

      const updateMeter = () => {
        analyser.getByteTimeDomainData(timeBuffer);
        let sumSquares = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          const sample = (timeBuffer[i] - 128) / 128;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const db = 20 * Math.log10(Math.max(0.00001, rms));
        // Match live room calibrated scale: -50 dB (silence/breath) -> 0%, -20 dB (strong voice) -> 100%
        const normalized = Math.max(0, Math.min(100, Math.round(((db + 50) / 30) * 100)));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      // User may not have mic plugged in
    }
  };

  const stopMicListener = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micTestGainRef.current) {
      try {
        micTestGainRef.current.disconnect();
      } catch {}
      micTestGainRef.current = null;
    }
    setIsMicTesting(false);
    filteredSourceRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
  };

  const handleToggleMicTest = async () => {
    if (isMicTesting) {
      if (micTestGainRef.current) {
        try {
          micTestGainRef.current.disconnect();
        } catch {}
        micTestGainRef.current = null;
      }
      setIsMicTesting(false);
    } else {
      if (!audioContextRef.current || !filteredSourceRef.current) {
        await startMicListener();
      }
      const ctx = audioContextRef.current;
      const src = filteredSourceRef.current;
      if (ctx && src) {
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        try {
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.9, ctx.currentTime);
          src.connect(gain);
          gain.connect(ctx.destination);
          micTestGainRef.current = gain;
          setIsMicTesting(true);
        } catch (err) {
          console.warn('Could not connect loopback mic test:', err);
        }
      }
    }
  };

  const handleTestSpeaker = () => {
    setIsSpeakerTesting(true);
    try {
      sounds.playJoin();

      // Synthesized crystal-clear melodic chime via Web Audio (guaranteed to play in all environments)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        const notes = [
          { freq: 523.25, time: 0, dur: 0.14 },    // C5
          { freq: 659.25, time: 0.12, dur: 0.14 },  // E5
          { freq: 783.99, time: 0.24, dur: 0.35 },  // G5
        ];
        notes.forEach((n) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.time);
          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.linearRampToValueAtTime(0.3, now + n.time + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur + 0.05);
        });
        setTimeout(() => {
          if (ctx.state !== 'closed') ctx.close().catch(() => {});
        }, 900);
      }
    } catch (err) {
      console.warn('Speaker test sound failed:', err);
    }
    setTimeout(() => setIsSpeakerTesting(false), 900);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayNameInput.trim()) return;
    const ok = await updateDisplayName(displayNameInput.trim());
    if (ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name || typeof name !== 'string') return 'U';
    const clean = name.trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError(null);
    setAvatarSuccess(false);

    // Validate strictly: JPG, JPEG, PNG only
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const validExts = ['.jpg', '.jpeg', '.png'];

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setAvatarError('Only JPG, JPEG, and PNG image files are allowed.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image file size must be less than 5MB.');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const ok = await updateAvatar(file);
      if (ok) {
        setAvatarSuccess(true);
        setTimeout(() => setAvatarSuccess(false), 2500);
      } else {
        setAvatarError('Failed to update avatar image.');
      }
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to update avatar image.');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const ok = await updateAvatar(null);
      if (ok) {
        setAvatarSuccess(true);
        setTimeout(() => setAvatarSuccess(false), 2500);
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="w-[720px] max-w-full h-[620px] max-h-[92vh] bg-bg-secondary rounded-2xl border border-border-subtle shadow-card flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-highlight" />
            <h2 className="text-base font-bold text-text-primary tracking-wide">User Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-bg-elevated hover:bg-bg-hover border border-border-subtle flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body with Left Navigation and Right Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Settings Tabs */}
          <div className="w-48 bg-bg-main border-r border-border-subtle p-3 space-y-1 shrink-0">
            <button
              onClick={() => setActiveTab('voice')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'voice'
                  ? 'bg-highlight text-highlight-text shadow-sm'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voice & Video</span>
            </button>

            <button
              onClick={() => setActiveTab('sounds')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'sounds'
                  ? 'bg-highlight text-highlight-text shadow-sm'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Sound Effects</span>
            </button>

            <button
              onClick={() => setActiveTab('account')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'account'
                  ? 'bg-highlight text-highlight-text shadow-sm'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>My Account</span>
            </button>

            <button
              onClick={() => setActiveTab('about')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'about'
                  ? 'bg-highlight text-highlight-text shadow-sm'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>About</span>
            </button>
          </div>

          {/* Right Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'voice' && (
              <div className="space-y-6">
                {/* Voice Hardware Devices Selection */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Input Device */}
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                      Input Device (Microphone)
                    </label>
                    <div className="relative">
                      <select
                        value={audioInputDeviceId}
                        onChange={(e) => {
                          setInputDevice(e.target.value);
                          setAudioInputDevice(e.target.value);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                      >
                        <option value="default">Default Microphone</option>
                        {availableInputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone ${d.deviceId.substring(0, 5)}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Output Device */}
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                      Output Device (Headphones)
                    </label>
                    <div className="relative">
                      <select
                        value={audioOutputDeviceId}
                        onChange={(e) => {
                          setOutputDevice(e.target.value);
                          setAudioOutputDevice(e.target.value);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                      >
                        <option value="default">Default Output</option>
                        {availableOutputs.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Speaker ${d.deviceId.substring(0, 5)}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-text-muted absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Output Volume & Test Sound */}
                <div className={`p-3.5 rounded-xl bg-bg-elevated border transition-colors flex items-center justify-between ${
                  isSpeakerTesting ? 'border-emerald-500/50 shadow-md shadow-emerald-500/10' : 'border-border-subtle'
                }`}>
                  <div className="flex items-center gap-3">
                    <Volume2 className={`w-5 h-5 transition-transform ${isSpeakerTesting ? 'text-emerald-400 scale-110' : 'text-highlight'}`} />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Output Volume & Speaker Test</div>
                      <div className="text-[11px] text-text-muted">Test sound playback on your selected speaker</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSpeaker}
                    disabled={isSpeakerTesting}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                      isSpeakerTesting
                        ? 'bg-emerald-500 text-white'
                        : 'bg-highlight hover:bg-white text-highlight-text'
                    }`}
                  >
                    {isSpeakerTesting ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                        Playing Chime...
                      </>
                    ) : (
                      'Play Test Sound'
                    )}
                  </button>
                </div>

                {/* 1. Input Profile Section (Matching Screenshot) */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-bold text-text-primary">Input Profile</h3>

                  {/* Option 1: Voice Isolation */}
                  <label
                    onClick={() => setInputProfile('voice-isolation')}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-bg-elevated/60 transition-colors cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="inputProfile"
                      checked={inputProfile === 'voice-isolation'}
                      onChange={() => setInputProfile('voice-isolation')}
                      className="mt-0.5 accent-highlight cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary group-hover:text-highlight transition-colors">
                        Voice Isolation
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed">
                        Just your beautiful voice: cut through the background noise
                      </div>
                    </div>
                  </label>

                  {/* Option 2: Studio */}
                  <label
                    onClick={() => setInputProfile('studio')}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-bg-elevated/60 transition-colors cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="inputProfile"
                      checked={inputProfile === 'studio'}
                      onChange={() => setInputProfile('studio')}
                      className="mt-0.5 accent-highlight cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary group-hover:text-highlight transition-colors">
                        Studio
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed">
                        Pure audio: open mic with no post-processing
                      </div>
                    </div>
                  </label>

                  {/* Option 3: Custom */}
                  <label
                    onClick={() => setInputProfile('custom')}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-bg-elevated/60 transition-colors cursor-pointer group"
                  >
                    <input
                      type="radio"
                      name="inputProfile"
                      checked={inputProfile === 'custom'}
                      onChange={() => setInputProfile('custom')}
                      className="mt-0.5 accent-highlight cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-text-primary group-hover:text-highlight transition-colors">
                        Custom
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed">
                        Advanced mode: give me all the buttons and dials!
                      </div>
                    </div>
                  </label>
                </div>

                {/* 2. Automatically Adjust Input Sensitivity (Matching Screenshot) */}
                <div className="space-y-3 pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        Automatically Adjust Input Sensitivity
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed max-w-md">
                        Controls how much sound is transmitted from your mic. Speak to test your mic — if the meter is filled, your voice is transmitting.
                      </div>
                    </div>
                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={() => setAutoSensitivity(!autoSensitivity)}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        autoSensitivity ? 'bg-highlight' : 'bg-bg-elevated border border-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full transition-transform ${
                          autoSensitivity
                            ? 'bg-highlight-text translate-x-5'
                            : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Live Mic Meter Bar with Cutoff Threshold Marker */}
                  <div className="space-y-1">
                    <div className="relative w-full h-3 rounded-full bg-bg-elevated border border-border-subtle overflow-hidden">
                      <div
                        className={`h-full transition-all duration-75 ${
                          micLevel > (autoSensitivity ? 18 : sensitivityThreshold)
                            ? 'bg-emerald-500'
                            : 'bg-highlight/50'
                        }`}
                        style={{ width: `${micLevel}%` }}
                      />
                      {/* Threshold Cutoff Line */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-amber-400 z-10 shadow-sm transition-all"
                        style={{ left: `${Math.min(99, Math.max(1, autoSensitivity ? 18 : sensitivityThreshold))}%` }}
                        title={`Gate Threshold: ${autoSensitivity ? 18 : sensitivityThreshold}%`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-text-muted">Mic Input: <b className="text-text-primary">{micLevel}%</b> (Cutoff: {autoSensitivity ? '18% Auto' : `${sensitivityThreshold}%`})</span>
                      <span className={`font-semibold ${micLevel > (autoSensitivity ? 18 : sensitivityThreshold) ? 'text-emerald-400' : 'text-text-muted'}`}>
                        {micLevel > (autoSensitivity ? 18 : sensitivityThreshold) ? 'Transmitting Audio (Gate Open)' : 'Gate Closed (Breath Blocked)'}
                      </span>
                    </div>
                  </div>

                  {!autoSensitivity && (
                    <div className="pt-2">
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <span>Manual Sensitivity Threshold</span>
                        <span className="font-mono font-bold text-highlight">{sensitivityThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sensitivityThreshold}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSensitivityThreshold(val);
                        }}
                        className="w-full accent-highlight cursor-pointer"
                      />
                      <div className="text-[10px] text-text-muted mt-1">
                        Sounds below this threshold (like breathing or room fan) are completely muted.
                      </div>
                    </div>
                  )}

                  {/* Mic Test Card (Real-time Audio Loopback & Hear Yourself) */}
                  <div className={`p-3.5 rounded-xl border transition-all mt-3 ${
                    isMicTesting
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md shadow-emerald-500/10'
                      : 'bg-bg-elevated/70 border-border-subtle'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Mic className={`w-4 h-4 ${isMicTesting ? 'text-emerald-400 animate-pulse' : 'text-highlight'}`} />
                          <span className="text-xs font-bold text-text-primary">Mic Test</span>
                          {isMicTesting && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold tracking-wider animate-pulse">
                              LIVE LOOPBACK
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-1">
                          {isMicTesting
                            ? 'Speak now — you can hear your microphone in your headphones live.'
                            : 'Having mic issues? Click "Let\'s Check" to hear how your voice sounds to other users.'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleMicTest}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 flex items-center justify-center gap-2 cursor-pointer ${
                          isMicTesting
                            ? 'bg-rose-500 hover:bg-rose-600 text-white'
                            : 'bg-highlight hover:bg-white text-highlight-text'
                        }`}
                      >
                        {isMicTesting ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                            Stop Testing
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            Let's Check
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Noise Suppression */}
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Noise Suppression</div>
                    <div className="text-[11px] text-text-secondary">
                      Advanced real-time noise cancellation and typing reduction
                    </div>
                    <div className="text-xs font-black tracking-wider text-highlight mt-1">Ultra Noise Gate</div>
                  </div>
                  <div className="relative">
                    <select
                      value={noiseSuppression}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setNoiseSuppression(val);
                        useLiveKitStore.getState().applyAudioProcessingSettings();
                      }}
                      className="px-4 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                    >
                      <option value="krisp">Ultra Voice Isolation (Krisp + Highpass)</option>
                      <option value="standard">Standard WebRTC Suppression</option>
                      <option value="none">Disabled (Raw Audio)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* 4. Echo Cancellation */}
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Echo Cancellation</div>
                    <div className="text-[11px] text-text-secondary">
                      Hardware & software acoustic echo cancellation for open speakers
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !echoCancellation;
                      setEchoCancellation(next);
                      useLiveKitStore.getState().applyAudioProcessingSettings();
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                      echoCancellation ? 'bg-highlight' : 'bg-bg-elevated border border-border-subtle'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full transition-transform ${
                        echoCancellation
                          ? 'bg-highlight-text translate-x-5'
                          : 'bg-text-muted translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 5. Push to Talk (Matching Screenshot) */}
                <div className="space-y-2 pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Push to Talk</div>
                      <div className="text-[11px] text-text-secondary">
                        Only transmit voice while holding down a dedicated key
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPushToTalk(!pushToTalk)}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        pushToTalk ? 'bg-highlight' : 'bg-bg-elevated border border-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full transition-transform ${
                          pushToTalk
                            ? 'bg-highlight-text translate-x-5'
                            : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {pushToTalk && (
                    <div className="space-y-2.5 mt-2">
                      {/* PTT Keybind Shortcut (Auto-record keyboard or mouse button) */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-subtle">
                        <div>
                          <span className="text-xs font-bold text-text-primary block">PTT Keybind Shortcut</span>
                          <span className="text-[11px] text-text-muted">
                            {isRecordingPttKey
                              ? 'Press any keyboard key or mouse button (except Left Click / Esc)...'
                              : 'Click button to rebind any keyboard key or mouse button'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsRecordingPttKey(true)}
                            className={`px-3.5 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
                              isRecordingPttKey
                                ? 'bg-highlight text-highlight-text border-highlight animate-pulse ring-2 ring-highlight/50'
                                : 'bg-bg-main hover:bg-bg-hover text-highlight border-border-subtle hover:border-highlight/60'
                            }`}
                            title="Click to automatically record any key or mouse button"
                          >
                            {isRecordingPttKey ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                                <span>Listening...</span>
                              </>
                            ) : (
                              <span>{pushToTalkKey || 'Space'}</span>
                            )}
                          </button>
                          {isRecordingPttKey && (
                            <button
                              type="button"
                              onClick={() => setIsRecordingPttKey(false)}
                              className="px-2 py-1 text-[11px] rounded bg-bg-main hover:bg-bg-hover text-text-muted hover:text-text-primary border border-border-subtle cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* PTT Activation Audio Cue Toggle */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-elevated border border-border-subtle">
                        <div>
                          <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                            <span>PTT Activation Sound</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pttSoundEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-bg-main text-text-muted'
                            }`}>
                              {pttSoundEnabled ? 'Enabled' : 'Muted'}
                            </span>
                          </div>
                          <div className="text-[11px] text-text-muted">
                            Play sound cue when pressing and releasing Push-to-Talk
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => sounds.previewPtt(true)}
                            title="Preview PTT activate sound"
                            className="px-2 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            onClick={() => setPttSoundEnabled(!pttSoundEnabled)}
                            className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                              pttSoundEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                            }`}
                          >
                            <span
                              className={`block w-5 h-5 rounded-full transition-transform ${
                                pttSoundEnabled
                                  ? 'bg-highlight-text translate-x-5'
                                  : 'bg-text-muted translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Desktop App vs Browser Global PTT Status Notice */}
                      <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                        typeof window !== 'undefined' && !!(window.nightshift?.isElectron || window.nightshift?.setGlobalPttKey)
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      }`}>
                        {typeof window !== 'undefined' && !!(window.nightshift?.isElectron || window.nightshift?.setGlobalPttKey) ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            <span>
                              <strong>Global PTT Active:</strong> Works across all games and background applications in Windows.
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 font-bold text-amber-300">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Browser Security Notice</span>
                            </div>
                            <p className="text-[11px] text-amber-200/90">
                              Web browsers do not allow web pages to listen to background keys when minimized or out-of-focus (security sandbox). For Global Push-to-Talk inside full-screen games and other apps, run the <strong>NIGHTSHIFT Desktop App</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 6. Music & Soundboard Transmission When Muted */}
                <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-highlight/10 text-highlight mt-0.5">
                      <Music className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Play while muted</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          allowWhileMuted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-bg-elevated text-text-muted'
                        }`}>
                          {allowWhileMuted ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed max-w-md mt-0.5">
                        Keep transmitting music and soundboard audio to room listeners even when your microphone is muted.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllowWhileMuted(!allowWhileMuted)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                      allowWhileMuted ? 'bg-highlight' : 'bg-bg-elevated border border-border-subtle'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full transition-transform ${
                        allowWhileMuted
                          ? 'bg-highlight-text translate-x-5'
                          : 'bg-text-muted translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'sounds' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-text-primary mb-1">Sound Effects & Audio Cues</h3>
                  <p className="text-xs text-text-secondary">
                    Customize which sound cues you want to hear. Turn off specific alerts like Push-to-Talk or button clicks while keeping voice channel join/leave notifications active.
                  </p>
                </div>

                {/* Master Sound Controls */}
                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Master Sound Effects</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          soundEffectsEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-bg-main text-text-muted'
                        }`}>
                          {soundEffectsEnabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        Enable or completely silence all sound effects and notifications in the application
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSoundEffectsEnabled(!soundEffectsEnabled)}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                        soundEffectsEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full transition-transform ${
                          soundEffectsEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {soundEffectsEnabled && (
                    <div className="pt-3 border-t border-border-subtle/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary font-medium">Sound Effects Volume</span>
                        <span className="font-mono text-highlight font-bold">{soundVolume}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={soundVolume}
                          onChange={(e) => setSoundVolume(Number(e.target.value))}
                          className="flex-1 accent-highlight cursor-pointer h-1.5 bg-bg-main rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => sounds.previewCue('join')}
                          title="Preview volume level"
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer shrink-0"
                        >
                          Test Volume
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Individual Sound Categories */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    Individual Audio Cues
                  </h4>

                  {/* 1. Push-to-Talk Sounds */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-subtle">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Push-to-Talk Cues</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          pttSoundEnabled ? 'text-emerald-400' : 'text-text-muted'
                        }`}>
                          {pttSoundEnabled ? '● On' : '○ Muted'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary">
                        Plays a subtle audio cue when holding down and releasing your PTT key.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => sounds.previewPtt(true)}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setPttSoundEnabled(!pttSoundEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                          pttSoundEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full transition-transform ${
                            pttSoundEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 2. Voice Channel Join & Leave */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-subtle">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Voice Channel Join & Leave</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          joinLeaveSoundEnabled ? 'text-emerald-400' : 'text-text-muted'
                        }`}>
                          {joinLeaveSoundEnabled ? '● On' : '○ Muted'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary">
                        Plays a sound when you or another user joins or leaves a voice channel.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => sounds.previewCue('join')}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setJoinLeaveSoundEnabled(!joinLeaveSoundEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                          joinLeaveSoundEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full transition-transform ${
                            joinLeaveSoundEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 3. Mute & Deafen Cues */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-subtle">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Mute & Deafen Cues</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          muteSoundEnabled ? 'text-emerald-400' : 'text-text-muted'
                        }`}>
                          {muteSoundEnabled ? '● On' : '○ Muted'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary">
                        Plays a sound when toggling microphone mute or headset deafen.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => sounds.previewCue('mute')}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setMuteSoundEnabled(!muteSoundEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                          muteSoundEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full transition-transform ${
                            muteSoundEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* 4. App UI & Button Clicks */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-bg-elevated border border-border-subtle">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Application Button Clicks</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          uiSoundEnabled ? 'text-emerald-400' : 'text-text-muted'
                        }`}>
                          {uiSoundEnabled ? '● On' : '○ Muted'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary">
                        Plays subtle acoustic click feedback when pressing buttons throughout the app.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => sounds.previewButtonClick()}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-bg-main hover:bg-bg-hover text-text-secondary hover:text-text-primary border border-border-subtle transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setUiSoundEnabled(!uiSoundEnabled)}
                        className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                          uiSoundEnabled ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                        }`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full transition-transform ${
                            uiSoundEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-text-primary mb-1">My Account</h3>
                  <p className="text-xs text-text-secondary">
                    Your unique username, avatar picture, and display name are stored securely on the NIGHTSHIFT network.
                  </p>
                </div>

                {/* Profile Picture / Avatar Upload Card */}
                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle space-y-4">
                  <div>
                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">
                      Profile Picture (Avatar)
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Avatar preview with click-to-upload */}
                      <div
                        onClick={() => avatarInputRef.current?.click()}
                        className="relative w-20 h-20 rounded-full bg-[#18191c] border-2 border-[#2b2d31] flex items-center justify-center text-xl font-black text-[#f2f3f5] shrink-0 cursor-pointer group shadow-card overflow-hidden hover:border-[#5865f2] transition-all"
                        title="Click to choose a JPG, JPEG, or PNG picture"
                      >
                        {user?.avatarUrl ? (
                          <img
                            src={getFullAvatarUrl(user.avatarUrl)!}
                            alt={user.displayName}
                            className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                          />
                        ) : (
                          <span>{user ? getInitials(user.displayName) : 'U'}</span>
                        )}

                        {/* Hover Camera Overlay */}
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                          <Camera className="w-5 h-5 mb-0.5" />
                          <span className="text-[9px] font-bold uppercase tracking-wider">Change</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                            onChange={handleAvatarChange}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={isUploadingAvatar}
                            onClick={() => avatarInputRef.current?.click()}
                            className="px-3.5 py-1.5 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            {isUploadingAvatar ? 'Uploading...' : 'Upload Picture'}
                          </button>

                          {user?.avatarUrl && (
                            <button
                              type="button"
                              disabled={isUploadingAvatar}
                              onClick={handleRemoveAvatar}
                              className="px-3 py-1.5 rounded-xl bg-destructive/15 hover:bg-destructive text-destructive hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="text-[11.5px] text-[#949ba4] leading-relaxed">
                          Supported image formats: <strong className="text-[#dbdee1]">JPG, JPEG, PNG</strong> (Max 5MB).
                        </div>

                        {avatarSuccess && (
                          <span className="text-xs text-[#23a55a] font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Avatar updated successfully!
                          </span>
                        )}

                        {avatarError && (
                          <span className="text-xs text-[#f23f43] font-medium flex items-center gap-1 bg-[#f23f43]/10 p-2 rounded-lg border border-[#f23f43]/20">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {avatarError}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle space-y-3">
                  <div>
                    <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                      Username (Unique ID)
                    </div>
                    <div className="text-sm font-mono font-bold text-highlight mt-0.5">
                      @{user?.username || 'user'}
                    </div>
                  </div>

                  <form onSubmit={handleSaveProfile} className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
                        Display Name / Nickname
                      </label>
                      <input
                        type="text"
                        value={displayNameInput}
                        onChange={(e) => setDisplayNameInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-bg-main border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold transition-all shadow-sm"
                      >
                        Save Display Name
                      </button>
                      {saveSuccess && (
                        <span className="text-xs text-accent-bright font-medium flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Saved
                        </span>
                      )}
                    </div>
                  </form>
                </div>

                <div className="pt-4 border-t border-border-subtle">
                  <button
                    onClick={() => {
                      logout();
                      onClose();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-destructive/15 hover:bg-destructive text-destructive hover:text-white text-xs font-bold flex items-center gap-2 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out of Account
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'about' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-text-primary">About {APP_NAME}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  NIGHTSHIFT is a high-performance, private desktop voice chat and screen-sharing network designed with Discord-grade audio isolation, clean WebRTC transmission, and strict user privacy.
                </p>
                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-muted space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span>Version</span>
                    <span className="text-text-primary font-mono font-medium">{APP_VERSION}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>LiveKit WebRTC</span>
                    <span className="text-accent font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block animate-pulse" />
                      Connected
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Network Protocol</span>
                    <span className="text-text-primary font-medium">Encrypted WebRTC & WSS</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Theme</span>
                    <span className="text-text-primary font-medium">True Pitch Black (#0A0908) & Ivory Snow</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
