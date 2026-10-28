/**
 * Relationships used by the triad study. Pitch, spelling and voicing remain
 * in the existing engine; this module only combines those existing results.
 */
import { buildChord, type BuiltChord, type ChordTone } from './chords';
import { getChordType } from './chord-definitions';
import { intervalSemitones, spellInterval } from './intervals';
import { fretToMidi, normalizePc, noteToPc } from './notes';
import { buildScale, SCALE_TYPES, type ScaleType } from './scales';
import type { Tuning } from './tunings';
import { fretPc } from './voicing-engine';

export const TRIAD_QUALITIES = ['major', 'minor', 'diminished', 'augmented'] as const;
export type TriadQuality = (typeof TRIAD_QUALITIES)[number];
export function isTriadQuality(value: string): value is TriadQuality {
  return (TRIAD_QUALITIES as readonly string[]).includes(value);
}

/** Identify a complete root triad without inventing a formula for the scale. */
export function qualityForTriadIntervals(intervals: string[]): TriadQuality | undefined {
  return TRIAD_QUALITIES.find((quality) => getChordType(quality).intervals.join(',') === intervals.join(','));
}

export interface TriadChange {
  role: 'third' | 'fifth';
  from: ChordTone;
  to: ChordTone;
  semitones: number;
}

/** Compare interval roles rather than enharmonic display strings. */
export function changesFromMajor(chord: BuiltChord): TriadChange[] {
  const major = buildChord(chord.rootName, 'major');
  return ([1, 2] as const).flatMap((index) => {
    const from = major.tones[index];
    const to = chord.tones[index];
    const semitones = intervalSemitones(to.interval) - intervalSemitones(from.interval);
    return semitones ? [{ role: index === 1 ? 'third' as const : 'fifth' as const, from, to, semitones }] : [];
  });
}

/** Containment is a starting point, not a promise of harmonic interchangeability. */
export function sameRootScalesContaining(chord: BuiltChord): ScaleType[] {
  return SCALE_TYPES.filter((scale) => {
    const pitches = new Set(buildScale(chord.rootName, scale.id).map((note) => note.pc));
    return chord.pitchClasses.every((pc) => pitches.has(pc));
  });
}

export interface NeckPosition {
  stringIndex: number;
  /** Physical fret, with 0 representing the open/capoed string. */
  fret: number;
  pc: number;
  midi: number;
}

/** Enumerate only playable physical positions using the shared fret math. */
export function neckPositions(tuning: Tuning, capo: number, fretCount: number): NeckPosition[] {
  return tuning.strings.flatMap((string, stringIndex) => {
    const positions: NeckPosition[] = [];
    for (let fret = 0; fret <= fretCount; fret++) {
      if (fret > 0 && fret <= capo) continue;
      const soundingFret = fret === 0 ? capo : fret;
      positions.push({ stringIndex, fret, pc: fretPc(tuning, stringIndex, soundingFret), midi: fretToMidi(string.pc, string.octave, soundingFret) });
    }
    return positions;
  });
}

/**
 * Two common moveable major-chord families, not an exhaustive CAGED map.
 * Templates describe only physical open shapes; their notes and transposition
 * are checked against the engine. Restricted to standard six-string tuning.
 */
const OPEN_MAJOR_FORMS = {
  E: { root: 'E', frets: [0, 2, 2, 1, 0, 0] },
  A: { root: 'A', frets: [null, 0, 2, 2, 2, 0] },
} as const;
export type CagedForm = keyof typeof OPEN_MAJOR_FORMS;

export function cagedMajorPositions(chord: BuiltChord, tuning: Tuning, capo: number, form: CagedForm): NeckPosition[] | null {
  if (chord.typeId !== 'major' || tuning.id !== 'standard' || tuning.strings.length !== 6) return null;
  const template = OPEN_MAJOR_FORMS[form];
  const shift = normalizePc(chord.rootPc - noteToPc(template.root) - capo);
  const positions = template.frets.flatMap((relativeFret, stringIndex) => {
    if (relativeFret === null) return [];
    const fretFromCapo = relativeFret + shift;
    const fret = fretFromCapo === 0 ? 0 : capo + fretFromCapo;
    const soundingFret = fret === 0 ? capo : fret;
    const string = tuning.strings[stringIndex];
    return [{ stringIndex, fret, pc: fretPc(tuning, stringIndex, soundingFret), midi: fretToMidi(string.pc, string.octave, soundingFret) }];
  });
  const pitches = new Set(positions.map((position) => position.pc));
  return pitches.size === chord.pitchClasses.length && chord.pitchClasses.every((pc) => pitches.has(pc)) ? positions : null;
}

export interface ThirdTask {
  stringIndex: number;
  /** The learner may use any correct position on this string in this range. */
  minimumFret: number;
  /** One playable root from which the third can be reached on the same string. */
  rootFret: number;
  thirdFret: number;
  third: ChordTone;
}

/** Physical fret reached by counting up from an open/capoed or fretted root. */
export function thirdFretFromRoot(rootFret: number, capo: number, fretCount: number, distance: number): number | null {
  if (rootFret < 0 || (rootFret !== 0 && rootFret <= capo)) return null;
  const target = (rootFret === 0 ? capo : rootFret) + distance;
  return target <= fretCount ? target : null;
}

/** Pick a higher-position third with a reachable root on the same string. */
export function thirdTask(chord: BuiltChord, tuning: Tuning, capo: number, fretCount: number, differentFrom?: number): ThirdTask | null {
  const third = chord.tones[1];
  const distance = intervalSemitones(third.interval);
  const positions = neckPositions(tuning, capo, fretCount).flatMap((position) => {
    if (position.pc !== third.pc || position.fret === 0) return [];
    const physicalRoot = position.fret - distance;
    if (physicalRoot < capo) return [];
    const rootFret = physicalRoot === capo ? 0 : physicalRoot;
    if (fretPc(tuning, position.stringIndex, physicalRoot) !== chord.rootPc) return [];
    return [{ ...position, rootFret }];
  });
  let minimumFret = Math.max(5, capo + 1);
  let candidates = positions.filter((position) => position.fret >= minimumFret);
  if (!candidates.length) {
    minimumFret = capo + 1;
    candidates = positions.filter((position) => position.fret >= minimumFret);
  }
  candidates.sort((a, b) => b.stringIndex - a.stringIndex || a.fret - b.fret);
  const candidate = candidates.find((position) => position.stringIndex !== differentFrom) ?? candidates[0];
  return candidate ? { stringIndex: candidate.stringIndex, minimumFret, rootFret: candidate.rootFret, thirdFret: candidate.fret, third } : null;
}

/** Use a different key and string; widen the exercise only if the capo needs room. */
export function thirdTransferPlan(chord: BuiltChord, tuning: Tuning, capo: number, fretCount: number) {
  const transferChord = buildChord(spellInterval(chord.rootName, '4'), chord.typeId);
  const windows = [...new Set([fretCount, 15, 22, 24])].filter((count) => count >= fretCount).sort((a, b) => a - b);
  let fallback: { fretCount: number; first: ThirdTask; second: ThirdTask; transferChord: BuiltChord } | null = null;
  for (const count of windows) {
    const first = thirdTask(chord, tuning, capo, count);
    const second = first && thirdTask(transferChord, tuning, capo, count, first.stringIndex);
    if (!first || !second) continue;
    const plan = { fretCount: count, first, second, transferChord };
    if (first.stringIndex !== second.stringIndex) return plan;
    fallback ??= plan;
  }
  return fallback;
}
