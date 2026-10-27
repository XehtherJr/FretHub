/**
 * chord-identifier.ts — reverse lookup from sounding pitch classes to the
 * chord names that fit. Used by the interactive fretboard's "identify" mode.
 */

import { normalizePc, pcToNote } from './notes';
import { intervalSemitones } from './intervals';
import { CHORD_TYPES } from './chord-definitions';
import { buildChord, BuiltChord } from './chords';

export interface ChordMatch {
  chord: BuiltChord;
  /** 'exact' = identical pitch-class set; 'partial' = omittable tones missing. */
  strength: 'exact' | 'partial';
  /** Lower ranks first. */
  rank: number;
  /** Pitch classes present in the input but not required by this chord type. */
  extraPcs: number[];
  /** Required pitch classes absent from the input (omittable only). */
  missingPcs: number[];
}

/**
 * Identify every chord definition compatible with a set of pitch classes.
 *
 * @param pcs     pitch classes selected on the fretboard (duplicates fine)
 * @param bassPc  lowest sounding pitch class when known (used to rank and
 *                build slash-chord interpretations)
 */
export function identifyChord(pcs: number[], bassPc?: number): ChordMatch[] {
  const input = new Set(pcs.map(normalizePc));
  if (input.size === 0) return [];

  const bass = bassPc === undefined ? undefined : normalizePc(bassPc);
  const matches: ChordMatch[] = [];

  for (const root of input) {
    for (const type of CHORD_TYPES) {
      const chordPcs = new Set(
        type.intervals.map((sym) => normalizePc(root + intervalSemitones(sym))),
      );

      const extra = [...input].filter((pc) => !chordPcs.has(pc));
      const missing = [...chordPcs].filter((pc) => !input.has(pc));
      const omittablePcs = new Set(
        (type.omittable ?? []).map((sym) =>
          normalizePc(root + intervalSemitones(sym)),
        ),
      );
      const illegalMissing = missing.filter((pc) => !omittablePcs.has(pc));

      // Input must be a subset of the chord; every missing tone must be omittable.
      if (extra.length > 0 || illegalMissing.length > 0) continue;

      const strength: ChordMatch['strength'] = missing.length === 0 ? 'exact' : 'partial';
      const chord = buildChord(root, type.id, bass);

      let rank = strength === 'exact' ? 0 : 10 + missing.length * 4;
      rank += chord.pitchClasses.length > 5 ? 2 : 0; // prefer compact explanations
      if (bass !== undefined && root === bass) rank -= 3;
      if (type.category === 'triad' || type.category === 'power') rank -= 1;

      matches.push({
        chord,
        strength,
        rank,
        extraPcs: extra,
        missingPcs: missing,
      });
    }
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.chord.shortName.localeCompare(b.chord.shortName))
    .slice(0, 24);
}

/** Human-readable explanation of why a match fits, for UI tooltips. */
export function describeMatch(match: ChordMatch, preferFlats = false): string {
  const parts = [
    `Notes: ${match.chord.tones.map((t) => t.name).join(' – ')}`,
    `Formula: ${match.chord.formula.join(' ')}`,
  ];
  if (match.strength === 'partial') {
    const names = match.missingPcs.map((pc) => pcToNote(pc, preferFlats)).join(', ');
    parts.push(`Omits optional tone(s): ${names}`);
  }
  if (match.chord.isInversion) {
    parts.push(`Bass note ${match.chord.bassName} — inversion/slash voicing`);
  }
  return parts.join(' · ');
}
