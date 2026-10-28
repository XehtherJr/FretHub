import { describe, expect, it } from 'vitest';
import { estimateProgressionDifficulty, progressionMidi, referenceShape, validProgression, type SavedProgression } from './userProgressions';
import { identifyChord } from './chord-identifier';
import { normalizePc } from './notes';

const step = (frets: (number | null)[]) => ({ id: 'one', name: 'C', frets, beats: 4 });
const base = (): SavedProgression => ({
  id: 'song', name: 'Practice', tuningId: 'standard', capo: 0, bpm: 90, loop: false,
  difficulty: 'beginner', difficultyMode: 'auto', chords: [step([null, 3, 2, 0, 1, 0])],
});

describe('user progressions', () => {
  it('plays exact physical frets, including capo and alternate tuning', () => {
    expect(progressionMidi([null, 3, 2, 0, 1, 0], 'standard', 0)).toEqual([null, 48, 52, 55, 60, 64]);
    expect(progressionMidi([0, 0, null, 3, null, 0], 'drop-d', 2)).toEqual([40, 47, null, 58, null, 66]);
    expect(progressionMidi([0, 4, null, null, null, null, null, null], '8-string-standard', 2)).toEqual([32, 39, null, null, null, null, null, null]);
  });

  it('uses the real generator and preserves defining altered tones and registered voicings', () => {
    const altered = referenceShape('C', 'dominant-alt', 'standard', 0)!;
    const notes = progressionMidi(altered.frets, 'standard', 0).filter((n): n is number => n !== null);
    const pcs = notes.map(normalizePc);
    expect(pcs).toEqual(expect.arrayContaining([0, 4, 10]));
    expect(pcs.some((pc) => [1, 3, 6, 8].includes(pc))).toBe(true);
    const shape = referenceShape('D', 'so-what', '8-string-standard', 2)!;
    const midis = progressionMidi(shape.frets, '8-string-standard', 2).filter((n): n is number => n !== null);
    expect(identifyChord(midis.map(normalizePc), normalizePc(Math.min(...midis)), { midis }).some((match) => match.chord.typeId === 'so-what' && match.strength === 'exact')).toBe(true);
    expect(shape.frets.every((fret) => fret === null || fret === 0 || (fret > 2 && fret <= 24))).toBe(true);
  });

  it('honors requested slash basses in the sounding register with alternate tuning and capo', () => {
    const chord = referenceShape('Cb', 'major-7', 'drop-d', 2, 'Eb');
    expect(chord).not.toBeNull();
    const midis = progressionMidi(chord!.frets, 'drop-d', 2).filter((n): n is number => n !== null);
    expect(normalizePc(Math.min(...midis))).toBe(3); // Eb, not simply the lowest string index.
    expect(midis.map(normalizePc)).toEqual(expect.arrayContaining([11, 3, 6, 10]));
    expect(chord!.name).toBe('Cbmaj7/Eb');
    const pedal = referenceShape('C', 'major', 'standard', 0, 'D');
    expect(pedal).not.toBeNull();
    const pedalMidis = progressionMidi(pedal!.frets, 'standard', 0).filter((n): n is number => n !== null);
    expect(normalizePc(Math.min(...pedalMidis))).toBe(2);
    expect(pedalMidis.map(normalizePc)).toEqual(expect.arrayContaining([0, 4, 7]));
    expect(pedal!.name).toBe('C/D');
  });

  it('offers four transparent grades based on shape and tempo', () => {
    expect(estimateProgressionDifficulty([step([null, 3, 2, 0, 1, 0])], 0, 90).level).toBe('beginner');
    expect(estimateProgressionDifficulty([step([null, 3, 2, 0, 1, 0])], 0, 120).level).toBe('novice');
    expect(estimateProgressionDifficulty([step([1, 3, 3, 2, 1, 1])], 0, 90).level).toBe('intermediate');
    expect(estimateProgressionDifficulty([step([1, 7, null, null, null, null])], 0, 90).level).toBe('advanced');
    const changing = estimateProgressionDifficulty([
      { ...step([null, 1, 2, 2, 1, null]), beats: 1 },
      { ...step([null, 7, 8, 8, 7, null]), id: 'two' },
    ], 0, 90);
    expect(changing.reasons).toEqual(expect.arrayContaining(['large position changes', 'quick chord changes']));
    expect(changing.level).toBe('intermediate');
    // The same physical shape relative to a capo gets the same estimate.
    expect(estimateProgressionDifficulty([step([null, 5, 4, 0, 3, 0])], 2, 90).level).toBe('beginner');
  });

  it('validates saved shapes without imposing a fixed progression length', () => {
    const item = base();
    expect(validProgression(item, 'song')).toBe(true);
    const long = { ...item, chords: Array.from({ length: 100 }, (_, index) => ({ ...item.chords[0], id: `step-${index}` })) };
    expect(validProgression(long)).toBe(true);
    expect(validProgression({ ...item, tuningId: 'unknown' })).toBe(false);
    expect(validProgression({ ...item, capo: 2, chords: [step([null, 2, 0, 0, null, null])] })).toBe(false);
    expect(validProgression({ ...item, chords: [{ ...item.chords[0], beats: 0 }] })).toBe(false);
    expect(validProgression({ ...item, chords: [step([0, null, null, null, null, 0])] })).toBe(false);
    expect(validProgression({ ...item, chords: [item.chords[0], item.chords[0]] })).toBe(false);
  });
});
