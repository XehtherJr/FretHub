import { describe, expect, it } from 'vitest';
import { buildChord, chordVoicingConstraints } from './chords';
import { searchChordReference } from './referenceVoicing';
import { getTuning } from './tunings';
import { searchVoicings } from './voicing-engine';

describe('reference voicing searches', () => {
  it('preserves safety-limit status even when no reference was found', () => {
    const chord = buildChord('C', 'major');
    const limited = searchChordReference(chord, getTuning('standard'), 0, { nodeBudget: 1 });
    expect(limited.voicing).toBeNull();
    expect(limited.searchTruncated).toBe(true);
    const normal = searchChordReference(chord, getTuning('standard'), 0);
    expect(normal.voicing).not.toBeNull();
    expect(normal.searchTruncated).toBe(false);
    expect(new Set(normal.voicing!.pitchClasses)).toEqual(new Set(chord.pitchClasses));
  });

  it('treats 7alt alternatives as a complete family when choosing a reference', () => {
    const chord = buildChord('C', 'dominant-alt');
    const tuning = getTuning('8-string-standard');
    const constraints = chordVoicingConstraints(chord);
    const reference = searchChordReference(chord, tuning, 0, { requiredBass: chord.rootPc });
    const expected = searchVoicings(chord.pitchClasses, tuning, chord.rootPc, {
      ...constraints, allowedOmissions: constraints.requiredOneOf, requiredBass: chord.rootPc, maxFret: 14, maxMuted: 2, maxResults: 1,
    });
    expect(reference.voicing).not.toBeNull();
    expect(reference.voicing!.frets).toEqual(expected.voicings[0].frets);
    expect(reference.searchTruncated).toBe(expected.searchTruncated);
    expect(constraints.requiredOneOf.some((pc) => reference.voicing!.pitchClasses.includes(pc))).toBe(true);
    for (const pc of [0, 4, 10]) expect(reference.voicing!.pitchClasses).toContain(pc);
  }, 15000);

  it('keeps a requested non-chord bass and capo in the sounding pitches', () => {
    const chord = buildChord('C', 'major');
    const result = searchChordReference(chord, getTuning('drop-d'), 2, { requiredBass: 2 });
    expect(result.voicing).not.toBeNull();
    expect(result.voicing!.bassPc).toBe(2);
    expect(result.voicing!.pitchClasses).toEqual(expect.arrayContaining([0, 4, 7, 2]));
    expect(result.voicing!.frets.every((fret) => fret === null || fret === 0 || fret + 2 <= 24)).toBe(true);
  });
});
