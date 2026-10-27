// Soft CC0 UI cues (SFXMint). Played quietly through a lowpass so they stay warm, not sharp.

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

  private prefs: SoundPreferences = {
    masterEnabled: true,
    masterVolume: 70,
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

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.prefs.masterEnabled = enabled;
  }

  public setVolume(volPercent: number) {
    this.masterGain = Math.max(0, Math.min(1, volPercent / 100));
    this.prefs.masterVolume = volPercent;
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
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {}
    }
  }

  private loadCue(ctx: AudioContext, name: string) {
    let pending = this.cues.get(name);
    if (!pending) {
      pending = fetch(`/sounds/ui/${name}.mp3`)
        .then((res) => {
          if (!res.ok) throw new Error(`Missing cue ${name}`);
          return res.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data));
      this.cues.set(name, pending);
    }
    return pending;
  }

  private playCue(name: string, force: boolean = false) {
    if (!this.isEnabled && !force) return;

    // Primary: Instant native HTML5 Audio element (bulletproof across all browsers without WebAudio suspended time bugs)
    try {
      const audio = new Audio(`/sounds/ui/${name}.mp3`);
      audio.volume = Math.max(0, Math.min(1, this.masterGain * 0.7));
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback to Web Audio if HTML5 audio fails
          this.playCueWebAudio(name, force);
        });
      }
    } catch {
      this.playCueWebAudio(name, force);
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
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 1100;
          filter.Q.value = 0.4;
          const gain = ctx.createGain();
          const now = ctx.currentTime;
          const peak = Math.min(0.4, Math.max(0.04, this.masterGain * 0.32));
          const audible = Math.min(buffer.duration, 0.9);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(peak, now + 0.04);
          gain.gain.setValueAtTime(peak, now + Math.max(0.08, audible - 0.14));
          gain.gain.exponentialRampToValueAtTime(0.0001, now + audible);
          src.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          src.start(now);
          src.stop(now + audible + 0.02);
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
    if (isActivate) this.playPttActivate(true);
    else this.playPttDeactivate(true);
  }

  public previewCue(name: 'join' | 'leave' | 'mute' | 'unmute' | 'deafen' | 'undeafen') {
    this.playCue(name, true);
  }

  public previewButtonClick() {
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
