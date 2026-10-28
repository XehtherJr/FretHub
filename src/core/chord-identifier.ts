/** Reverse lookup from sounding notes to plausible chord interpretations. */

import { normalizePc, pcToNote } from './notes';
import { intervalSemitones } from './intervals';
import { CHORD_TYPES, getChordType } from './chord-definitions';
import { buildChord, BuiltChord } from './chords';
import { matchesVoicingPattern } from './voicingPattern';

export interface ChordMatch {
  chord: BuiltChord;
  /** Exact pitch set, compatible alternative family, omissions, or a non-chord slash bass. */
  strength: 'exact' | 'family' | 'partial' | 'slash';
  /** Lower ranks first. */
  rank: number;
  /** A non-chord bass, when the slash interpretation contains one. */
  extraPcs: number[];
  /** Chord tones absent from the selected notes. */
  missingPcs: number[];
  /** True only when the user explicitly supplied a root that is not sounding. */
  rootAssumed: boolean;
}

export interface IdentifyChordOptions {
  /** Limit results to this root, even if it is not being played. */
  assumedRoot?: number;
  /** Sounding MIDI notes, needed only for voicing-specific names. */
  midis?: number[];
}

/**
 * Identify compatible chord definitions, keeping ambiguous interpretations.
 * A root is never invented automatically. A user-supplied root may be absent,
 * in which case the match is explicitly partial. When the bass is not a chord
 * tone, a complete upper chord may also be shown as a separate slash reading.
 */
export function identifyChord(pcs: number[], bassPc?: number, options: IdentifyChordOptions = {}): ChordMatch[] {
  const input = new Set(pcs.map(normalizePc));
  if (input.size < 2) return [];
  const suppliedBass = bassPc === undefined ? undefined : normalizePc(bassPc);
  // A bass that is not in the input cannot describe this voicing.
  const bass = suppliedBass !== undefined && input.has(suppliedBass) ? suppliedBass : undefined;
  const hint = options.assumedRoot !== undefined && Number.isInteger(options.assumedRoot)
    ? normalizePc(options.assumedRoot) : undefined;
  const roots = hint === undefined ? [...input] : [hint];
  const matches: ChordMatch[] = [];
  // A voicing-specific name is only justified if the supplied registers also
  // describe the same selected pitch classes.
  const midiPcs = new Set((options.midis ?? []).map(normalizePc));
  const midiMatchesInput = midiPcs.size === input.size && [...input].every((pc) => midiPcs.has(pc));

  for (const root of roots) {
    const rootAssumed = !input.has(root);
    for (const type of CHORD_TYPES) {
      if (type.voicingPattern && (!midiMatchesInput || !options.midis || !matchesVoicingPattern(options.midis, root, type.voicingPattern))) continue;
      const chordPcs = new Set(type.intervals.map((sym) => normalizePc(root + intervalSemitones(sym))));
      const extra = [...input].filter((pc) => !chordPcs.has(pc));
      const missing = [...chordPcs].filter((pc) => !input.has(pc));
      const omittable = new Set([...(type.omittable ?? []), ...(type.identificationOmissions ?? [])]
        .map((sym) => normalizePc(root + intervalSemitones(sym))));
      const illegalMissing = missing.filter((pc) => !(rootAssumed && pc === root) && !omittable.has(pc));
      if (illegalMissing.length) continue;
      const alternatives = new Set((type.requireOneOf ?? []).map((sym) => normalizePc(root + intervalSemitones(sym))));
      if (alternatives.size && ![...alternatives].some((pc) => input.has(pc))) continue;
      const missingNonAlternatives = missing.filter((pc) => !alternatives.has(pc));

      // A family such as 7alt requires an alteration, not every alteration at
      // once. A non-chord bass still needs all of its non-alternative core.
      const slash = !rootAssumed && missingNonAlternatives.length === 0 && chordPcs.size >= 2
        && extra.length === 1 && bass !== undefined && extra[0] === bass;
      if (extra.length && !slash) continue;

      const strength: ChordMatch['strength'] = slash ? 'slash' : !missing.length ? 'exact'
        : alternatives.size && !missingNonAlternatives.length ? 'family' : 'partial';
      const chord = buildChord(root, type.id, bass);
      // Prefer more-specific exact and partial names over a broad family.
      let rank = strength === 'exact' ? 0 : strength === 'partial' ? 10 + missingNonAlternatives.length * 4 : strength === 'family' ? 24 : 30;
      rank += chord.pitchClasses.length > 5 ? 2 : 0;
      if (bass !== undefined && root === bass) rank -= 3;
      if (type.category === 'triad' || type.category === 'power') rank -= 1;
      matches.push({ chord, strength, rank, extraPcs: extra, missingPcs: missing, rootAssumed });
    }
  }

  return matches.sort((a, b) => a.rank - b.rank || a.chord.shortName.localeCompare(b.chord.shortName));
}

/** Human-readable explanation of what is actually sounding. */
export function describeMatch(match: ChordMatch, preferFlats = false): string {
  const type = getChordType(match.chord.typeId);
  const alternatives = new Set((type.requireOneOf ?? []).map((sym) => normalizePc(match.chord.rootPc + intervalSemitones(sym))));
  const parts = [
    `${alternatives.size ? 'Possible chord tones' : 'Chord tones'}: ${match.chord.tones.map((t) => t.name).join(' – ')}`,
    `${alternatives.size ? 'Formula options' : 'Formula'}: ${match.chord.formula.join(' ')}`,
  ];
  if (alternatives.size) {
    const present = match.chord.tones.filter((tone) => alternatives.has(tone.pc) && !match.missingPcs.includes(tone.pc));
    parts.push(`Played alterations: ${present.map((tone) => `${tone.name} (${tone.interval})`).join(', ')}`);
    parts.push('Other alterations are alternatives, not required together');
  }
  if (match.rootAssumed) parts.push(`Root ${match.chord.rootName} assumed, not played`);
  const omitted = match.missingPcs.filter((pc) => !alternatives.has(pc) && (!match.rootAssumed || pc !== match.chord.rootPc));
  if (omitted.length) {
    const names = omitted.map((pc) => match.chord.tones.find((tone) => tone.pc === pc)?.name ?? pcToNote(pc, preferFlats)).join(', ');
    parts.push(`Not played: ${names}`);
  }
  if (match.strength === 'slash') parts.push(`${match.chord.bassName} is a non-chord bass, not an inversion`);
  else if (match.rootAssumed) parts.push(`Bass note ${match.chord.bassName} in the assumed chord`);
  else if (match.chord.isInversion) parts.push(`Bass note ${match.chord.bassName} — inversion/slash voicing`);
  return parts.join(' · ');
}
