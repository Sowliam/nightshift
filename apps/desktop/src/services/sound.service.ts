// Soft CC0 UI cues (SFXMint). Played as the original file, full length.
import { getAssetUrl } from '../lib/assets';

export interface SoundPreferences {
  masterEnabled: boolean;
  masterVolume: number; // 0 - 100
  pttSound: boolean;
  joinLeaveSound: boolean;
  muteSound: boolean;
  uiSound: boolean;
}

class SoundService {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private masterGain: number = 0.5;
  private cues = new Map<string, Promise<AudioBuffer>>();
  private players = new Map<string, HTMLAudioElement>();
  private lastCueTrigger = new Map<string, number>();

  private prefs: SoundPreferences = {
    masterEnabled: true,
    masterVolume: 50,
    pttSound: true,
    joinLeaveSound: true,
    muteSound: true,
    uiSound: false,
  };

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public warm() {
    this.getAudioContext();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.prefs.masterEnabled = enabled;
  }

  public setVolume(volPercent: number) {
    this.masterGain = Math.max(0, Math.min(1, volPercent / 100));
    this.prefs.masterVolume = volPercent;
  }

  public setOutputDevice(_deviceId: string) {
    this.players.forEach((audio) => {
      const sink = (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
      if (sink) sink.call(audio, '').catch(() => {});
    });
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (ctx?.setSinkId) ctx.setSinkId('').catch(() => {});
  }

  public setPttSoundEnabled(enabled: boolean) {
    this.prefs.pttSound = enabled;
  }

  public setJoinLeaveSoundEnabled(enabled: boolean) {
    this.prefs.joinLeaveSound = enabled;
  }

  public setMuteSoundEnabled(enabled: boolean) {
    this.prefs.muteSound = enabled;
  }

  public setUiSoundEnabled(enabled: boolean) {
    this.prefs.uiSound = enabled;
  }

  public updatePreferences(prefs: Partial<SoundPreferences>) {
    this.prefs = { ...this.prefs, ...prefs };
    if (prefs.masterEnabled !== undefined) this.isEnabled = prefs.masterEnabled;
    if (prefs.masterVolume !== undefined) {
      this.masterGain = Math.max(0, Math.min(1, prefs.masterVolume / 100));
    }
  }

  public getPreferences(): SoundPreferences {
    return { ...this.prefs };
  }

  public async unlock(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }
  }

  private getCueUrl(name: string): string {
    return getAssetUrl(`sounds/ui/${name}.mp3`);
  }

  private loadCue(ctx: AudioContext, name: string) {
    let pending = this.cues.get(name);
    if (!pending) {
      const url = this.getCueUrl(name);
      pending = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Missing cue ${name} at ${url}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      this.cues.set(name, pending);
    }
    return pending;
  }

  private playCue(name: string, force: boolean = false) {
    if (!this.isEnabled && !force) return;

    // Deduplication debounce guard: prevent duplicate rapid cue playback within 180ms
    const now = Date.now();
    const lastTime = this.lastCueTrigger.get(name) || 0;
    if (!force && now - lastTime < 180) {
      return;
    }
    this.lastCueTrigger.set(name, now);
    this.playCueElement(name);
  }

  private playCueElement(name: string) {
    if (typeof document === 'undefined') {
      this.playCueWebAudio(name, true);
      return;
    }

    let audio = this.players.get(name);
    if (!audio) {
      audio = document.createElement('audio');
      audio.preload = 'auto';
      audio.src = this.getCueUrl(name);
      audio.setAttribute('playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.players.set(name, audio);
    }

    audio.volume = Math.max(0, Math.min(1, this.masterGain * 0.7));
    try {
      audio.currentTime = 0;
    } catch {}
    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(() => this.playCueWebAudio(name, true));
    }
  }

  private playCueWebAudio(name: string, force: boolean = false) {
    if (!this.isEnabled && !force) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const playWithCtx = () => {
      this.loadCue(ctx, name)
        .then((buffer) => {
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const gain = ctx.createGain();
          const now = ctx.currentTime;
          gain.gain.setValueAtTime(Math.max(0.04, Math.min(1, this.masterGain * 0.7)), now);
          src.connect(gain);
          gain.connect(ctx.destination);
          src.start(now);
        })
        .catch(() => {
          this.cues.delete(name);
        });
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playWithCtx).catch(() => {});
    } else {
      playWithCtx();
    }
  }

  public playMute() {
    if (!this.prefs.muteSound) return;
    this.playCue('mute');
  }

  public playUnmute() {
    if (!this.prefs.muteSound) return;
    this.playCue('unmute');
  }

  public playDeafen() {
    if (!this.prefs.muteSound) return;
    this.playCue('deafen');
  }

  public playUndeafen() {
    if (!this.prefs.muteSound) return;
    this.playCue('undeafen');
  }

  public playJoin() {
    if (!this.prefs.joinLeaveSound) return;
    this.playCue('join');
  }

  public playDisconnect() {
    if (!this.prefs.joinLeaveSound) return;
    this.playCue('leave');
  }

  public playUserConnected() {
    if (!this.prefs.joinLeaveSound) return;
    this.playCue('userconnected');
  }

  public playUserDisconnected() {
    if (!this.prefs.joinLeaveSound) return;
    this.playCue('userdisconnected');
  }

  // 7. Push-To-Talk Activate Click (Super subtle 880Hz blip)
  public async playPttActivate(force: boolean = false) {
    if (!force && (!this.isEnabled || !this.prefs.pttSound)) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

    gain.gain.setValueAtTime(Math.max(0.01, this.masterGain * 0.15), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // 8. Push-To-Talk Deactivate Click (Super subtle 540Hz blip)
  public async playPttDeactivate(force: boolean = false) {
    if (!force && (!this.isEnabled || !this.prefs.pttSound)) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(Math.max(0.01, this.masterGain * 0.15), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // 9. UI Button Click (Subtle high-register tick)
  public async playButtonClick(force: boolean = false) {
    if (!force && (!this.isEnabled || !this.prefs.uiSound)) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {}
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.025);

    gain.gain.setValueAtTime(Math.max(0.005, this.masterGain * 0.08), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  }

  // Preview methods that play even if temporarily disabled so the user can test the sound
  public previewPtt(isActivate: boolean = true) {
    void this.unlock();
    if (isActivate) this.playPttActivate(true);
    else this.playPttDeactivate(true);
  }

  public previewCue(name: 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen' | 'userconnected' | 'userdisconnected') {
    void this.unlock();
    this.playCue(name, true);
  }

  public previewButtonClick() {
    void this.unlock();
    this.playButtonClick(true);
  }
}

export const sounds = new SoundService();

// Auto-unlock WebAudio on first user gesture in browser
if (typeof window !== 'undefined') {
  const unlockOnInteraction = () => {
    sounds.unlock();
  };
  window.addEventListener('click', unlockOnInteraction, { passive: true });
  window.addEventListener('keydown', unlockOnInteraction, { passive: true });
  window.addEventListener('touchstart', unlockOnInteraction, { passive: true });
}
