import type { AudioProcessorOptions, TrackProcessor } from 'livekit-client';
import { Track } from 'livekit-client';

const WORKLET_NAME = 'nightshift-cleaner';

export type CleanerState = {
  noise: number;
  echo: number;
  sensitivity: number;
  auto: boolean;
  ptt: boolean;
};

const WORKLET_SOURCE = `
class NightshiftCleaner extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noise = 0;
    this.echo = 0;
    this.sensitivity = 0.35;
    this.auto = 1;
    this.ptt = 0;
    this.low = 0;
    this.speechEnv = 0;
    this.lowEnv = 0;
    this.floor = 0.003;
    this.gain = 1;
    this.breath = 0;
    this.x1 = 0;
    this.y1 = 0;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (typeof data.noise === 'number') this.noise = Math.max(0, Math.min(1, data.noise));
      if (typeof data.echo === 'number') this.echo = Math.max(0, Math.min(1, data.echo));
      if (typeof data.sensitivity === 'number') this.sensitivity = Math.max(0, Math.min(1, data.sensitivity));
      if (typeof data.auto === 'number') this.auto = data.auto ? 1 : 0;
      if (typeof data.ptt === 'number') this.ptt = data.ptt ? 1 : 0;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!input || !output) return true;

    const noise = this.noise;
    const echo = this.echo;
    const lpA = 1 - Math.exp((-2 * Math.PI * 190) / sampleRate);
    const hpCut = echo > 0.005 ? 90 + echo * 80 : 0;
    const hpA = hpCut > 0 ? Math.exp((-2 * Math.PI * hpCut) / sampleRate) : 0;
    const attack = Math.exp(-1 / (sampleRate * 0.008));
    const release = Math.exp(-1 / (sampleRate * 0.09));

    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      this.low += lpA * (x - this.low);
      const speech = x - this.low;
      const lowAbs = Math.abs(this.low);
      const speechAbs = Math.abs(speech);
      this.lowEnv = lowAbs > this.lowEnv
        ? attack * this.lowEnv + (1 - attack) * lowAbs
        : release * this.lowEnv + (1 - release) * lowAbs;
      this.speechEnv = speechAbs > this.speechEnv
        ? attack * this.speechEnv + (1 - attack) * speechAbs
        : release * this.speechEnv + (1 - release) * speechAbs;

      const breathLike = this.lowEnv > 0.0045 && this.lowEnv > this.speechEnv * 1.45 && this.speechEnv < 0.028;
      this.breath = breathLike ? Math.min(1, this.breath + 0.018) : this.breath * 0.965;
      const isBreath = this.breath > 0.42;

      if (!isBreath && this.speechEnv < this.floor * 1.2) {
        this.floor = this.floor * 0.99 + this.speechEnv * 0.01;
      }

      let gate = 1;
      if (!this.ptt) {
        const thresh = this.auto
          ? Math.max(0.011, this.floor * 5.2)
          : Math.pow(10, (-50 + this.sensitivity * 30) / 20);
        const openness = thresh <= 0.00001 ? 1 : this.speechEnv / thresh;
        gate = openness >= 1 ? 1 : Math.pow(Math.max(0, openness), 1.65);
      }

      let noiseGain = 1;
      if (noise > 0.005 && !isBreath) {
        const open = this.speechEnv / Math.max(0.001, this.floor * (1.8 + noise * 5));
        const closed = open >= 1 ? 1 : Math.pow(Math.max(0, open), 1 + noise * 1.3);
        noiseGain = (1 - noise) + noise * closed;
      }

      let sample = x;
      if (echo > 0.005) {
        const hp = hpA * (this.y1 + x - this.x1);
        this.x1 = x;
        this.y1 = hp;
        sample = hp;
      } else {
        this.x1 = x;
        this.y1 = 0;
      }
      if (isBreath) sample = speech * 0.12;

      const breathDuck = isBreath ? 0.05 : 1;
      const target = gate * noiseGain * breathDuck;
      const coeff = target > this.gain ? 0.42 : 0.018;
      this.gain += (target - this.gain) * coeff;
      output[i] = sample * this.gain;
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', NightshiftCleaner);
`;

const loadedContexts = new WeakSet<AudioContext>();
let activeNode: AudioWorkletNode | null = null;

let liveState: CleanerState = {
  noise: 75,
  echo: 70,
  sensitivity: 35,
  auto: true,
  ptt: false,
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toMessage(state: CleanerState) {
  return {
    noise: clampPercent(state.noise) / 100,
    echo: clampPercent(state.echo) / 100,
    sensitivity: clampPercent(state.sensitivity) / 100,
    auto: state.auto ? 1 : 0,
    ptt: state.ptt ? 1 : 0,
  };
}

async function loadWorklet(ctx: AudioContext) {
  if (loadedContexts.has(ctx)) return;
  const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await ctx.audioWorklet.addModule(url);
    loadedContexts.add(ctx);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function readCleanerState(): CleanerState {
  return { ...liveState };
}

export function setVoiceCleanerState(partial: Partial<CleanerState>) {
  liveState = {
    noise: partial.noise === undefined ? liveState.noise : clampPercent(partial.noise),
    echo: partial.echo === undefined ? liveState.echo : clampPercent(partial.echo),
    sensitivity: partial.sensitivity === undefined ? liveState.sensitivity : clampPercent(partial.sensitivity),
    auto: partial.auto === undefined ? liveState.auto : partial.auto,
    ptt: partial.ptt === undefined ? liveState.ptt : partial.ptt,
  };
  activeNode?.port.postMessage(toMessage(liveState));
}

export function setVoiceCleanerLevels(noiseAmount: number, echoAmount: number) {
  setVoiceCleanerState({ noise: noiseAmount, echo: echoAmount });
}

export function captureConstraintFlags(noiseAmount: number, echoAmount: number) {
  return {
    echoCancellation: echoAmount > 0,
    noiseSuppression: noiseAmount > 0,
    autoGainControl: false,
    channelCount: 1 as const,
  };
}

class VoiceCleanerGraph {
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  processedTrack: MediaStreamTrack | null = null;
  output: AudioNode | null = null;

  async attach(
    ctx: AudioContext,
    track: MediaStreamTrack,
    state: CleanerState,
    publish: boolean,
  ) {
    await loadWorklet(ctx);
    this.source = ctx.createMediaStreamSource(new MediaStream([track]));
    this.node = new AudioWorkletNode(ctx, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.dest = ctx.createMediaStreamDestination();
    this.source.connect(this.node);
    this.node.connect(this.dest);
    const message = toMessage(publish ? liveState : state);
    this.node.port.postMessage(message);
    if (publish) activeNode = this.node;
    this.output = this.node;
    this.processedTrack = this.dest.stream.getAudioTracks()[0] || null;
  }

  post(state: CleanerState) {
    this.node?.port.postMessage(toMessage(state));
  }

  async destroy() {
    if (activeNode === this.node) activeNode = null;
    try { this.source?.disconnect(); } catch {}
    try { this.node?.disconnect(); } catch {}
    try { this.processedTrack?.stop(); } catch {}
    this.source = null;
    this.node = null;
    this.dest = null;
    this.output = null;
    this.processedTrack = null;
  }
}

export function createVoiceProcessor(
  readLevels: () => CleanerState,
): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  let graph: VoiceCleanerGraph | null = null;
  const processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
    name: 'nightshift-voice-cleaner',
    async init(opts) {
      graph = new VoiceCleanerGraph();
      const levels = readLevels();
      liveState = { ...levels };
      await graph.attach(opts.audioContext, opts.track, levels, true);
      processor.processedTrack = graph.processedTrack ?? undefined;
    },
    async restart(opts) {
      await processor.destroy();
      await processor.init(opts);
    },
    async destroy() {
      await graph?.destroy();
      graph = null;
      processor.processedTrack = undefined;
    },
  };
  return processor;
}

export async function attachPreviewCleaner(
  ctx: AudioContext,
  track: MediaStreamTrack,
  state: CleanerState,
): Promise<{ output: AudioNode; setLevels: (next: CleanerState) => void }> {
  const graph = new VoiceCleanerGraph();
  await graph.attach(ctx, track, state, false);
  return {
    output: graph.output || ctx.createGain(),
    setLevels: (next) => graph.post(next),
  };
}
