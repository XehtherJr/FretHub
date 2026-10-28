import { describe, expect, it } from 'vitest';
import reference from './fixtures/chords-db/guitar-subset.json';
import { buildChord, chordVoicingConstraints } from './chords';
import { getTuning } from './tunings';
import { searchVoicings } from './voicing-engine';

// Independent comparison data, not a claim that the source fingerings or
// FretHub's omission and comfort policies are universally authoritative.
const shapeKey = (frets: (number | null)[]) => frets.map((fret) => fret === null ? 'x' : fret).join('|');
const pc = (midi: number) => ((midi % 12) + 12) % 12;

describe('pinned external guitar-shape comparison', () => {
  it('reproduces the great majority of in-policy reference shapes across keys and chord types', () => {
    expect(reference.revision).toBe('43f8b4a7ba7b61b90bb48f8721ae918a4f421d64');
    expect(reference.standardMidi).toEqual([40, 45, 50, 55, 59, 64]);
    const tuning = getTuning('standard');
    let eligible = 0;
    let reproduced = 0;
    let pitchPolicyDifferences = 0;
    let outsideBounds = 0;
    const misses: string[] = [];

    for (const entry of reference.entries) {
      const chord = buildChord(entry.root, entry.typeId);
      const constraints = chordVoicingConstraints(chord);
      const tones = new Set(chord.pitchClasses);
      const result = searchVoicings(chord.pitchClasses, tuning, chord.rootPc, {
        ...constraints, maxFret: 14, maxSpan: 4, maxMuted: 2, maxResults: Number.MAX_SAFE_INTEGER,
      });
      expect(result.searchTruncated, `${entry.root} ${entry.typeId}`).toBe(false);
      const generated = new Set(result.voicings.map((voicing) => shapeKey(voicing.frets)));
      for (const source of entry.shapes) {
        const frets = source.frets.map((fret) => fret < 0 ? null : fret);
        // Calculate notes directly from the source's documented MIDI tuning,
        // rather than trusting the engine's own pitch or fingering helper.
        const notes = frets.flatMap((fret, index) => fret === null ? [] : [reference.standardMidi[index] + fret]);
        const pcs = new Set(notes.map(pc));
        if ([...pcs].some((pitch) => !tones.has(pitch))
          || [...tones].some((pitch) => !pcs.has(pitch) && !constraints.allowedOmissions.includes(pitch))
          || (constraints.requiredOneOf.length && !constraints.requiredOneOf.some((pitch) => pcs.has(pitch)))) {
          pitchPolicyDifferences++;
          continue;
        }
        const positive = frets.filter((fret): fret is number => fret !== null && fret > 0);
        if (notes.length < 2 || frets.filter((fret) => fret === null).length > 2
          || positive.some((fret) => fret > 14)
          || (positive.length > 0 && Math.max(...positive) - Math.min(...positive) > 4)) {
          outsideBounds++;
          continue;
        }
        eligible++;
        if (generated.has(shapeKey(frets))) reproduced++;
        else misses.push(source.id);
      }
    }
    if (process.env.FRETHUB_AUDIT_REPORT) console.info({ eligible, reproduced, pitchPolicyDifferences, outsideBounds, misses });
    expect(reference.entries.length).toBeGreaterThan(450);
    expect(pitchPolicyDifferences).toBeGreaterThan(0);
    expect(outsideBounds).toBeGreaterThan(0);
    expect(eligible).toBeGreaterThan(1500);
    // Deliberately not 100%: the source may use thumb, muted-string contact,
    // other fingerings or omission policies beyond this conservative model.
    expect(reproduced / eligible, `coverage ${reproduced}/${eligible}; examples: ${misses.slice(0, 12).join(', ')}`).toBeGreaterThan(0.99);
  }, 60000);
});
