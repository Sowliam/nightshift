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
import { sounds } from '../../services/sound.service';
import { APP_VERSION, APP_NAME } from '@nightshift/shared';
import { getApiBase, setApiBase, getFullAvatarUrl } from '../../lib/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'account' | 'about'>('voice');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [backendUrl, setBackendUrl] = useState(() => getApiBase());
  const [backendUrlSaved, setBackendUrlSaved] = useState(false);

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
  } = useSettingsStore();

  const { user, updateDisplayName, updateAvatar, logout } = useAuthStore();
  const { setAudioInputDevice, setAudioOutputDevice } = useLiveKitStore();

  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

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
    } catch {
      // User may not have mic plugged in
    }
  };

  const stopMicListener = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
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

  const handleTestSpeaker = () => {
    sounds.playJoin();
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
                <div className="p-3.5 rounded-xl bg-bg-elevated border border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 text-highlight" />
                    <div>
                      <div className="text-xs font-bold text-text-primary">Output Volume & Speaker Test</div>
                      <div className="text-[11px] text-text-muted">Test sound playback on your selected speaker</div>
                    </div>
                  </div>
                  <button
                    onClick={handleTestSpeaker}
                    className="px-3 py-1.5 rounded-lg bg-highlight hover:bg-white text-highlight-text text-xs font-bold transition-all shadow-sm"
                  >
                    Play Test Sound
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

                  {/* Live Mic Meter Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 rounded-full bg-bg-elevated border border-border-subtle overflow-hidden">
                      <div
                        className="h-full bg-highlight transition-all duration-75"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-text-muted">
                      <span>Mic Input Level: {micLevel}%</span>
                      <span>{micLevel > (autoSensitivity ? 15 : sensitivityThreshold) ? 'Transmitting Audio' : 'Silence'}</span>
                    </div>
                  </div>

                  {!autoSensitivity && (
                    <div className="pt-2">
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <span>Manual Sensitivity Threshold</span>
                        <span>{sensitivityThreshold}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={sensitivityThreshold}
                        onChange={(e) => setSensitivityThreshold(Number(e.target.value))}
                        className="w-full accent-highlight cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Noise Suppression (Matching Screenshot) */}
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Noise Suppression</div>
                    <div className="text-[11px] text-text-secondary">
                      Reduces background noise from your mic. Powered by Krisp.
                    </div>
                    <div className="text-xs font-black tracking-wider text-highlight mt-1">krisp</div>
                  </div>
                  <div className="relative">
                    <select
                      value={noiseSuppression}
                      onChange={(e) => setNoiseSuppression(e.target.value as any)}
                      className="px-4 py-2 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-highlight appearance-none pr-8 cursor-pointer"
                    >
                      <option value="standard">Standard</option>
                      <option value="krisp">Krisp AI</option>
                      <option value="none">Disabled</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-text-muted absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>

                {/* 4. Echo Cancellation (Matching Screenshot) */}
                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-primary">Echo Cancellation</div>
                    <div className="text-[11px] text-text-secondary">
                      Eliminates room echo when speaking without headphones
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEchoCancellation(!echoCancellation)}
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
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-elevated border border-border-subtle">
                      <span className="text-xs text-text-secondary">PTT Keybind Shortcut</span>
                      <input
                        type="text"
                        value={pushToTalkKey}
                        onChange={(e) => setPushToTalkKey(e.target.value.toUpperCase() || 'SPACE')}
                        className="w-24 px-2 py-1 rounded bg-bg-main border border-border-subtle text-xs text-center font-mono font-bold text-highlight focus:outline-none"
                      />
                    </div>
                  )}
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
                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle text-xs text-text-muted space-y-1">
                  <div>Version: {APP_VERSION}</div>
                  <div>LiveKit WebRTC: Connected</div>
                  <div>Theme: True Pitch Black (#0A0908) & Ivory Snow (#F1FAEE)</div>
                </div>

                <div className="p-4 rounded-xl bg-bg-elevated border border-border-subtle text-xs space-y-2">
                  <div className="font-bold text-text-primary text-xs flex items-center justify-between">
                    <span>Backend Server API</span>
                    {backendUrlSaved && (
                      <span className="text-accent text-[11px] font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved!
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Point your client to any self-hosted or cloud-hosted NIGHTSHIFT backend API.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={backendUrl}
                      onChange={(e) => setBackendUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-bg-main border border-border-subtle text-xs text-text-primary font-mono focus:outline-none focus:border-highlight"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setApiBase(backendUrl);
                        setBackendUrlSaved(true);
                        setTimeout(() => setBackendUrlSaved(false), 2500);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-highlight text-highlight-text font-bold text-xs hover:bg-white transition-colors shadow-sm"
                    >
                      Save URL
                    </button>
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
