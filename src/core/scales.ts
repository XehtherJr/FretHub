/**
 * scales.ts — scale and mode definitions plus arpeggio construction.
 * Like chords, scales are interval formulas applied to any root at runtime.
 */

import { normalizePc, noteToPc, pcToNote, NoteName } from './notes';
import { intervalSemitones, getInterval } from './intervals';

export type ScaleCategory = 'major' | 'minor' | 'mode' | 'pentatonic' | 'blues' | 'symmetrical';

export interface ScaleType {
  id: string;
  name: string;
  intervals: string[];
  category: ScaleCategory;
  /** Whole/half-step formula, e.g. "W–W–H–W–W–W–H". */
  stepFormula: string;
  description: string;
  /** When this scale is a mode: parent scale and starting degree. */
  modeOf?: { parent: string; degree: number };
}

export const SCALE_TYPES: ScaleType[] = [
  {
    id: 'major', name: 'Major (Ionian)', category: 'major',
    intervals: ['1', '2', '3', '4', '5', '6', '7'],
    stepFormula: 'W–W–H–W–W–W–H',
    description: 'The foundational seven-note scale of Western music. Bright, stable and the source of all major-key harmony and modes.',
  },
  {
    id: 'natural-minor', name: 'Natural Minor (Aeolian)', category: 'minor',
    intervals: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    stepFormula: 'W–H–W–W–H–W–W',
    description: 'The relative minor of the major scale. Dark and introspective, sharing its key signature with its relative major.',
    modeOf: { parent: 'major', degree: 6 },
  },
  {
    id: 'harmonic-minor', name: 'Harmonic Minor', category: 'minor',
    intervals: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    stepFormula: 'W–H–W–W–H–WH–H',
    description: 'Natural minor with a raised seventh, creating the strong leading tone that powers minor-key V–i cadences.',
  },
  {
    id: 'melodic-minor', name: 'Melodic Minor (ascending)', category: 'minor',
    intervals: ['1', '2', 'b3', '4', '5', '6', '7'],
    stepFormula: 'W–H–W–W–W–W–H',
    description: 'Raised sixth and seventh for smooth ascending lines; the "jazz minor" scale and parent of modern altered modes.',
  },
  {
    id: 'major-pentatonic', name: 'Major Pentatonic', category: 'pentatonic',
    intervals: ['1', '2', '3', '5', '6'],
    stepFormula: 'W–W–WH–W–WH',
    description: 'Five notes stripped of all semitone clashes. The basis of countless melodies, country licks and major-key solos.',
  },
  {
    id: 'minor-pentatonic', name: 'Minor Pentatonic', category: 'pentatonic',
    intervals: ['1', 'b3', '4', '5', 'b7'],
    stepFormula: 'WH–W–W–WH–W',
    description: 'The universal blues-rock soloing scale — the major pentatonic pattern from its relative minor.',
  },
  {
    id: 'blues', name: 'Blues (minor)', category: 'blues',
    intervals: ['1', 'b3', '4', 'b5', '5', 'b7'],
    stepFormula: 'WH–W–H–H–WH–W',
    description: 'Minor pentatonic plus the "blue note" (b5), capturing the bent, expressive sound of the blues.',
  },
  {
    id: 'dorian', name: 'Dorian', category: 'mode',
    intervals: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    stepFormula: 'W–H–W–W–W–H–W',
    description: 'Minor sound with a raised sixth — jazzy and funky (think "So What", "Scarborough Fair").',
    modeOf: { parent: 'major', degree: 2 },
  },
  {
    id: 'phrygian', name: 'Phrygian', category: 'mode',
    intervals: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    stepFormula: 'H–W–W–W–H–W–W',
    description: 'Minor with a flat second — Spanish, exotic and metallic, built on the third degree of the major scale.',
    modeOf: { parent: 'major', degree: 3 },
  },
  {
    id: 'lydian', name: 'Lydian', category: 'mode',
    intervals: ['1', '2', '3', '#4', '5', '6', '7'],
    stepFormula: 'W–W–W–H–W–W–H',
    description: 'Major with a raised fourth — floating, dreamlike and cinematic. The fourth mode of the major scale.',
    modeOf: { parent: 'major', degree: 4 },
  },
  {
    id: 'mixolydian', name: 'Mixolydian', category: 'mode',
    intervals: ['1', '2', '3', '4', '5', '6', 'b7'],
    stepFormula: 'W–W–H–W–W–H–W',
    description: 'Major with a flat seventh — the sound of dominant chords, blues-rock and countless guitar riffs.',
    modeOf: { parent: 'major', degree: 5 },
  },
  {
    id: 'locrian', name: 'Locrian', category: 'mode',
    intervals: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    stepFormula: 'H–W–W–H–W–W–W',
    description: 'Diminished, unstable and rare — the only major-scale mode built on a diminished triad (vii°).',
    modeOf: { parent: 'major', degree: 7 },
  },
  {
    id: 'phrygian-dominant', name: 'Phrygian Dominant', category: 'mode',
    intervals: ['1', 'b2', '3', '4', '5', 'b6', 'b7'],
    stepFormula: 'H–WH–H–W–H–W–W',
    description: 'The fifth mode of harmonic minor. Major third against a flat second — flamenco and exotic dominant colour.',
    modeOf: { parent: 'harmonic-minor', degree: 5 },
  },
  {
    id: 'lydian-dominant', name: 'Lydian Dominant', category: 'mode',
    intervals: ['1', '2', '3', '#4', '5', '6', 'b7'],
    stepFormula: 'W–W–W–H–W–H–W',
    description: 'Mixolydian with a raised eleventh — the fourth mode of melodic minor and the scale for 7#11 chords.',
    modeOf: { parent: 'melodic-minor', degree: 4 },
  },
  {
    id: 'whole-tone', name: 'Whole Tone', category: 'symmetrical',
    intervals: ['1', '2', '3', '#4', '#5', 'b7'],
    stepFormula: 'W–W–W–W–W–W',
    description: 'Six notes a whole step apart. Fully symmetrical, dreamy and ambiguous — Debussy and augmented dominants.',
  },
  {
    id: 'diminished', name: 'Half-Whole Diminished', category: 'symmetrical',
    intervals: ['1', 'b2', 'b3', '3', '#4', '5', '6', 'b7'],
    stepFormula: 'H–W–H–W–H–W–H–W',
    description: 'Eight-note alternating half/whole-step scale over dominant chords; its symmetry unlocks endless substitution lines.',
  },
  {
    id: 'chromatic', name: 'Chromatic', category: 'symmetrical',
    intervals: ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', '#5', '6', 'b7', '7'],
    stepFormula: 'H–H–H–H–H–H–H–H–H–H–H–H',
    description: 'All twelve semitones. Not a key centre itself, but the complete palette from which every other scale is drawn.',
  },
];

export interface ScaleNote {
  pc: number;
  name: NoteName;
  interval: string;
  intervalName: string;
  degree: number;
}

export function buildScale(root: NoteName | number, scaleId: string): ScaleNote[] {
  const type = SCALE_TYPES.find((s) => s.id === scaleId);
  if (!type) throw new Error(`Unknown scale: "${scaleId}"`);
  const rootPc = typeof root === 'number' ? normalizePc(root) : noteToPc(root);
  const preferFlats = typeof root === 'string' && root.includes('b');
  return type.intervals.map((symbol) => {
    const def = getInterval(symbol);
    const pc = normalizePc(rootPc + intervalSemitones(symbol));
    return {
      pc,
      name: pcToNote(pc, preferFlats),
      interval: symbol,
      intervalName: def.name,
      degree: def.degree,
    };
  });
}

/**
 * Build an arpeggio (chord tones across two octaves) for fretboard display.
 * Returns notes with interval labels repeated at each octave.
 */
export function buildArpeggio(root: NoteName | number, intervalSymbols: string[]): ScaleNote[] {
  const rootPc = typeof root === 'number' ? normalizePc(root) : noteToPc(root);
  const preferFlats = typeof root === 'string' && root.includes('b');
  const notes: ScaleNote[] = [];
  for (const symbol of intervalSymbols) {
    const def = getInterval(symbol);
    const pc = normalizePc(rootPc + intervalSemitones(symbol));
    notes.push({
      pc,
      name: pcToNote(pc, preferFlats),
      interval: symbol,
      intervalName: def.name,
      degree: def.degree,
    });
  }
  // One octave up, excluding the doubled root.
  for (const symbol of intervalSymbols.slice(1)) {
    const def = getInterval(symbol);
    const pc = normalizePc(rootPc + intervalSemitones(symbol));
    notes.push({
      pc,
      name: pcToNote(pc, preferFlats),
      interval: `${symbol} (8va)`,
      intervalName: `${def.name} (octave up)`,
      degree: def.degree + 7,
    });
  }
  return notes;
}

export function getScaleType(id: string): ScaleType {
  const type = SCALE_TYPES.find((s) => s.id === id);
  if (!type) throw new Error(`Unknown scale: "${id}"`);
  return type;
}
