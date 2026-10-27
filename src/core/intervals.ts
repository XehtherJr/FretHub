/**
 * intervals.ts — interval vocabulary.
 *
 * Intervals are identified by compact formula symbols used inside chord and
 * scale definitions: "1" (unison/root), "b3" (minor third), "5" (perfect
 * fifth), "b7" (minor seventh), "9" (compound major second), etc.
 */

import { normalizePc, noteToPc } from './notes';

export interface IntervalDef {
  /** Formula symbol, e.g. "b3", "#11". */
  symbol: string;
  /** Human-readable name, e.g. "minor third". */
  name: string;
  /** Short label for diagrams, e.g. "m3", "P5". */
  short: string;
  /** Size in semitones from the root (compound intervals exceed 12). */
  semitones: number;
  /** Diatonic scale degree (1-indexed), e.g. 9 -> 2. */
  degree: number;
}

export const INTERVALS: Record<string, IntervalDef> = {
  '1':   { symbol: '1',   name: 'root (unison)',        short: 'R',  semitones: 0,  degree: 1 },
  'b2':  { symbol: 'b2',  name: 'minor second',         short: 'm2', semitones: 1,  degree: 2 },
  '2':   { symbol: '2',   name: 'major second',         short: 'M2', semitones: 2,  degree: 2 },
  'b3':  { symbol: 'b3',  name: 'minor third',          short: 'm3', semitones: 3,  degree: 3 },
  '3':   { symbol: '3',   name: 'major third',          short: 'M3', semitones: 4,  degree: 3 },
  '4':   { symbol: '4',   name: 'perfect fourth',       short: 'P4', semitones: 5,  degree: 4 },
  '#4':  { symbol: '#4',  name: 'augmented fourth',     short: 'A4', semitones: 6,  degree: 4 },
  'b5':  { symbol: 'b5',  name: 'diminished fifth',     short: 'd5', semitones: 6,  degree: 5 },
  '5':   { symbol: '5',   name: 'perfect fifth',        short: 'P5', semitones: 7,  degree: 5 },
  '#5':  { symbol: '#5',  name: 'augmented fifth',      short: 'A5', semitones: 8,  degree: 5 },
  'b6':  { symbol: 'b6',  name: 'minor sixth',          short: 'm6', semitones: 8,  degree: 6 },
  '6':   { symbol: '6',   name: 'major sixth',          short: 'M6', semitones: 9,  degree: 6 },
  'bb7': { symbol: 'bb7', name: 'diminished seventh',   short: 'd7', semitones: 9,  degree: 7 },
  'b7':  { symbol: 'b7',  name: 'minor seventh',        short: 'm7', semitones: 10, degree: 7 },
  '7':   { symbol: '7',   name: 'major seventh',        short: 'M7', semitones: 11, degree: 7 },
  'b9':  { symbol: 'b9',  name: 'minor ninth',          short: 'm9', semitones: 13, degree: 9 },
  '9':   { symbol: '9',   name: 'major ninth',          short: 'M9', semitones: 14, degree: 9 },
  '#9':  { symbol: '#9',  name: 'augmented ninth',      short: 'A9', semitones: 15, degree: 9 },
  '11':  { symbol: '11',  name: 'perfect eleventh',     short: 'P11', semitones: 17, degree: 11 },
  '#11': { symbol: '#11', name: 'augmented eleventh',   short: 'A11', semitones: 18, degree: 11 },
  'b13': { symbol: 'b13', name: 'minor thirteenth',     short: 'm13', semitones: 20, degree: 13 },
  '13':  { symbol: '13',  name: 'major thirteenth',     short: 'M13', semitones: 21, degree: 13 },
};

export function getInterval(symbol: string): IntervalDef {
  const def = INTERVALS[symbol];
  if (!def) throw new Error(`Unknown interval symbol: "${symbol}"`);
  return def;
}

/** Spell the correct letter for an interval (C + b3 = Eb, not D#). */
export function spellInterval(rootName: string, symbol: string): string {
  const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const rootLetter = rootName[0]?.toUpperCase();
  const rootIndex = letters.indexOf(rootLetter);
  if (rootIndex < 0) throw new Error(`Unknown root note: "${rootName}"`);
  const interval = getInterval(symbol);
  const letter = letters[(rootIndex + interval.degree - 1) % letters.length];
  const target = normalizePc(noteToPc(rootName) + interval.semitones);
  const natural = noteToPc(letter);
  const difference = ((target - natural + 18) % 12) - 6;
  return letter + (difference > 0 ? '#'.repeat(difference) : 'b'.repeat(-difference));
}

/** Semitone offset of an interval symbol, reduced into one octave (0..11). */
export function intervalSemitones(symbol: string): number {
  return getInterval(symbol).semitones % 12;
}

/**
 * Name an interval directly from a semitone distance (within one octave),
 * using the most common spelling (augmented fourth rather than diminished
 * fifth for the tritone unless `asDiminished` is set).
 */
export function nameIntervalFromSemitones(semitones: number, asDiminished = false): IntervalDef {
  const n = ((semitones % 12) + 12) % 12;
  const map: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
    6: asDiminished ? 'b5' : '#4', 7: '5', 8: '#5', 9: '6',
    10: 'b7', 11: '7',
  };
  return getInterval(map[n]);
}
