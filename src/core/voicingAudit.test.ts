import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from './chord-definitions';
import { buildChord, chordVoicingConstraints } from './chords';
import { identifyChord } from './chord-identifier';
import { fretToMidi, normalizePc } from './notes';
import { applyCapo, getTuning, type Tuning } from './tunings';
import { assignFingering, searchVoicings } from './voicing-engine';

/** Independent bounded enumeration: check each physical fret combination. */
function bruteForce(root: string, type: string, tuning: Tuning, maxFret: number, requiredBass?: number): Set<string> {
  const chord = buildChord(root, type);
  const constraints = chordVoicingConstraints(chord);
  const tones = new Set(chord.pitchClasses);
  const omissions = new Set(constraints.allowedOmissions);
  const result = new Set<string>();
  const frets: (number | null)[] = Array(tuning.strings.length).fill(null);
  function visit(index: number) {
    if (index < frets.length) {
      for (const fret of [null, ...Array.from({ length: maxFret + 1 }, (_, value) => value)]) {
        frets[index] = fret;
        visit(index + 1);
      }
      return;
    }
    if (frets.filter((fret) => fret === null).length > 2) return;
    const played = frets.flatMap((fret, i) => fret === null ? [] : [fretToMidi(tuning.strings[i].pc, tuning.strings[i].octave, fret)]);
    if (played.length < 2) return;
    const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
    if (fretted.length && Math.max(...fretted) - Math.min(...fretted) > 3) return;
    const pcs = new Set(played.map(normalizePc));
    if ([...pcs].some((pc) => !tones.has(pc))) return;
    if ([...tones].some((pc) => !pcs.has(pc) && !omissions.has(pc))) return;
    if (constraints.requiredOneOf.length && !constraints.requiredOneOf.some((pc) => pcs.has(pc))) return;
    if (requiredBass !== undefined && normalizePc(Math.min(...played)) !== requiredBass) return;
    if (!assignFingering(frets, true)) return;
    if (constraints.requiredVoicing) {
      const sorted = [...played].sort((a, b) => a - b);
      if (normalizePc(sorted[0]) !== chord.rootPc || sorted.length !== constraints.requiredVoicing.length
        || sorted.some((midi, i) => midi - sorted[0] !== constraints.requiredVoicing![i])) return;
    }
    result.add(frets.map((fret) => fret === null ? 'x' : fret).join('|'));
  }
  visit(0);
  return result;
}

describe('broad voicing audit', () => {
  it('agrees with independent exhaustive enumeration in small windows, including capo and alternate tunings', () => {
    const cases = [
      { root: 'A', type: 'minor-9', tuning: getTuning('standard'), bass: 9, maxFret: 4 },
      { root: 'C', type: 'dominant-alt', tuning: applyCapo(getTuning('drop-d'), 2), bass: undefined, maxFret: 4 },
      { root: 'G', type: 'major', tuning: getTuning('7-string-standard'), bass: 7, maxFret: 3 },
    ];
    for (const { root, type, tuning, bass, maxFret } of cases) {
      const chord = buildChord(root, type);
      const found = searchVoicings(chord.pitchClasses, tuning, chord.rootPc, {
        ...chordVoicingConstraints(chord), maxFret, maxSpan: 3, maxResults: 10000, requiredBass: bass, nodeBudget: 1_000_000,
      });
      expect(found.searchTruncated, `${root} ${type}`).toBe(false);
      expect(found.voicings.length, `${root} ${type}`).toBeGreaterThan(0);
      expect(new Set(found.voicings.map((voicing) => voicing.frets.map((fret) => fret === null ? 'x' : fret).join('|'))), `${root} ${type}`)
        .toEqual(bruteForce(root, type, tuning, maxFret, bass));
    }
  }, 30000);

  it('checks generated notes, required tones, bass and identification across every type and all 12 roots', () => {
    let shapesChecked = 0;
    const tuning = getTuning('standard');
    for (const type of CHORD_TYPES) {
      let rootsWithResults = 0;
      for (let root = 0; root < 12; root++) {
        const chord = buildChord(root, type.id);
        const constraints = chordVoicingConstraints(chord);
        const result = searchVoicings(chord.pitchClasses, tuning, root, { ...constraints, maxFret: 9, maxResults: 12 });
        if (result.voicings.length) rootsWithResults++;
        for (const voicing of result.voicings) {
          const midi = voicing.frets.map((fret, index) => fret === null ? null : fretToMidi(tuning.strings[index].pc, tuning.strings[index].octave, fret));
          const played = midi.filter((note): note is number => note !== null);
          const pcs = new Set(played.map(normalizePc));
          expect(voicing.midi, `${chord.shortName} MIDI`).toEqual(midi);
          expect(voicing.bassPc, `${chord.shortName} bass`).toBe(normalizePc(Math.min(...played)));
          expect([...pcs].every((pc) => chord.pitchClasses.includes(pc)), `${chord.shortName} foreign tone`).toBe(true);
          for (const pc of chord.pitchClasses.filter((pc) => !constraints.allowedOmissions.includes(pc))) expect(pcs.has(pc), `${chord.shortName} missing required tone`).toBe(true);
          if (constraints.requiredOneOf.length) expect(constraints.requiredOneOf.some((pc) => pcs.has(pc)), chord.shortName).toBe(true);
          if (constraints.requiredVoicing) {
            const ascending = [...played].sort((a, b) => a - b);
            expect(ascending.map((midi) => midi - ascending[0]), chord.shortName).toEqual(constraints.requiredVoicing);
          }
          shapesChecked++;
        }
        if (result.voicings[0]) {
          const voicing = result.voicings[0];
          const midis = voicing.midi.filter((note): note is number => note !== null);
          const matches = identifyChord(midis.map(normalizePc), voicing.bassPc!, { midis });
          const match = matches.find((item) => item.chord.rootPc === root && item.chord.typeId === type.id);
          expect(match, `${chord.shortName} agrees with identification`).toBeDefined();
          const complete = chord.pitchClasses.every((pc) => voicing.pitchClasses.includes(pc));
          // Alternative 7alt alterations are a family, not omitted required
          // tones. Other declared omissions are still partial matches.
          const onlyAlternativesMissing = constraints.requiredOneOf.length > 0
            && chord.pitchClasses.filter((pc) => !voicing.pitchClasses.includes(pc)).every((pc) => constraints.requiredOneOf.includes(pc));
          expect(match!.strength, chord.shortName).toBe(complete ? 'exact' : onlyAlternativesMissing ? 'family' : 'partial');
        }
      }
      expect(rootsWithResults, `${type.id} had no playable results in any key`).toBeGreaterThan(0);
    }
    expect(shapesChecked).toBeGreaterThan(3000);
  }, 30000);
});
