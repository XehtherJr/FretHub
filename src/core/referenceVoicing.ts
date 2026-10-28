import { type BuiltChord, chordVoicingConstraints } from './chords';
import { applyCapo, type Tuning } from './tunings';
import { searchVoicings, type Voicing } from './voicing-engine';

/** A reference is a starting point, not a copy of the user's existing fingering. */
export function searchChordReference(
  chord: BuiltChord,
  tuning: Tuning,
  capo: number,
  options: { requiredBass?: number; nodeBudget?: number } = {},
): { voicing: Voicing | null; searchTruncated: boolean } {
  const constraints = chordVoicingConstraints(chord);
  const tones = options.requiredBass !== undefined && !chord.pitchClasses.includes(options.requiredBass)
    ? [...chord.pitchClasses, options.requiredBass] : chord.pitchClasses;
  const searchOptions = {
    ...constraints,
    requiredBass: options.requiredBass,
    ...(options.nodeBudget !== undefined ? { nodeBudget: options.nodeBudget } : {}),
    maxFret: Math.min(14, 24 - capo),
    maxMuted: constraints.requiredVoicing ? Math.max(2, tuning.strings.length - constraints.requiredVoicing.length) : 2,
    maxResults: 1,
  };
  const soundingTuning = applyCapo(tuning, capo);
  // Prefer all non-alternative chord tones, then permit explicitly declared
  // omissions. A 7alt family is complete with one or more alterations: don't
  // force all its mutually optional alterations into a starting shape.
  // Preserve budget status from either search, including when a partial shape
  // is found after an incomplete full-tone search.
  const optionalAlternatives = constraints.allowedOmissions.filter((pc) => constraints.requiredOneOf.includes(pc));
  const complete = searchVoicings(tones, soundingTuning, chord.rootPc, { ...searchOptions, allowedOmissions: optionalAlternatives });
  if (complete.voicings[0]) return { voicing: complete.voicings[0], searchTruncated: complete.searchTruncated };
  const partial = searchVoicings(tones, soundingTuning, chord.rootPc, searchOptions);
  return { voicing: partial.voicings[0] ?? null, searchTruncated: complete.searchTruncated || partial.searchTruncated };
}
