import { midiToFreq, normalizePc, pcToNote } from './notes';
import type { PitchReading } from './pitchDetection';

const distanceInCents = (a: number, b: number) => Math.abs(1200 * Math.log2(a / b));

function fromFrequency(frequency: number): PitchReading {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { frequency, midi, note: pcToNote(normalizePc(midi)), octave: Math.floor(midi / 12) - 1, cents: Math.round(1200 * Math.log2(frequency / midiToFreq(midi))) };
}

/**
 * Require a repeated pitch before showing a new note, then use a short median
 * to smooth jitter. A single attack/harmonic cannot flip the display an octave.
 */
export class PitchTracker {
  private current: PitchReading | null = null;
  private recent: PitchReading[] = [];
  private pending: PitchReading[] = [];
  private misses = 0;

  reset() { this.current = null; this.recent = []; this.pending = []; this.misses = 0; }

  push(reading: PitchReading | null): PitchReading | null {
    if (!reading) {
      this.pending = [];
      if (++this.misses >= 3) this.reset();
      return this.current;
    }
    this.misses = 0;
    if (!this.current || distanceInCents(reading.frequency, this.current.frequency) > 80) {
      const last = this.pending[this.pending.length - 1];
      this.pending = last && distanceInCents(reading.frequency, last.frequency) <= 45 ? [...this.pending, reading].slice(-2) : [reading];
      if (this.pending.length >= 2) {
        this.recent = this.pending;
        this.pending = [];
        const ordered = this.recent.map((item) => item.frequency).sort((a, b) => a - b);
        this.current = fromFrequency((ordered[0] + ordered[ordered.length - 1]) / 2);
      }
      return this.current;
    }
    this.pending = [];
    this.recent = [...this.recent, reading].slice(-3);
    const ordered = this.recent.map((item) => item.frequency).sort((a, b) => a - b);
    this.current = fromFrequency(ordered[Math.floor(ordered.length / 2)]);
    return this.current;
  }
}
