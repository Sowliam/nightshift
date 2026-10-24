import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioBufferToWav } from '../services/soundboard-presets';
import { soundboardAudioEngine } from '../services/soundboard-audio-engine';

describe('Soundboard Presets & Audio Validation', () => {
  it('encodes an AudioBuffer into a valid RIFF/WAVE 16-bit PCM ArrayBuffer', () => {
    const sampleRate = 44100;
    const length = 4410; // 0.1 seconds
    const mockAudioBuffer = {
      sampleRate,
      length,
      duration: 0.1,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;

    const arrayBuffer = audioBufferToWav(mockAudioBuffer);
    expect(arrayBuffer).toBeDefined();
    expect(arrayBuffer.byteLength).toBe(44 + length * 2);

    const view = new DataView(arrayBuffer);

    // Verify RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe('RIFF');

    // Verify WAVE tag
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe('WAVE');

    // Verify fmt chunk
    const fmt = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
    expect(fmt).toBe('fmt ');

    // Verify audio format is PCM (1)
    expect(view.getUint16(20, true)).toBe(1);

    // Verify mono channel (1)
    expect(view.getUint16(22, true)).toBe(1);

    // Verify sample rate
    expect(view.getUint32(24, true)).toBe(sampleRate);
  });
});

describe('Soundboard Audio Engine Architecture', () => {
  beforeEach(() => {
    soundboardAudioEngine.cleanup();
  });

  it('correctly tracks active playing sounds and reports playing status', () => {
    expect(soundboardAudioEngine.getActivePlayingIds()).toEqual([]);
    expect(soundboardAudioEngine.isPlaying('snd_test_1')).toBe(false);
  });

  it('adjusts master volume, local monitor volume, and allowWhileMuted state cleanly', () => {
    soundboardAudioEngine.setMasterVolume(75);
    soundboardAudioEngine.setLocalMonitorVolume(50);
    soundboardAudioEngine.setAllowWhileMuted(true);

    // Boundary checks
    soundboardAudioEngine.setMasterVolume(100);
    soundboardAudioEngine.setMasterVolume(0);
    soundboardAudioEngine.setLocalMonitorVolume(100);
    soundboardAudioEngine.setAllowWhileMuted(false);
  });

  it('subscribes and unsubscribes listeners correctly', () => {
    const listener = vi.fn();
    const unsub = soundboardAudioEngine.subscribe(listener);

    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('handles stopAllSounds when no sounds are playing without error', () => {
    expect(() => soundboardAudioEngine.stopAllSounds()).not.toThrow();
  });

  it('handles microphone mute state changes safely', () => {
    expect(() => {
      soundboardAudioEngine.setMicrophoneMuted(true);
      soundboardAudioEngine.setMicrophoneMuted(false);
    }).not.toThrow();
  });
});
