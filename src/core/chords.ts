/**
 * chords.ts — turn (root + chord type) formulas into concrete note sets and
 * display names. Slash chords and inversions are represented by attaching a
 * bass pitch class to an otherwise normal chord.
 */

import {
  noteToPc, pcToNote, transposePc, normalizePc, normalizeNoteName, NoteName,
} from './notes';
import { intervalSemitones, getInterval, spellInterval } from './intervals';
import { ChordType, CHORD_TYPES, getChordType } from './chord-definitions';

export interface ChordTone {
  /** Pitch class 0..11. */
  pc: number;
  /** Note name spelled by its written interval above the root. */
  name: NoteName;
  /** Interval symbol relative to the root, e.g. "b7". */
  interval: string;
  /** Full interval name, e.g. "minor seventh". */
  intervalName: string;
}

export interface BuiltChord {
  rootPc: number;
  rootName: NoteName;
  typeId: string;
  typeName: string;
  /** Canonical symbol after the root, e.g. "m7b5". */
  symbol: string;
  /** Full name, e.g. "C minor seventh". */
  fullName: string;
  /** Compact symbol, e.g. "Cm7b5". */
  shortName: string;
  formula: string[];
  tones: ChordTone[];
  /** Distinct pitch classes in the chord. */
  pitchClasses: number[];
  /** Bass pc for a slash chord / inversion; equals root by default. */
  bassPc: number;
  bassName: NoteName;
  isInversion: boolean;
}

/** Default spelling for a non-chord bass given only as a pitch class. */
function shouldUseFlats(rootName: NoteName): boolean {
  return rootName.includes('b');
}

export function buildChord(
  root: NoteName | number,
  typeId: string,
  bass?: NoteName | number,
): BuiltChord {
  const rootPc = typeof root === 'number' ? normalizePc(root) : noteToPc(root);
  const rootName = typeof root === 'string' ? normalizeNoteName(root) : pcToNote(rootPc);
  const type: ChordType = getChordType(typeId);
  const preferFlats = shouldUseFlats(rootName);

  const tones: ChordTone[] = type.intervals.map((symbol) => {
    const pc = transposePc(rootPc, intervalSemitones(symbol));
    return {
      pc,
      name: spellInterval(rootName, symbol),
      interval: symbol,
      intervalName: getInterval(symbol).name,
    };
  });

  const bassPc = bass === undefined
    ? rootPc
    : typeof bass === 'number' ? normalizePc(bass) : noteToPc(bass);
  // A chord tone's interval spelling determines its slash name: C minor's
  // third is Eb, not D#, even if the input bass was provided as a pitch class.
  const bassName = bassPc === rootPc ? rootName : tones.find((tone) => tone.pc === bassPc)?.name
    ?? (typeof bass === 'string' ? normalizeNoteName(bass) : pcToNote(bassPc, preferFlats));

  const symbol = type.symbols[0];
  const shortName = `${rootName}${symbol}`;
  const fullName = `${rootName} ${type.name.toLowerCase()}`;

  return {
    rootPc,
    rootName,
    typeId,
    typeName: type.name,
    symbol,
    fullName,
    shortName: bassPc !== rootPc ? `${shortName}/${bassName}` : shortName,
    formula: [...type.intervals],
    tones,
    pitchClasses: tones.map((t) => t.pc),
    bassPc,
    bassName,
    isInversion: bassPc !== rootPc && tones.some((tone) => tone.pc === bassPc),
  };
}

/** Share the type's real voicing constraints with every generator entry point. */
export function chordVoicingConstraints(chord: BuiltChord): { allowedOmissions: number[]; requiredOneOf: number[]; requiredVoicing?: number[] } {
  const type = getChordType(chord.typeId);
  const toPc = (symbol: string) => transposePc(chord.rootPc, intervalSemitones(symbol));
  return {
    allowedOmissions: (type.omittable ?? []).map(toPc),
    requiredOneOf: (type.requireOneOf ?? []).map(toPc),
    requiredVoicing: type.voicingPattern,
  };
}

/** All 12 roots crossed with the full chord vocabulary — the encyclopedia index. */
export function buildEncyclopedia(): BuiltChord[] {
  const result: BuiltChord[] = [];
  for (let pc = 0; pc < 12; pc++) {
    for (const type of CHORD_TYPES) {
      result.push(buildChord(pc, type.id));
    }
  }
  return result;
}

/** Every distinct symbol a chord may be searched by (root prefixed). */
export function chordSearchNames(chord: BuiltChord): string[] {
  const type = getChordType(chord.typeId);
  const names = new Set<string>();
  for (const sym of type.symbols) {
    names.add(`${chord.rootName}${sym}`.toLowerCase());
  }
  names.add(chord.fullName.toLowerCase());
  names.add(chord.rootName.toLowerCase());
  // Notes and formula as searchable text.
  names.add(chord.tones.map((t) => t.name).join(' ').toLowerCase());
  // Accept either common enharmonic spelling in search, even when the
  // interval-correct display uses e.g. Eb rather than D#.
  names.add(chord.tones.map((t) => pcToNote(t.pc)).join(' ').toLowerCase());
  names.add(chord.tones.map((t) => pcToNote(t.pc, true)).join(' ').toLowerCase());
  names.add(chord.formula.join(' ').toLowerCase());
  return [...names];
}
