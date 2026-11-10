const WORKLET_NAME = 'nightshift-share-isolate';

const WORKLET_SOURCE = `
class NightshiftShareIsolate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mask = 16383;
    this.loopHist = new Float32Array(16384);
    this.refHist = new Float32Array(16384);
    this.pos = 0;
    this.seen = 0;
    this.delay = 0;
    this.gain = 0;
    this.ready = 0;
    this.tries = 0;
  }

  calibrate() {
    let best = 0;
    let bestC = 0;
    let bestE = 0;
    const maxDelay = Math.min(12000, this.seen - 2048);
    if (maxDelay < 32) return;
    for (let d = 0; d <= maxDelay; d += 16) {
      let c = 0;
      let e = 0;
      for (let k = 0; k < 2048; k += 4) {
        const idx = (this.pos - 1 - k) & this.mask;
        const refIdx = (idx - d) & this.mask;
        const r = this.refHist[refIdx];
        c += this.loopHist[idx] * r;
        e += r * r;
      }
      if (c > bestC) {
        bestC = c;
        best = d;
        bestE = e;
      }
    }
    let fine = best;
    let fineC = bestC;
    let fineE = bestE;
    const start = Math.max(0, best - 16);
    const end = Math.min(maxDelay, best + 16);
    for (let d = start; d <= end; d++) {
      let c = 0;
      let e = 0;
      for (let k = 0; k < 2048; k += 2) {
        const idx = (this.pos - 1 - k) & this.mask;
        const refIdx = (idx - d) & this.mask;
        const r = this.refHist[refIdx];
        c += this.loopHist[idx] * r;
        e += r * r;
      }
      if (c > fineC) {
        fineC = c;
        fine = d;
        fineE = e;
      }
    }
    this.delay = fine;
    const next = fineE > 1e-6 ? fineC / fineE : 0;
    this.gain = fineC > 0.002 ? Math.max(0, Math.min(1.4, next)) : 0;
    this.ready = 1;
    this.tries += 1;
  }

  process(inputs, outputs) {
    const loop = inputs[0] && inputs[0][0];
    const ref = inputs[1] && inputs[1][0];
    const out = outputs[0] && outputs[0][0];
    if (!loop || !out) return true;
    const n = loop.length;
    let refEnergy = 0;
    for (let i = 0; i < n; i++) {
      const r = ref ? ref[i] : 0;
      this.loopHist[this.pos] = loop[i];
      this.refHist[this.pos] = r;
      refEnergy += r * r;
      this.pos = (this.pos + 1) & this.mask;
    }
    this.seen += n;
    if ((!this.ready && this.seen > sampleRate * 0.45) || (this.ready && this.gain === 0 && refEnergy > 0.002 && this.tries < 4)) {
      this.calibrate();
    }
    for (let i = 0; i < n; i++) {
      const idx = (this.pos - n + i) & this.mask;
      const refIdx = (idx - this.delay) & this.mask;
      const sample = this.loopHist[idx] - this.gain * this.refHist[refIdx];
      out[i] = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', NightshiftShareIsolate);
`;

export interface IsolatedShareAudio {
  track: MediaStreamTrack;
  stop: () => void;
}

export async function isolateSharedSystemAudio(loopback: MediaStreamTrack): Promise<IsolatedShareAudio> {
  const passthrough = { track: loopback, stop: () => {} };
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return passthrough;

  const elements = Array.from(
    document.querySelectorAll<HTMLMediaElement>(
      '#nightshift-voice-audio-container audio, #nightshift-soundboard-audio-container audio',
    ),
  );
  const captured: MediaStream[] = [];
  for (const el of elements) {
    const grab = (el as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream;
    if (typeof grab !== 'function') continue;
    try {
      const stream = grab.call(el);
      if (stream.getAudioTracks().length > 0) captured.push(stream);
    } catch {
      // The element is not playing yet. The shared mix simply will not include it.
    }
  }
  if (captured.length === 0) return passthrough;

  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(url);
  } catch {
    URL.revokeObjectURL(url);
    await ctx.close().catch(() => {});
    return passthrough;
  }
  URL.revokeObjectURL(url);

  const loopSrc = ctx.createMediaStreamSource(new MediaStream([loopback]));
  const mix = ctx.createGain();
  const taps: MediaStreamAudioSourceNode[] = [];
  for (const stream of captured) {
    const src = ctx.createMediaStreamSource(stream);
    src.connect(mix);
    taps.push(src);
  }
  const node = new AudioWorkletNode(ctx, WORKLET_NAME, {
    numberOfInputs: 2,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const dest = ctx.createMediaStreamDestination();
  loopSrc.connect(node, 0, 0);
  mix.connect(node, 0, 1);
  node.connect(dest);
  const track = dest.stream.getAudioTracks()[0];
  if (!track) {
    await ctx.close().catch(() => {});
    return passthrough;
  }

  return {
    track,
    stop: () => {
      taps.forEach((tap) => {
        try { tap.disconnect(); } catch { /* already stopped */ }
      });
      try { loopSrc.disconnect(); } catch { /* already stopped */ }
      try { node.disconnect(); } catch { /* already stopped */ }
      try { track.stop(); } catch { /* already stopped */ }
      if (track !== loopback) {
        try { loopback.stop(); } catch { /* already stopped */ }
      }
      ctx.close().catch(() => {});
    },
  };
}
