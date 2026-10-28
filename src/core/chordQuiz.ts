import { buildChord, samePitchClasses, type BuiltChord } from './chords';
import { ROOT_NOTES } from './notes';

export const CHORD_QUIZ_TYPES = [
  'major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4', 'power',
  'dominant-7', 'major-7', 'minor-7', 'half-diminished',
] as const;

export interface ChordQuestion {
  chord: BuiltChord;
  choices: string[];
}

/** Fisher–Yates also terminates when a test or random source repeats a value. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Only one offered answer may describe the exact pitch-class set. */
export function makeChordQuestion(random: () => number = Math.random): ChordQuestion {
  const type = CHORD_QUIZ_TYPES[Math.floor(random() * CHORD_QUIZ_TYPES.length)];
  const root = ROOT_NOTES[Math.floor(random() * ROOT_NOTES.length)];
  const chord = buildChord(root, type);
  const sameRoot = CHORD_QUIZ_TYPES.filter((other) => other !== type)
    .map((other) => buildChord(root, other))
    .filter((other) => !samePitchClasses(chord.pitchClasses, other.pitchClasses));
  const distractors = shuffled(sameRoot, random).slice(0, 3);

  if (random() < 0.5) {
    const otherRoots = ROOT_NOTES.filter((other) => other !== root)
      .map((other) => buildChord(other, type))
      .filter((other) => !samePitchClasses(chord.pitchClasses, other.pitchClasses));
    if (otherRoots.length) distractors[2] = otherRoots[Math.floor(random() * otherRoots.length)];
  }
  return { chord, choices: shuffled([chord.shortName, ...distractors.map((item) => item.shortName)], random) };
}
