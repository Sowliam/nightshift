// Soft CC0 UI cues (SFXMint). Played quietly through a lowpass so they stay warm, not sharp.

class SoundService {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private masterGain: number = 0.5;
  private cues = new Map<string, Promise<AudioBuffer>>();

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
  }

  public setVolume(volPercent: number) {
    this.masterGain = Math.max(0, Math.min(1, volPercent / 100));
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

  private playCue(name: string) {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;
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
  }

  public playMute() {
    this.playCue('mute');
  }

  public playUnmute() {
    this.playCue('unmute');
  }

  public playDeafen() {
    this.playCue('deafen');
  }

  public playUndeafen() {
    this.playCue('undeafen');
  }

  public playJoin() {
    this.playCue('join');
  }

  public playDisconnect() {
    this.playCue('leave');
  }

  // 7. Push-To-Talk Activate Click (Super subtle 800Hz blip)
  public playPttActivate() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

    gain.gain.setValueAtTime(this.masterGain * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // 8. Push-To-Talk Deactivate Click (Super subtle 500Hz blip)
  public playPttDeactivate() {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(this.masterGain * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }
}

export const sounds = new SoundService();
