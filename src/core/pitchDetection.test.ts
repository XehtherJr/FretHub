import { describe, expect, it } from 'vitest';
import { detectPitch } from './pitchDetection';
import { midiToFreq } from './notes';

const rate = 48000;
function sine(midi: number, cents = 0): Float32Array {
  const frequency = midiToFreq(midi) * 2 ** (cents / 1200);
  return Float32Array.from({ length: 4096 }, (_, i) => 0.25 * Math.sin(2 * Math.PI * frequency * i / rate));
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
  it('rejects silence and aperiodic noise', () => {
    expect(detectPitch(new Float32Array(4096), rate)).toBeNull();
    let seed = 12345;
    const noise = Float32Array.from({ length: 4096 }, () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.2; });
    expect(detectPitch(noise, rate)).toBeNull();
  });
});
