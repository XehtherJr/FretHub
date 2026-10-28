import { describe, expect, it } from 'vitest';
import { midiToFreq, normalizePc, pcToNote } from './notes';
import type { PitchReading } from './pitchDetection';
import { PitchTracker } from './pitchTracker';
import { assessTunerPitch, tunerStrings } from './tuner';
import { getTuning, TUNINGS } from './tunings';

function reading(midi: number, cents = 0): PitchReading {
  const frequency = midiToFreq(midi) * 2 ** (cents / 1200);
  const closest = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { frequency, midi: closest, note: pcToNote(normalizePc(closest)), octave: Math.floor(closest / 12) - 1, cents: Math.round(1200 * Math.log2(frequency / midiToFreq(closest))) };
}

describe('guitar tuner assessment', () => {
  it('compares a detuned string to its actual target, not the nearest chromatic note', () => {
    const strings = tunerStrings(getTuning('standard'));
    const heard = reading(40, -75); // nearest chromatic note is D#2
    expect(heard.note).toBe('D#');
    expect(assessTunerPitch(heard, strings, null, 'strings')).toMatchObject({ targetLabel: 'E2', cents: -75, state: 'flat' });
    expect(assessTunerPitch(heard, strings, null, 'chromatic')).toMatchObject({ targetLabel: 'D#2', cents: 25, state: 'sharp' });
    expect(assessTunerPitch(reading(40, 72), strings, 0, 'strings')).toMatchObject({ targetLabel: 'E2', cents: 72, state: 'sharp' });
  });
  it('warns instead of suggesting a direction for a far-away or wrong-octave note', () => {
    const strings = tunerStrings(getTuning('standard'));
    expect(assessTunerPitch(reading(52), strings, 0, 'strings')).toMatchObject({ targetLabel: 'E2', cents: 1200, state: 'verify' });
    expect(assessTunerPitch(reading(52), strings, null, 'strings').state).toBe('verify');
    expect(assessTunerPitch(reading(40, -180), strings, 0, 'strings')).toMatchObject({ cents: -180, state: 'flat' });
  });
  it('targets every supported tuning in its correct octave and displays Eb standard in flats', () => {
    for (const tuning of TUNINGS) {
      const strings = tunerStrings(tuning);
      for (const string of strings) {
        const locked = assessTunerPitch(reading(string.midi, -12), strings, string.index, 'strings');
        expect(locked).toMatchObject({ targetMidi: string.midi, cents: -12, state: 'flat' });
        const automatic = assessTunerPitch(reading(string.midi, 7), strings, null, 'strings');
        expect(automatic).toMatchObject({ targetMidi: string.midi, cents: 7, state: 'sharp' });
      }
    }
    expect(tunerStrings(getTuning('half-step-down')).map((string) => string.label)).toEqual(['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4']);
    expect(tunerStrings(getTuning('8-string-standard'))[0].label).toBe('F#1');
  });
});

describe('stable pitch tracking', () => {
  it('rejects one-frame attack/octave errors, follows a new string, and clears on silence', () => {
    const tracker = new PitchTracker();
    expect(tracker.push(reading(52))).toBeNull(); // transient octave
    expect(tracker.push(reading(40, -8))).toBeNull();
    expect(tracker.push(reading(40, -6))?.midi).toBe(40);
    expect(tracker.push(reading(52))?.midi).toBe(40); // single octave spike
    expect(tracker.push(reading(40, -7))?.midi).toBe(40);
    expect(tracker.push(reading(45, 10))?.midi).toBe(40);
    expect(tracker.push(reading(45, 8))?.midi).toBe(45);
    expect(tracker.push(null)?.midi).toBe(45);
    expect(tracker.push(null)?.midi).toBe(45);
    expect(tracker.push(null)).toBeNull();
    expect(tracker.push(reading(40))).toBeNull();
    tracker.reset();
    expect(tracker.push(reading(40))).toBeNull();
  });
  it('smooths small jitter without sticking to a chromatic note boundary', () => {
    const tracker = new PitchTracker();
    tracker.push(reading(40, 45));
    tracker.push(reading(40, 47));
    const acrossBoundary = tracker.push(reading(40, 53));
    expect(acrossBoundary?.frequency).toBeCloseTo(midiToFreq(40) * 2 ** (47 / 1200), 3);
    expect(tracker.push(reading(40, 55))?.midi).toBe(41);
  });
});
