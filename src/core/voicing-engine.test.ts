import { describe, it, expect } from 'vitest';
import { generateVoicings, searchVoicings, assignFingering, estimateVoicingDifficulty, estimateVoicingEase, interiorMutedCount, fretPc } from './voicing-engine';
import { getTuning, applyCapo } from './tunings';
import { buildChord, chordVoicingConstraints } from './chords';
import { noteToPc } from './notes';

const STD = getTuning('standard');
const DROP_D = getTuning('drop-d');

/** Find a voicing matching an exact tab string like "x32010" (low-to-high). */
function findShape<T extends { frets: (number | null)[] }>(voicings: T[], tab: string): T | undefined {
  const wanted = tab.split('').map((c) => (c === 'x' ? null : Number(c)));
  return voicings.find((v) =>
    v.frets.length === wanted.length &&
    v.frets.every((f, i) => f === wanted[i]),
  );
}

describe('voicing engine — canonical open chord shapes', () => {
  it('finds the open C major shape x32010', () => {
    const chord = buildChord('C', 'major');
    const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc);
    expect(voicings.length).toBeGreaterThan(0);
    const openC = findShape(voicings, 'x32010');
    expect(openC, 'x32010 should be generated').toBeTruthy();
  });

  it('finds open G (320003), open D (xx0232) and open Em (022000)', () => {
    const g = generateVoicings(buildChord('G', 'major').pitchClasses, STD, noteToPc('G'));
    expect(findShape(g, '320003')).toBeTruthy();

    const d = generateVoicings(buildChord('D', 'major').pitchClasses, STD, noteToPc('D'));
    expect(findShape(d, 'xx0232')).toBeTruthy();

    const em = generateVoicings(buildChord('E', 'minor').pitchClasses, STD, noteToPc('E'));
    expect(findShape(em, '022000')).toBeTruthy();
  });

  it('finds the open A7 and Dm7 shapes', () => {
    const a7 = generateVoicings(buildChord('A', 'dominant-7').pitchClasses, STD, noteToPc('A'));
    expect(findShape(a7, 'x02020')).toBeTruthy();

    const dm7 = generateVoicings(buildChord('D', 'minor-7').pitchClasses, STD, noteToPc('D'));
    expect(findShape(dm7, 'xx0211')).toBeTruthy();
  });
});

describe('voicing search coverage', () => {
  it('finds the complete Am9 x02413 and exposes it near other low-position shapes', () => {
    const chord = buildChord('A', 'minor-9');
    const search = searchVoicings(chord.pitchClasses, STD, chord.rootPc, {
      ...chordVoicingConstraints(chord), requiredBass: chord.rootPc, sortBy: 'position', maxResults: 500,
    });
    const shape = findShape(search.voicings, 'x02413');
    expect(shape).toBeDefined();
    expect(search.voicings.indexOf(shape!)).toBeLessThan(16);
    expect(shape!.midi).toEqual([null, 45, 52, 59, 60, 67]);
    expect(new Set(shape!.pitchClasses)).toEqual(new Set(chord.pitchClasses));
    expect(shape!.fingers).toEqual(['x', 0, 2, 4, 1, 3]);
  });

  it('searches high frets instead of discarding candidates after the first five', () => {
    const chord = buildChord('A', 'minor-9');
    const search = searchVoicings(chord.pitchClasses, STD, chord.rootPc, {
      ...chordVoicingConstraints(chord), requiredBass: chord.rootPc, maxFret: 18, maxResults: 10000,
    });
    expect(search.searchTruncated).toBe(false);
    expect(search.voicings.some((v) => v.frets.join(',') === [null, 12, 10, 12, 12, null].join(','))).toBe(true);
  });

  it('includes familiar complete and clearly omitting chord shapes across several families', () => {
    const examples = [
      { root: 'C', type: 'major-7', tab: 'x32000' },
      { root: 'G', type: 'dominant-7', tab: '320001' },
      { root: 'D', type: 'minor-7', tab: 'xx0211' },
      { root: 'E', type: 'dominant-7sharp9', tab: '07678x' }, // E7#9 without the fifth
      { root: 'G', type: 'dominant-13', tab: '3x345x' }, // G13 without 5, 9 and 11
    ];
    for (const { root, type, tab } of examples) {
      const chord = buildChord(root, type);
      const result = searchVoicings(chord.pitchClasses, STD, chord.rootPc, { ...chordVoicingConstraints(chord), maxResults: 10000 });
      expect(findShape(result.voicings, tab), `${chord.shortName} ${tab}`).toBeDefined();
    }
  });

  it('reports separately when a result limit or safety budget stops the search', () => {
    const chord = buildChord('C', 'major');
    const capped = searchVoicings(chord.pitchClasses, STD, chord.rootPc, { maxResults: 1 });
    expect(capped.voicings).toHaveLength(1);
    expect(capped.totalFound).toBeGreaterThan(1);
    expect(capped.resultLimitReached).toBe(true);
    const interrupted = searchVoicings(chord.pitchClasses, STD, chord.rootPc, { nodeBudget: 1 });
    expect(interrupted.searchTruncated).toBe(true);
  });
});

describe('voicing engine — musical validity', () => {
  it('every voicing contains only chord tones and covers all required tones', () => {
    for (const typeId of ['major', 'minor', 'dominant-7', 'minor-7', 'major-7', 'diminished', 'sus4']) {
      const chord = buildChord('A', typeId);
      const toneSet = new Set(chord.pitchClasses);
      const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { maxResults: 40 });
      expect(voicings.length, typeId).toBeGreaterThan(0);
      for (const v of voicings) {
        // No foreign notes.
        for (const pc of v.pitchClasses) expect(toneSet.has(pc), `${typeId} foreign pc`).toBe(true);
        // Every required tone covered (these types have no omittable tones).
        for (const pc of chord.pitchClasses) {
          expect(v.pitchClasses, `${typeId} missing tone`).toContain(pc);
        }
        expect(v.fingers.length).toBe(6);
        expect(v.fingerCount).toBeLessThanOrEqual(4);
        expect(v.span).toBeLessThanOrEqual(4);
        expect(v.mutedCount).toBeLessThanOrEqual(2);
      }
    }
  });

  it('respects the fret span limit', () => {
    const chord = buildChord('C', 'major');
    const tight = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { maxSpan: 2 });
    expect(tight.every((v) => v.span <= 2)).toBe(true);
  });

  it('respects required bass notes for inversions (C/E)', () => {
    const chord = buildChord('C', 'major');
    const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, {
      requiredBass: noteToPc('E'),
    });
    expect(voicings.length).toBeGreaterThan(0);
    expect(voicings.every((v) => v.bassPc === noteToPc('E'))).toBe(true);
  });

  it('constrains the actual lowest sounding MIDI note, not the first string', () => {
    const chord = buildChord('C', 'major');
    for (const bass of chord.pitchClasses) {
      const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { requiredBass: bass, maxFret: 14, maxMuted: 3, maxResults: 100 });
      expect(voicings.length).toBeGreaterThan(0);
      for (const voicing of voicings) {
        const lowest = Math.min(...voicing.midi.filter((midi): midi is number => midi !== null));
        expect(lowest % 12).toBe(bass);
        expect(voicing.bassPc).toBe(bass);
      }
    }
    // An open higher string can sound lower than a heavily fretted low string.
    const reentrant = { ...STD, id: 'reentrant-test', strings: [STD.strings[5], ...STD.strings.slice(1, 5), STD.strings[0]] };
    const voicings = generateVoicings(chord.pitchClasses, reentrant, chord.rootPc, { requiredBass: noteToPc('C'), maxFret: 5, maxMuted: 3 });
    expect(voicings.length).toBeGreaterThan(0);
    for (const voicing of voicings) expect(Math.min(...voicing.midi.filter((midi): midi is number => midi !== null)) % 12).toBe(noteToPc('C'));
  });

  it('handles extended chords via omittable tones', () => {
    const chord = buildChord('C', 'dominant-13');
    const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, {
      allowedOmissions: buildChord('C', 'dominant-13').tones
        .filter((t) => ['5', '11', '9'].includes(t.interval))
        .map((t) => t.pc),
    });
    expect(voicings.length).toBeGreaterThan(0);
    // Root, third, seventh and thirteenth must survive.
    for (const v of voicings) {
      const set = new Set(v.pitchClasses);
      for (const tone of chord.tones.filter((t) => ['1', '3', 'b7', '13'].includes(t.interval))) {
        expect(set.has(tone.pc)).toBe(true);
      }
    }
  });

  it('keeps at least one alteration in every generated 7alt voicing', () => {
    const chord = buildChord('C', 'dominant-alt');
    const constraints = chordVoicingConstraints(chord);
    const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { ...constraints, maxResults: 100 });
    expect(voicings.length).toBeGreaterThan(0);
    for (const voicing of voicings) {
      expect(constraints.requiredOneOf.some((pc) => voicing.pitchClasses.includes(pc))).toBe(true);
      for (const note of ['C', 'E', 'Bb']) expect(voicing.pitchClasses).toContain(noteToPc(note));
    }
  });

  it('generates the actual ordered So What shape, not just its pitch classes', () => {
    const chord = buildChord('D', 'so-what');
    const voicings = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { ...chordVoicingConstraints(chord), maxResults: 100 });
    expect(findShape(voicings, 'x55565')).toBeTruthy();
    for (const voicing of voicings) {
      const ascending = voicing.midi.filter((midi): midi is number => midi !== null).sort((a, b) => a - b);
      expect(ascending.map((midi) => midi - ascending[0])).toEqual([0, 5, 10, 15, 19]);
    }
    const eight = getTuning('8-string-standard');
    const extended = generateVoicings(chord.pitchClasses, eight, chord.rootPc, { ...chordVoicingConstraints(chord), maxMuted: 3 });
    expect(extended.length).toBeGreaterThan(0);
    expect(extended.every((voicing) => voicing.midi.filter((midi) => midi !== null).length === 5)).toBe(true);
  });

  it('can generate a complete D/C chord with C as the non-chord bass', () => {
    const chord = buildChord('D', 'major');
    const bass = noteToPc('C');
    const voicings = generateVoicings([...chord.pitchClasses, bass], STD, chord.rootPc, { requiredBass: bass, maxResults: 50 });
    expect(voicings.length).toBeGreaterThan(0);
    for (const voicing of voicings) {
      expect(voicing.bassPc).toBe(bass);
      for (const pc of [...chord.pitchClasses, bass]) expect(voicing.pitchClasses).toContain(pc);
    }
  });

  it('works in drop D and prefers the open low D for D-root chords', () => {
    const chord = buildChord('D', 'major');
    const voicings = generateVoicings(chord.pitchClasses, DROP_D, chord.rootPc, {
      requiredBass: noteToPc('D'),
    });
    expect(voicings.length).toBeGreaterThan(0);
    const openLowD = voicings.find((v) => v.frets[0] === 0);
    expect(openLowD).toBeTruthy();
  });

  it('supports seven- and eight-string tunings', () => {
    const seven = getTuning('7-string-standard');
    const eight = getTuning('8-string-standard');
    const v7 = generateVoicings(buildChord('E', 'minor').pitchClasses, seven, noteToPc('E'));
    const v8 = generateVoicings(buildChord('E', 'minor').pitchClasses, eight, noteToPc('E'));
    expect(v7[0].frets.length).toBe(7);
    expect(v8[0].frets.length).toBe(8);
  });

  it('fret positions agree with the tuning under a capo', () => {
    const capo2 = applyCapo(STD, 2);
    // Open string under capo 2 now sounds two semitones higher.
    expect(fretPc(capo2, 0, 0)).toBe(noteToPc('F#'));
    expect(fretPc(capo2, 4, 0)).toBe(noteToPc('C#')); // B string + 2 semitones
    const chord = buildChord('D', 'major');
    const voicings = generateVoicings(chord.pitchClasses, capo2, chord.rootPc);
    expect(voicings.length).toBeGreaterThan(0);
  });

  it('returns ranked, deduplicated results with playability labels', () => {
    const voicings = generateVoicings(buildChord('G', 'major').pitchClasses, STD, noteToPc('G'), {
      maxResults: 10,
    });
    const keys = voicings.map((v) => v.frets.join('|'));
    expect(new Set(keys).size).toBe(keys.length);
    for (let i = 1; i < voicings.length; i++) {
      expect(voicings[i].score).toBeGreaterThanOrEqual(voicings[i - 1].score);
    }
    expect(voicings.every((v) =>
      ['beginner', 'intermediate', 'advanced'].includes(v.playability))).toBe(true);
  });
});

describe('position and ease estimates', () => {
  it('lets open strings coexist with a minimum fretted position, but excludes open-only shapes', () => {
    const chord = buildChord('C', 'major');
    const options = { minFret: 3, maxFret: 6, maxResults: 10000 };
    const withOpen = searchVoicings(chord.pitchClasses, STD, chord.rootPc, options);
    expect(findShape(withOpen.voicings, 'x35550')).toBeDefined();
    expect(withOpen.voicings.every((voicing) => voicing.frets.some((fret) => fret !== null && fret >= 3)
      && voicing.frets.every((fret) => fret === null || fret === 0 || fret >= 3))).toBe(true);
    const closed = searchVoicings(chord.pitchClasses, STD, chord.rootPc, { ...options, allowOpen: false });
    expect(findShape(closed.voicings, 'x35550')).toBeUndefined();
    expect(closed.voicings.every((voicing) => !voicing.frets.includes(0))).toBe(true);

    const power = buildChord('E', 'power');
    const powerShapes = searchVoicings(power.pitchClasses, STD, power.rootPc, { ...options, maxMuted: 4 });
    expect(powerShapes.voicings.length).toBeGreaterThan(0);
    expect(powerShapes.voicings.every((voicing) => voicing.frets.some((fret) => fret !== null && fret >= 3))).toBe(true);
  });

  it('distinguishes interior skips from edge mutes and does not score a bass note as physical difficulty', () => {
    const chord = buildChord('C', 'major');
    const voicing = generateVoicings(chord.pitchClasses, STD, chord.rootPc, { maxResults: 1000 })
      .find((item) => item.frets.join(',') === [null, 3, 2, 0, 1, 0].join(','))!;
    expect(interiorMutedCount(voicing.frets)).toBe(0);
    const interior = { ...voicing, frets: [3, null, 2, 0, 1, 0] };
    expect(interiorMutedCount(interior.frets)).toBe(1);
    expect(estimateVoicingEase(interior)).toBeGreaterThan(estimateVoicingEase(voicing));
    expect(estimateVoicingDifficulty(interior).reasons).toContain('interior muted string requires selective picking or damping');
    const alternateBassLabel = { ...voicing, bassPc: 4 };
    expect(estimateVoicingEase(alternateBassLabel)).toBe(estimateVoicingEase(voicing));
  });
});

describe('fingering assignment', () => {
  it('uses separate fingers for common open A and Em instead of inventing a barre', () => {
    expect(assignFingering([null, 0, 2, 2, 2, 0], true)).toEqual({
      fingers: ['x', 0, 1, 2, 3, 0], barre: undefined, fingerCount: 3,
    });
    expect(assignFingering([0, 2, 2, 0, 0, 0], true)).toEqual({
      fingers: [0, 1, 2, 0, 0, 0], barre: undefined, fingerCount: 2,
    });
  });

  it('prefers the lower index barre in the common C A-shape x35553', () => {
    expect(assignFingering([null, 3, 5, 5, 5, 3], true)).toEqual({
      fingers: ['x', 1, 2, 3, 4, 1], barre: { fret: 3, stringFrom: 1, stringTo: 5 }, fingerCount: 4,
    });
  });

  it('can propagate two separately numbered barres for C9 878788', () => {
    const frets = [8, 7, 8, 7, 8, 8];
    const result = assignFingering(frets, true)!;
    expect(result.fingers).toEqual([2, 1, 3, 1, 4, 4]);
    expect(result.barres).toEqual([
      { fret: 7, stringFrom: 1, stringTo: 3 },
      { fret: 8, stringFrom: 4, stringTo: 5 },
    ]);
    expect(result.barre).toEqual(result.barres![0]); // compatibility for older callers
    expect(assignFingering(frets, false)).toBeNull();
    const chord = buildChord('C', 'dominant-9');
    const found = searchVoicings(chord.pitchClasses, STD, chord.rootPc, {
      ...chordVoicingConstraints(chord), maxFret: 9, maxResults: 10000,
    });
    const voicing = findShape(found.voicings, '878788');
    expect(voicing?.barres).toEqual(result.barres);
    expect(estimateVoicingDifficulty(voicing!).level).toBe('advanced');
    expect(estimateVoicingDifficulty(voicing!).reasons).toContain('two barres');
  });

  it('never proposes a barre crossing an open, muted or lower-fretted string', () => {
    for (const frets of [[1, 3, 0, 3, 1, 1], [1, 3, null, 3, 1, 1], [1, 3, 2, 3, 1, 1]]) {
      const result = assignFingering(frets, true);
      const barres = result?.barres ?? (result?.barre ? [result.barre] : []);
      for (const barre of barres) {
        expect(frets[barre.stringFrom]).toBe(barre.fret);
        expect(frets[barre.stringTo]).toBe(barre.fret);
        for (let index = barre.stringFrom; index <= barre.stringTo; index++) {
          expect(frets[index] !== null && frets[index]! >= barre.fret).toBe(true);
        }
      }
    }
  });

  it('detects a barre and assigns finger 1 across it', () => {
    // F major barre: 133211 (E-shaped at fret 1)
    const result = assignFingering([1, 3, 3, 2, 1, 1], true);
    expect(result).not.toBeNull();
    expect(result!.barre).toEqual({ fret: 1, stringFrom: 0, stringTo: 5 });
    expect(result!.fingers).toEqual([1, 3, 4, 2, 1, 1]);
    expect(result!.fingerCount).toBeLessThanOrEqual(4);
  });

  it('allows a higher partial barre with a lower fretted note, as in C9 x32333', () => {
    const frets = [null, 3, 2, 3, 3, 3];
    const result = assignFingering(frets, true);
    expect(result).toEqual({ fingers: ['x', 2, 1, 3, 3, 3], barre: { fret: 3, stringFrom: 3, stringTo: 5 }, fingerCount: 3 });
    expect(assignFingering(frets, false)).toBeNull();
    const chord = buildChord('C', 'dominant-9');
    const found = searchVoicings(chord.pitchClasses, STD, chord.rootPc, {
      ...chordVoicingConstraints(chord), maxFret: 5, maxResults: 10000,
    });
    const voicing = findShape(found.voicings, 'x32333');
    expect(voicing).toBeDefined();
    expect(new Set(voicing!.pitchClasses)).toEqual(new Set(chord.pitchClasses));
  });

  it('does not assign one finger to unrelated frets or barre across an open string', () => {
    const withoutBarre = assignFingering([1, 3, 3, 2, 1, 1], false);
    expect(withoutBarre).toBeNull();
    const withOpen = assignFingering([1, 3, 0, 3, 1, 1], true);
    expect(withOpen?.barre && withOpen.barre.stringFrom <= 0 && withOpen.barre.stringTo >= 4).toBeFalsy();
    if (withOpen) for (const [index, fret] of [1, 3, 0, 3, 1, 1].entries()) if (fret > 0) expect(withOpen.fingers[index]).not.toBe(0);
  });

  it('marks open strings and muted strings', () => {
    const result = assignFingering([null, 3, 2, 0, 1, 0], true);
    expect(result!.fingers[0]).toBe('x');
    expect(result!.fingers[3]).toBe(0);
    expect(result!.fingers[5]).toBe(0);
  });

  it('rejects shapes needing more than four fingers without a barre', () => {
    // Five distinct fretted frets is unplayable.
    const result = assignFingering([1, 2, 3, 4, 5, 0], false);
    expect(result).toBeNull();
  });
});
