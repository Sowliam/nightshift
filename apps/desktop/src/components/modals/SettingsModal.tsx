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
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings.store';
import { useAuthStore } from '../../stores/auth.store';
import { useLiveKitStore } from '../../stores/livekit.store';
import { ConnectionState } from 'livekit-client';
import { useSoundboardStore } from '../../stores/soundboard.store';
import { sounds } from '../../services/sound.service';
import { attachPreviewCleaner, type CleanerState } from '../../audio/voice-cleaner';
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
  const [micBreath, setMicBreath] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    autoSensitivity,
    sensitivityThreshold,
    noiseAmount,
    echoAmount,
    pushToTalk,
    pushToTalkKey,
    audioInputDeviceId,
    audioOutputDeviceId,
    availableInputs,
    availableOutputs,
    refreshDevices,
    setAutoSensitivity,
    setSensitivityThreshold,
    setNoiseAmount,
    setEchoAmount,
    setPushToTalk,
    setPushToTalkKey,
    setInputDevice,
    setOutputDevice,
    outputVolume,
    setOutputVolume,
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
  const { setAudioInputDevice, setAudioOutputDevice, applyAudioProcessingSettings, setMasterOutputVolume } = useLiveKitStore();

  const [voiceDraft, setVoiceDraft] = useState<{
    audioInputDeviceId: string;
    audioOutputDeviceId: string;
    autoSensitivity: boolean;
    sensitivityThreshold: number;
    noiseAmount: number;
    echoAmount: number;
    pushToTalk: boolean;
    pushToTalkKey: string;
  } | null>(null);

  const savedVoice = {
    audioInputDeviceId,
    audioOutputDeviceId,
    autoSensitivity,
    sensitivityThreshold,
    noiseAmount,
    echoAmount,
    pushToTalk,
    pushToTalkKey,
  };
  const shownVoice = voiceDraft ?? savedVoice;
  const voiceDirty = !!voiceDraft && (
    voiceDraft.audioInputDeviceId !== audioInputDeviceId ||
    voiceDraft.audioOutputDeviceId !== audioOutputDeviceId ||
    voiceDraft.autoSensitivity !== autoSensitivity ||
    voiceDraft.sensitivityThreshold !== sensitivityThreshold ||
    voiceDraft.noiseAmount !== noiseAmount ||
    voiceDraft.echoAmount !== echoAmount ||
    voiceDraft.pushToTalk !== pushToTalk ||
    voiceDraft.pushToTalkKey !== pushToTalkKey
  );

  const patchVoice = (partial: Partial<NonNullable<typeof voiceDraft>>) => {
    setVoiceDraft((prev) => ({ ...(prev ?? savedVoice), ...partial }));
  };

  const discardVoice = () => {
    setVoiceDraft({ ...savedVoice });
  };

  const saveVoice = async () => {
    if (!voiceDraft) return;
    setInputDevice(voiceDraft.audioInputDeviceId);
    setOutputDevice(voiceDraft.audioOutputDeviceId);
    setAutoSensitivity(voiceDraft.autoSensitivity);
    setSensitivityThreshold(voiceDraft.sensitivityThreshold);
    setNoiseAmount(voiceDraft.noiseAmount);
    setEchoAmount(voiceDraft.echoAmount);
    setPushToTalk(voiceDraft.pushToTalk);
    setPushToTalkKey(voiceDraft.pushToTalkKey);
    await setAudioInputDevice(voiceDraft.audioInputDeviceId);
    await setAudioOutputDevice(voiceDraft.audioOutputDeviceId);
    await applyAudioProcessingSettings();
    window.nightshift?.setGlobalPttKey?.(voiceDraft.pushToTalkKey, voiceDraft.pushToTalk);
  };
  const { allowWhileMuted, setAllowWhileMuted } = useSoundboardStore();

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const filteredSourceRef = useRef<AudioNode | null>(null);
  const previewLevelsRef = useRef<((next: CleanerState) => void) | null>(null);
  const micTestGainRef = useRef<GainNode | null>(null);
  const micTestHeldDeafenRef = useRef(false);

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
        setVoiceDraft((prev) => (prev ? { ...prev, pushToTalkKey: detectedKey } : prev));
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

      setVoiceDraft((prev) => (prev ? { ...prev, pushToTalkKey: keyName } : prev));
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

      setVoiceDraft((prev) => (prev ? { ...prev, pushToTalkKey: mouseName } : prev));
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
    if (!isOpen) {
      setVoiceDraft(null);
      return;
    }
    let cancelled = false;
    (async () => {
      await useSettingsStore.getState().syncSystemDevices().catch(() => {});
      if (cancelled) return;
      const s = useSettingsStore.getState();
      setVoiceDraft({
        audioInputDeviceId: s.audioInputDeviceId,
        audioOutputDeviceId: s.audioOutputDeviceId,
        autoSensitivity: s.autoSensitivity,
        sensitivityThreshold: s.sensitivityThreshold,
        noiseAmount: s.noiseAmount,
        echoAmount: s.echoAmount,
        pushToTalk: s.pushToTalk,
        pushToTalkKey: s.pushToTalkKey,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const cleanerDraft = (): CleanerState => ({
    noise: shownVoice.noiseAmount,
    echo: shownVoice.echoAmount,
    sensitivity: shownVoice.sensitivityThreshold,
    auto: shownVoice.autoSensitivity,
    ptt: shownVoice.pushToTalk,
  });

  const releaseMicTestPrivacy = async () => {
    if (!micTestHeldDeafenRef.current) return;
    micTestHeldDeafenRef.current = false;
    const live = useLiveKitStore.getState();
    if (live.isDeafened) {
      await live.toggleDeafen();
    }
  };

  const startMicListener = async () => {
    try {
      stopMicListener(true);
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId:
            shownVoice.audioInputDeviceId &&
            shownVoice.audioInputDeviceId !== 'default' &&
            shownVoice.audioInputDeviceId !== 'communications'
              ? { exact: shownVoice.audioInputDeviceId }
              : undefined,
          echoCancellation: shownVoice.echoAmount > 0,
          noiseSuppression: shownVoice.noiseAmount > 0,
          autoGainControl: false,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const previewSink = shownVoice.audioOutputDeviceId;
      if (
        previewSink &&
        previewSink !== 'default' &&
        previewSink !== 'communications' &&
        typeof (audioCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function'
      ) {
        await (audioCtx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(previewSink).catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;

      const track = stream.getAudioTracks()[0];
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      let monitor: AudioNode = source;
      if (track) {
        try {
          const preview = await attachPreviewCleaner(audioCtx, track, cleanerDraft());
          monitor = preview.output;
          previewLevelsRef.current = preview.setLevels;
        } catch {}
      }
      filteredSourceRef.current = monitor;

      const timeBuffer = new Uint8Array(analyser.fftSize);
      const freqBuffer = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        analyser.getByteTimeDomainData(timeBuffer);
        analyser.getByteFrequencyData(freqBuffer);
        let sumSquares = 0;
        for (let i = 0; i < timeBuffer.length; i++) {
          const sample = (timeBuffer[i] - 128) / 128;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const db = 20 * Math.log10(Math.max(0.00001, rms));
        const normalized = Math.max(0, Math.min(100, Math.round(((db + 50) / 30) * 100)));
        const binHz = (audioCtx.sampleRate || 48000) / analyser.fftSize;
        const lowStop = Math.max(2, Math.round(220 / binHz));
        const speechStart = Math.max(lowStop + 1, Math.round(300 / binHz));
        const speechStop = Math.min(freqBuffer.length, Math.round(3200 / binHz));
        let low = 0;
        let speech = 0;
        for (let i = 1; i < lowStop; i++) low += freqBuffer[i];
        for (let i = speechStart; i < speechStop; i++) speech += freqBuffer[i];
        low /= Math.max(1, lowStop - 1);
        speech /= Math.max(1, speechStop - speechStart);
        setMicBreath(low > 14 && low > speech * 1.3 && speech < 42);
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch {
      // User may not have mic plugged in
    }
  };

  const stopMicListener = (keepPrivacy = false) => {
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
    if (!keepPrivacy) {
      setIsMicTesting(false);
      void releaseMicTestPrivacy();
    }
    filteredSourceRef.current = null;
    previewLevelsRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setMicBreath(false);
  };

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
  }, [isOpen, shownVoice.audioInputDeviceId, shownVoice.noiseAmount > 0, shownVoice.echoAmount > 0]);

  useEffect(() => {
    const draft = cleanerDraft();
    previewLevelsRef.current?.(draft);
    const savedPtt = useSettingsStore.getState().inputMode === 'push-to-talk';
    const handle = window.setTimeout(() => {
      useLiveKitStore.getState().syncCaptureToLevels({ ...draft, ptt: savedPtt }).catch(() => {});
    }, 160);
    return () => window.clearTimeout(handle);
  }, [
    shownVoice.noiseAmount,
    shownVoice.echoAmount,
    shownVoice.sensitivityThreshold,
    shownVoice.autoSensitivity,
  ]);

  const handleToggleMicTest = async () => {
    if (isMicTesting) {
      if (micTestGainRef.current) {
        try {
          micTestGainRef.current.disconnect();
        } catch {}
        micTestGainRef.current = null;
      }
      setIsMicTesting(false);
      await releaseMicTestPrivacy();
      return;
    }

    const live = useLiveKitStore.getState();
    if (live.connectionState === ConnectionState.Connected && live.room && !live.isDeafened) {
      micTestHeldDeafenRef.current = true;
      await live.toggleDeafen();
    }

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
        await releaseMicTestPrivacy();
      }
    } else {
      await releaseMicTestPrivacy();
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
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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
              <div className="space-y-4">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-text-muted">Devices</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="block text-xs font-medium text-text-secondary">Microphone</span>
                      <div className="relative">
                        <select
                          value={shownVoice.audioInputDeviceId}
                          onChange={(e) => patchVoice({ audioInputDeviceId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                        >
                          <option value="default">Default Microphone</option>
                          {availableInputs
                            .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
                            .map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Microphone ${d.deviceId.substring(0, 5)}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-2 pointer-events-none" />
                      </div>
                    </label>
                    <label className="space-y-1.5">
                      <span className="block text-xs font-medium text-text-secondary">Headphones</span>
                      <div className="relative">
                        <select
                          value={shownVoice.audioOutputDeviceId}
                          onChange={(e) => patchVoice({ audioOutputDeviceId: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                        >
                          <option value="default">Default Output</option>
                          {availableOutputs
                            .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
                            .map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Speaker ${d.deviceId.substring(0, 5)}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-2 pointer-events-none" />
                      </div>
                    </label>
                  </div>
                </section>

                <section className="rounded-xl border border-border-subtle bg-bg-elevated p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-text-primary">Output volume</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-secondary w-10 text-right">{outputVolume}%</span>
                      <button
                        type="button"
                        onClick={handleTestSpeaker}
                        disabled={isSpeakerTesting}
                        className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer ${
                          isSpeakerTesting
                            ? 'bg-emerald-500 text-white'
                            : 'bg-highlight text-highlight-text hover:bg-white'
                        }`}
                      >
                        {isSpeakerTesting ? 'Playing...' : 'Play Test Sound'}
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="1"
                    value={outputVolume}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setOutputVolume(val);
                      setMasterOutputVolume(val);
                    }}
                    className="w-full accent-highlight cursor-pointer"
                  />
                </section>

                <section className="rounded-xl border border-border-subtle bg-bg-elevated p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-text-primary">Input sensitivity</div>
                      <div className="text-[11px] text-text-muted">Auto ignores breath and room noise.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchVoice({ autoSensitivity: !shownVoice.autoSensitivity })}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        shownVoice.autoSensitivity ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full transition-transform ${
                          shownVoice.autoSensitivity
                            ? 'bg-highlight-text translate-x-5'
                            : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {(() => {
                    const cutoff = shownVoice.autoSensitivity ? 32 : shownVoice.sensitivityThreshold;
                    const sending = !micBreath && micLevel >= cutoff;
                    return (
                      <div className="space-y-1">
                        <div className="relative w-full h-1.5 rounded-full bg-bg-main overflow-hidden">
                          <div
                            className={`h-full ${sending ? 'bg-emerald-500' : 'bg-highlight/60'}`}
                            style={{ width: `${micLevel}%` }}
                          />
                          {!shownVoice.autoSensitivity && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                              style={{ left: `${Math.min(99, Math.max(1, shownVoice.sensitivityThreshold))}%` }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-text-muted">{micLevel}%</span>
                          <span className={sending ? 'text-emerald-400' : 'text-text-muted'}>
                            {micBreath ? 'Breath' : sending ? 'Open' : 'Closed'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {!shownVoice.autoSensitivity && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-text-secondary">
                        <span>Threshold</span>
                        <span className="font-mono">{shownVoice.sensitivityThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={shownVoice.sensitivityThreshold}
                        onChange={(e) => patchVoice({ sensitivityThreshold: Number(e.target.value) })}
                        className="w-full accent-highlight cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-border-subtle">
                    <span className="text-[11px] text-text-muted">
                      {isMicTesting ? 'Muted in the channel' : 'Hear yourself'}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleMicTest}
                      className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer shrink-0 ${
                        isMicTesting
                          ? 'bg-rose-500 text-white hover:bg-rose-600'
                          : 'bg-highlight text-highlight-text hover:bg-white'
                      }`}
                    >
                      {isMicTesting ? 'Stop Testing' : "Let's Check"}
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-border-subtle bg-bg-elevated p-3 space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">Noise</span>
                      <span className="font-mono text-text-muted">{shownVoice.noiseAmount <= 0 ? 'Off' : `${shownVoice.noiseAmount}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={shownVoice.noiseAmount}
                      onChange={(e) => patchVoice({ noiseAmount: Number(e.target.value) })}
                      className="w-full accent-highlight cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">Echo</span>
                      <span className="font-mono text-text-muted">{shownVoice.echoAmount <= 0 ? 'Off' : `${shownVoice.echoAmount}%`}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={shownVoice.echoAmount}
                      onChange={(e) => patchVoice({ echoAmount: Number(e.target.value) })}
                      className="w-full accent-highlight cursor-pointer"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border-subtle bg-bg-elevated p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-text-primary">Push to talk</span>
                    <button
                      type="button"
                      onClick={() => patchVoice({ pushToTalk: !shownVoice.pushToTalk })}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        shownVoice.pushToTalk ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full transition-transform ${
                          shownVoice.pushToTalk
                            ? 'bg-highlight-text translate-x-5'
                            : 'bg-text-muted translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {shownVoice.pushToTalk && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-text-muted">
                          {isRecordingPttKey ? 'Press a key or mouse button' : 'Hold this key to talk'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsRecordingPttKey(true)}
                            className={`h-8 min-w-16 px-3 rounded-lg border font-mono text-xs font-bold cursor-pointer ${
                              isRecordingPttKey
                                ? 'bg-highlight text-highlight-text border-highlight'
                                : 'bg-bg-main text-text-primary border-border-subtle'
                            }`}
                          >
                            {isRecordingPttKey ? 'Listening...' : (shownVoice.pushToTalkKey || 'Space')}
                          </button>
                          {isRecordingPttKey && (
                            <button
                              type="button"
                              onClick={() => setIsRecordingPttKey(false)}
                              className="h-8 px-2 rounded-lg text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
                        <span className="text-xs text-text-secondary">
                          PTT sound {pttSoundEnabled ? 'on' : 'off'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => sounds.previewPtt(true)}
                            className="h-8 px-2.5 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer"
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
                                pttSoundEnabled ? 'bg-highlight-text translate-x-5' : 'bg-text-muted translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {shownVoice.pushToTalk && (
                    <p className="text-[11px] text-text-muted">
                      {window.nightshift?.isElectron || window.nightshift?.setGlobalPttKey
                        ? 'Works in games.'
                        : 'In the browser, only while this tab is focused.'}
                    </p>
                  )}
                </section>

                <section className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2.5">
                  <span className="text-xs font-semibold text-text-primary">Soundboard while muted</span>
                  <button
                    type="button"
                    onClick={() => setAllowWhileMuted(!allowWhileMuted)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 cursor-pointer ${
                      allowWhileMuted ? 'bg-highlight' : 'bg-bg-main border border-border-subtle'
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
                </section>
              </div>
            )}

            {activeTab === 'sounds' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-text-primary mb-1">Sound Effects & Audio Cues</h3>
                  <p className="text-xs text-text-secondary">
                    Master volume and the cues you want to hear.
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
                        Turns every cue on or off.
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

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    Individual Audio Cues
                  </h4>

                  <div className="rounded-xl bg-bg-elevated border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-text-primary">Push to talk</span>
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
                    <button
                      type="button"
                      onClick={() => sounds.previewPtt(true)}
                      className="h-8 w-full rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      Preview
                    </button>
                  </div>

                  <div className="rounded-xl bg-bg-elevated border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-text-primary">Join and leave</span>
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
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => sounds.previewCue('join')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Join (Me)</button>
                      <button type="button" onClick={() => sounds.previewCue('leave')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Leave (Me)</button>
                      <button type="button" onClick={() => sounds.previewCue('userconnected')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer">User Connected</button>
                      <button type="button" onClick={() => sounds.previewCue('userdisconnected')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer">User Disconnected</button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-bg-elevated border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-text-primary">Mute and deafen</span>
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
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => sounds.previewCue('mute')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Mute</button>
                      <button type="button" onClick={() => sounds.previewCue('unmute')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Unmute</button>
                      <button type="button" onClick={() => sounds.previewCue('deafen')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Deafen</button>
                      <button type="button" onClick={() => sounds.previewCue('undeafen')} className="h-8 rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer">Undeafen</button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-bg-elevated border border-border-subtle p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-text-primary">Button clicks</span>
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
                    <button
                      type="button"
                      onClick={() => sounds.previewButtonClick()}
                      className="h-8 w-full rounded-lg border border-border-subtle bg-bg-main text-[11px] font-bold text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      Preview
                    </button>
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
        {voiceDirty && (
          <div className="shrink-0 border-t border-border-subtle bg-bg-main px-6 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-text-secondary">Audio changes are not saved yet.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={discardVoice}
                className="px-3.5 py-2 rounded-xl bg-bg-elevated hover:bg-bg-hover border border-border-subtle text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => { saveVoice().catch(() => {}); }}
                className="px-3.5 py-2 rounded-xl bg-highlight hover:bg-white text-highlight-text text-xs font-bold transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
