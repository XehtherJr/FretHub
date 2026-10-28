import { describe, expect, it } from 'vitest';
import { buildChord, samePitchClasses } from './chords';
import { CHORD_QUIZ_TYPES, makeChordQuestion } from './chordQuiz';
import { ROOT_NOTES } from './notes';
import { getTuning } from './tunings';
import { searchVoicings } from './voicing-engine';

const byName = new Map(ROOT_NOTES.flatMap((root) => CHORD_QUIZ_TYPES.map((type) => {
  const chord = buildChord(root, type);
  return [chord.shortName, chord] as const;
})));
const setKey = (pcs: number[]) => [...new Set(pcs)].sort((a, b) => a - b).join(',');

function randomFor(rootIndex: number, typeIndex: number, seed: number): () => number {
  let call = 0;
  return () => {
    if (call++ === 0) return (typeIndex + 0.1) / CHORD_QUIZ_TYPES.length;
    if (call === 2) return (rootIndex + 0.1) / ROOT_NOTES.length;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

describe('chord quiz answer uniqueness', () => {
  it('recognizes augmented chords with roots a major third apart as the same pitch set', () => {
    const c = buildChord('C', 'augmented');
    const e = buildChord('E', 'augmented');
    const gs = buildChord('G#', 'augmented');
    expect(samePitchClasses(c.pitchClasses, e.pitchClasses)).toBe(true);
    expect(samePitchClasses(c.pitchClasses, gs.pitchClasses)).toBe(true);
    expect(samePitchClasses(c.pitchClasses, buildChord('C', 'major').pitchClasses)).toBe(false);
    expect(samePitchClasses([0, 4, 8, 12], [8, -8, 0])).toBe(true);
  });

  it('can show a complete root-bass quiz shape for every offered root and type', () => {
    for (const root of ROOT_NOTES) for (const type of CHORD_QUIZ_TYPES) {
      const chord = buildChord(root, type);
      const result = searchVoicings(chord.pitchClasses, getTuning('standard'), chord.rootPc, { requiredBass: chord.rootPc, maxResults: 1 });
      expect(result.searchTruncated, chord.shortName).toBe(false);
      expect(result.voicings.length, chord.shortName).toBe(1);
      expect(result.voicings[0].bassPc, chord.shortName).toBe(chord.rootPc);
      expect(setKey(result.voicings[0].pitchClasses), chord.shortName).toBe(setKey(chord.pitchClasses));
    }
  }, 15000);

  it('offers four distinct names with exactly one matching pitch set across all quiz roots and types', () => {
    for (let root = 0; root < ROOT_NOTES.length; root++) {
      for (let type = 0; type < CHORD_QUIZ_TYPES.length; type++) {
        for (let seed = 1; seed <= 12; seed++) {
          const question = makeChordQuestion(randomFor(root, type, seed));
          expect(question.choices).toHaveLength(4);
          expect(new Set(question.choices).size).toBe(4);
          const equivalents = question.choices.filter((name) => setKey(byName.get(name)!.pitchClasses) === setKey(question.chord.pitchClasses));
          expect(equivalents, `${question.chord.shortName}: ${question.choices.join(', ')}`).toEqual([question.chord.shortName]);
        }
      }
    }
    // An unlucky or stubbed random source cannot trap question generation in a loop.
    expect(new Set(makeChordQuestion(() => 0.42).choices).size).toBe(4);
  });
});
