import { SoundboardItem, soundboardStorage } from './soundboard.storage';

/**
 * Creates a valid PCM 16-bit Mono WAV ArrayBuffer from an AudioBuffer
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const channelData = buffer.getChannelData(0);
  const dataLength = channelData.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM audio samples
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return arrayBuffer;
}

/**
 * Generates built-in sound effects via Web Audio synthesis
 */
export async function seedDefaultSoundsIfEmpty(): Promise<void> {
  const existing = await soundboardStorage.getAllItems();
  if (existing.length > 0) return; // User already has sounds

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  let ctx: AudioContext;
  try {
    try {
      ctx = new AudioCtx({ sampleRate: 44100 });
    } catch {
      ctx = new AudioCtx();
    }
  } catch {
    return;
  }

  try {
    // 1. Airhorn Sound
    const airhornDuration = 0.8;
    const airhornBuffer = ctx.createBuffer(1, Math.floor(44100 * airhornDuration), 44100);
    const d1 = airhornBuffer.getChannelData(0);
    for (let i = 0; i < d1.length; i++) {
      const t = i / 44100;
      // Staccato sawtooth chord: 466Hz (Bb4) + 622Hz (Eb5) + 698Hz (F5)
      const saw1 = 2 * ((t * 466.16) % 1) - 1;
      const saw2 = 2 * ((t * 622.25) % 1) - 1;
      const saw3 = 2 * ((t * 698.46) % 1) - 1;
      const env = Math.exp(-t * 2.5);
      d1[i] = (saw1 * 0.4 + saw2 * 0.3 + saw3 * 0.3) * env * 0.7;
    }
    const airhornWav = audioBufferToWav(airhornBuffer);
    const airhornItem: SoundboardItem = {
      id: 'preset_airhorn',
      name: 'Airhorn',
      category: 'Memes',
      volume: 85,
      hotkey: 'Numpad1',
      duration: Math.round(airhornDuration * 10) / 10,
      createdAt: Date.now() - 5000,
    };
    await soundboardStorage.saveSound(airhornItem, airhornWav);

    // 2. Victory / Tada Fanfare
    const tadaDuration = 1.2;
    const tadaBuffer = ctx.createBuffer(1, Math.floor(44100 * tadaDuration), 44100);
    const d2 = tadaBuffer.getChannelData(0);
    const notes = [
      { freq: 523.25, start: 0.0, end: 0.2 }, // C5
      { freq: 659.25, start: 0.2, end: 0.4 }, // E5
      { freq: 783.99, start: 0.4, end: 0.6 }, // G5
      { freq: 1046.5, start: 0.6, end: 1.2 }, // C6
    ];
    for (let i = 0; i < d2.length; i++) {
      const t = i / 44100;
      let sample = 0;
      for (const n of notes) {
        if (t >= n.start && t < n.end) {
          const nt = t - n.start;
          const env = Math.sin((nt / (n.end - n.start)) * Math.PI);
          sample += Math.sin(2 * Math.PI * n.freq * nt) * env * 0.6;
        }
      }
      d2[i] = sample;
    }
    const tadaWav = audioBufferToWav(tadaBuffer);
    const tadaItem: SoundboardItem = {
      id: 'preset_victory',
      name: 'Victory Fanfare',
      category: 'Gaming',
      volume: 80,
      hotkey: 'Numpad2',
      duration: Math.round(tadaDuration * 10) / 10,
      createdAt: Date.now() - 4000,
    };
    await soundboardStorage.saveSound(tadaItem, tadaWav);

    // 3. Discord Ping / Notification
    const pingDuration = 0.5;
    const pingBuffer = ctx.createBuffer(1, Math.floor(44100 * pingDuration), 44100);
    const d3 = pingBuffer.getChannelData(0);
    for (let i = 0; i < d3.length; i++) {
      const t = i / 44100;
      const f1 = 880;
      const f2 = 1760;
      const env = Math.exp(-t * 9);
      d3[i] = (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * env * 0.8;
    }
    const pingWav = audioBufferToWav(pingBuffer);
    const pingItem: SoundboardItem = {
      id: 'preset_notification',
      name: 'Message Ping',
      category: 'Reactions',
      volume: 75,
      hotkey: 'Numpad3',
      duration: Math.round(pingDuration * 10) / 10,
      createdAt: Date.now() - 3000,
    };
    await soundboardStorage.saveSound(pingItem, pingWav);

    // 4. Dramatic Bass Drop / Boom
    const boomDuration = 1.4;
    const boomBuffer = ctx.createBuffer(1, Math.floor(44100 * boomDuration), 44100);
    const d4 = boomBuffer.getChannelData(0);
    for (let i = 0; i < d4.length; i++) {
      const t = i / 44100;
      // Frequency drops from 150Hz to 35Hz
      const freq = Math.max(30, 150 * Math.exp(-t * 3));
      const env = Math.exp(-t * 2);
      d4[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    }
    const boomWav = audioBufferToWav(boomBuffer);
    const boomItem: SoundboardItem = {
      id: 'preset_bassdrop',
      name: 'Bass Drop',
      category: 'Memes',
      volume: 80,
      hotkey: 'Numpad4',
      duration: Math.round(boomDuration * 10) / 10,
      createdAt: Date.now() - 2000,
    };
    await soundboardStorage.saveSound(boomItem, boomWav);
  } catch (err) {
    console.warn('Error seeding default sounds:', err);
  } finally {
    ctx.close().catch(() => {});
  }
}
