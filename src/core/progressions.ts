/**
 * progressions.ts — diatonic harmony, Roman numeral analysis and a catalog
 * of common chord progressions, all computed from scale formulas.
 */

import { normalizePc, pcToNote, NoteName } from './notes';
import { buildScale } from './scales';

export interface DiatonicChord {
  degree: number;
  roman: string;
  chordTypeId: string;
  rootPc: number;
  rootName: NoteName;
  pitchClasses: number[];
  /** T / SD / D functional label where applicable. */
  function: 'tonic' | 'subdominant' | 'dominant' | 'other';
}

/** Map an interval-set signature to a chord type id (triads and seventh chords). */
const TRIAD_SIGNATURES: Record<string, string> = {
  '0,4,7': 'major',
  '0,3,7': 'minor',
  '0,3,6': 'diminished',
  '0,4,8': 'augmented',
};

const SEVENTH_SIGNATURES: Record<string, string> = {
  '0,4,7,11': 'major-7',
  '0,4,7,10': 'dominant-7',
  '0,3,7,10': 'minor-7',
  '0,3,6,10': 'half-diminished',
  '0,3,6,9': 'diminished-7',
  '0,3,7,11': 'minor-major-7',
};

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const FUNCTIONS_MAJOR: DiatonicChord['function'][] = [
  'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant',
];
const FUNCTIONS_MINOR: DiatonicChord['function'][] = [
  'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'subdominant', 'dominant',
];

function signature(pcs: number[], rootPc: number): string {
  return pcs
    .map((pc) => normalizePc(pc - rootPc))
    .sort((a, b) => a - b)
    .join(',');
}

function diatonicSet(
  root: NoteName | number,
  scaleId: string,
  seventh: boolean,
  minor: boolean,
): DiatonicChord[] {
  const scale = buildScale(root, scaleId);
  const result: DiatonicChord[] = [];

  for (let degree = 0; degree < 7; degree++) {
    const stackCount = seventh ? 4 : 3;
    const pcs: number[] = [];
    for (let k = 0; k < stackCount; k++) {
      pcs.push(scale[(degree + k * 2) % 7].pc);
    }
    const chordRoot = scale[degree].pc;
    const sig = signature(pcs, chordRoot);
    const table = seventh ? SEVENTH_SIGNATURES : TRIAD_SIGNATURES;
    const chordTypeId = table[sig] ?? 'major';
    result.push({
      degree: degree + 1,
      roman: (minor ? ROMAN_MINOR : ROMAN_MAJOR)[degree],
      chordTypeId,
      rootPc: chordRoot,
      rootName: scale[degree].name,
      pitchClasses: [...new Set(pcs.map(normalizePc))],
      function: (minor ? FUNCTIONS_MINOR : FUNCTIONS_MAJOR)[degree],
    });
  }
  return result;
}

/** Diatonic triads of a major key. */
export function diatonicTriads(root: NoteName | number): DiatonicChord[] {
  return diatonicSet(root, 'major', false, false);
}

/** Diatonic seventh chords of a major key. */
export function diatonicSevenths(root: NoteName | number): DiatonicChord[] {
  return diatonicSet(root, 'major', true, false);
}

/** Diatonic triads of a natural minor key. */
export function naturalMinorTriads(root: NoteName | number): DiatonicChord[] {
  return diatonicSet(root, 'natural-minor', false, true);
}

/**
 * Harmonic-minor triads: the raised 7th degree turns chord v into V and
 * chord VII into vii°. Computed directly from the harmonic minor scale.
 */
export function harmonicMinorTriads(root: NoteName | number): DiatonicChord[] {
  const scale = buildScale(root, 'harmonic-minor');
  return scale.map((note, degree) => {
    const pcs = [
      scale[degree % 7].pc,
      scale[(degree + 2) % 7].pc,
      scale[(degree + 4) % 7].pc,
    ];
    const sig = signature(pcs, note.pc);
    const chordTypeId = TRIAD_SIGNATURES[sig] ?? 'major';
    return {
      degree: degree + 1,
      roman: ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°'][degree],
      chordTypeId,
      rootPc: note.pc,
      rootName: note.name,
      pitchClasses: [...new Set(pcs.map(normalizePc))],
      function: (FUNCTIONS_MINOR[degree] ?? 'other') as DiatonicChord['function'],
    };
  });
}

export interface ProgressionTemplate {
  id: string;
  name: string;
  style: string;
  /** Roman numeral sequence using the diatonic table above. */
  numerals: string[];
  description: string;
}

export const PROGRESSION_TEMPLATES: ProgressionTemplate[] = [
  {
    id: 'pop-punk', name: 'I–V–vi–IV', style: 'Pop / rock',
    numerals: ['I', 'V', 'vi', 'IV'],
    description: 'The "four-chord song" progression behind an enormous share of modern pop.',
  },
  {
    id: '50s', name: 'I–vi–IV–V', style: 'Doo-wop / 1950s',
    numerals: ['I', 'vi', 'IV', 'V'],
    description: 'The classic doo-wop cycle of fifths-flavoured movement, still everywhere in pop.',
  },
  {
    id: 'axis', name: 'vi–IV–I–V', style: 'Pop / ballad',
    numerals: ['vi', 'IV', 'I', 'V'],
    description: 'The "sensitive female chord progression" — starts on the vi for an introspective mood.',
  },
  {
    id: 'jazz-251', name: 'ii–V–I', style: 'Jazz',
    numerals: ['ii', 'V', 'I'],
    description: 'The core cadence of jazz harmony, usually played with seventh chords.',
  },
  {
    id: 'jazz-251-major7', name: 'ii7–V7–Imaj7', style: 'Jazz (sevenths)',
    numerals: ['ii7', 'V7', 'Imaj7'],
    description: 'The ii–V–I with full seventh-chord colour — the first vocabulary every jazz student learns.',
  },
  {
    id: 'blues-12', name: '12-bar blues', style: 'Blues',
    numerals: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
    description: 'The twelve-bar form: four bars of tonic, two of subdominant, two of tonic, then the dominant turnaround.',
  },
  {
    id: 'andalusian', name: 'i–VII–VI–V', style: 'Flamenco / minor',
    numerals: ['i', 'VII', 'VI', 'V'],
    description: 'The Andalusian cadence — descending Phrygian colour with a dominant-class finish.',
  },
  {
    id: 'soul', name: 'I–iii–IV–iv', style: 'Soul / pop',
    numerals: ['I', 'iii', 'IV', 'iv'],
    description: 'Major-to-minor shift on the IV chord creates a bittersweet chromatic turn.',
  },
  {
    id: 'circle', name: 'vi–ii–V–I', style: 'Jazz / standards',
    numerals: ['vi', 'ii', 'V', 'I'],
    description: 'A full cycle-of-fifths chain landing cleanly on the tonic.',
  },
];

export interface ProgressionChord {
  roman: string;
  chordTypeId: string;
  rootPc: number;
  rootName: NoteName;
}

function numeralToDegree(numeral: string): number {
  const map: Record<string, number> = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
  };
  const base = numeral.toLowerCase().replace(/[^iv]/g, '');
  return map[base] ?? 1;
}

/** Resolve a Roman numeral (with optional 7 suffix) into a concrete chord in a key. */
export function resolveNumeral(
  numeral: string,
  triads: DiatonicChord[],
  sevenths: DiatonicChord[],
): ProgressionChord {
  const useSeventh = numeral.includes('7');
  const table = useSeventh ? sevenths : triads;
  const degree = numeralToDegree(numeral);
  const entry = table[degree - 1];
  return {
    roman: numeral,
    chordTypeId: entry.chordTypeId,
    rootPc: entry.rootPc,
    rootName: entry.rootName,
  };
}

export function buildProgression(
  root: NoteName | number,
  template: ProgressionTemplate,
): ProgressionChord[] {
  const triads = diatonicTriads(root);
  const sevenths = diatonicSevenths(root);
  return template.numerals.map((n) => resolveNumeral(n, triads, sevenths));
}

/** Circle of fifths: major key roots in clockwise order with key signatures. */
export function circleOfFifths(): { rootPc: number; rootName: NoteName; sharps: number; relativeMinor: NoteName }[] {
  const order = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  return order.map((pc, i) => {
    const sharps = i <= 6 ? i : i - 12; // negative = flats
    const minorPc = normalizePc(pc - 3);
    return {
      rootPc: pc,
      rootName: pcToNote(pc, sharps < 0),
      sharps,
      relativeMinor: pcToNote(minorPc, sharps < 0),
    };
  });
}
