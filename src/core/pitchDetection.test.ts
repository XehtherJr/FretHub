import { describe, expect, it } from 'vitest';
import { detectPitch, signalLevel } from './pitchDetection';
import { midiToFreq } from './notes';
import { readFileSync } from 'node:fs';

const rate = 48000;
function sine(midi: number, cents = 0): Float32Array {
  const frequency = midiToFreq(midi) * 2 ** (cents / 1200);
  return Float32Array.from({ length: 4096 }, (_, i) => 0.25 * Math.sin(2 * Math.PI * frequency * i / rate));
}

function recordedSample(midi: number): Float32Array {
  const file = readFileSync(`${process.cwd()}/public/audio/guitar/${midi}.wav`);
  let offset = 12;
  while (offset + 8 <= file.length) {
    const size = file.readUInt32LE(offset + 4);
    if (file.toString('ascii', offset, offset + 4) === 'data') {
      return Float32Array.from({ length: Math.floor(size / 2) }, (_, i) => file.readInt16LE(offset + 8 + i * 2) / 32768);
    }
    offset += 8 + size + size % 2;
  }
  throw new Error(`No sample data for MIDI ${midi}`);
}

describe('guitar pitch detector', () => {
  it.each([[40, 'E', 2], [42, 'F#', 2], [46, 'A#', 2], [64, 'E', 4], [69, 'A', 4], [30, 'F#', 1]])('finds MIDI %i (%s%i) at guitar frequencies', (midi, note, octave) => {
    const pitch = detectPitch(sine(midi), rate);
    expect(pitch?.midi).toBe(midi);
    expect(pitch?.note).toBe(note);
    expect(pitch?.octave).toBe(octave);
    expect(Math.abs(pitch?.cents ?? 100)).toBeLessThanOrEqual(3);
  });
  it('reports sharp and flat offsets in cents', () => {
    expect(Math.abs((detectPitch(sine(40, 24), rate)?.cents ?? 0) - 24)).toBeLessThanOrEqual(3);
    expect(Math.abs((detectPitch(sine(64, -20), rate)?.cents ?? 0) + 20)).toBeLessThanOrEqual(3);
  });
  it('handles a strong second harmonic without locking to the octave', () => {
    const hz = midiToFreq(40);
    const signal = Float32Array.from({ length: 4096 }, (_, i) => 0.12 * Math.sin(2 * Math.PI * hz * i / rate) + 0.22 * Math.sin(4 * Math.PI * hz * i / rate));
    expect(detectPitch(signal, rate)?.midi).toBe(40);
  });
  it('handles quiet, noisy guitar-like notes across browser sample rates and low tunings', () => {
    for (const sampleRate of [16000, 22050, 44100, 48000, 96000]) for (const midi of [30, 33, 38, 40, 45, 50, 55, 59, 64, 76, 83, 86, 88]) {
      let seed = 12345;
      const hz = midiToFreq(midi) * 2 ** (17 / 1200);
      const signal = Float32Array.from({ length: 8192 }, (_, i) => {
        seed = (seed * 16807) % 2147483647;
        const noise = (seed / 2147483647 - 0.5) * 0.001;
        return 0.03 + 0.0035 * Math.sin(2 * Math.PI * hz * i / sampleRate) + 0.002 * Math.sin(4 * Math.PI * hz * i / sampleRate) + noise;
      });
      const result = detectPitch(signal, sampleRate);
      expect(result?.midi, `${midi} at ${sampleRate} Hz`).toBe(midi);
      expect(Math.abs((result?.cents ?? 100) - 17), `${midi} at ${sampleRate} Hz`).toBeLessThanOrEqual(5);
    }
  });
  it('keeps flat and sharp measurements accurate through the guitar chromatic range', () => {
    for (let midi = 30; midi <= 88; midi++) for (const cents of [-37, 37]) {
      const hz = midiToFreq(midi) * 2 ** (cents / 1200);
      const signal = Float32Array.from({ length: 8192 }, (_, i) => 0.04 * Math.sin(2 * Math.PI * hz * i / rate) + 0.02 * Math.sin(4 * Math.PI * hz * i / rate));
      const result = detectPitch(signal, rate);
      expect(result?.midi, `${midi} at ${cents} cents`).toBe(midi);
      expect(Math.abs((result?.cents ?? 100) - cents), `${midi} at ${cents} cents`).toBeLessThanOrEqual(5);
    }
  });
  it('finds a fundamental even when the second harmonic dominates its attack', () => {
    const hz = midiToFreq(40);
    const signal = Float32Array.from({ length: 8192 }, (_, i) => 0.04 * Math.sin(2 * Math.PI * hz * i / rate) + 0.2 * Math.sin(4 * Math.PI * hz * i / rate));
    expect(detectPitch(signal, rate)?.midi).toBe(40);
  });
  it('tracks actual recorded acoustic-guitar decays, including a strong-harmonic low E attack', () => {
    for (const midi of [40, 43, 46, 49, 52, 55, 58, 61, 64, 68, 71, 74, 77, 80, 83]) {
      const recording = recordedSample(midi);
      for (const seconds of [0.08, 0.3]) {
        const start = Math.floor(seconds * 44100);
        const result = detectPitch(recording.slice(start, start + 8192), 44100);
        expect(result?.midi, `${midi} at ${seconds}s`).toBe(midi);
        // The recordings themselves are a few cents below their named pitch.
        expect(Math.abs(result?.cents ?? 100), `${midi} at ${seconds}s`).toBeLessThanOrEqual(18);
      }
    }
    const lowE = recordedSample(40);
    expect(detectPitch(lowE.slice(882, 882 + 8192), 44100)?.midi).toBe(40);
    const quiet = lowE.slice(6615, 6615 + 8192).map((sample) => sample * 0.03);
    expect(detectPitch(quiet, 44100)?.midi).toBe(40);
  });
  it('measures AC signal, not a microphone DC offset', () => {
    expect(signalLevel(Float32Array.from({ length: 8192 }, () => 0.1))).toBeLessThan(1e-7);
    expect(detectPitch(new Float32Array(0), rate)).toBeNull();
    expect(detectPitch(sine(40), 0)).toBeNull();
  });
  it('rejects silence and aperiodic noise', () => {
    expect(detectPitch(new Float32Array(4096), rate)).toBeNull();
    let seed = 12345;
    const noise = Float32Array.from({ length: 4096 }, () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.2; });
    expect(detectPitch(noise, rate)).toBeNull();
  });
});
