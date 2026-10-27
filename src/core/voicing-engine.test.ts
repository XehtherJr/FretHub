import { describe, it, expect } from 'vitest';
import { generateVoicings, assignFingering, fretPc } from './voicing-engine';
import { getTuning, applyCapo } from './tunings';
import { buildChord } from './chords';
import { noteToPc } from './notes';

const STD = getTuning('standard');
const DROP_D = getTuning('drop-d');

/** Find a voicing matching an exact tab string like "x32010" (low-to-high). */
function findShape(voicings: { frets: (number | null)[] }[], tab: string) {
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

describe('fingering assignment', () => {
  it('detects a barre and assigns finger 1 across it', () => {
    // F major barre: 133211 (E-shaped at fret 1)
    const result = assignFingering([1, 3, 3, 2, 1, 1], true);
    expect(result).not.toBeNull();
    expect(result!.barre).toEqual({ fret: 1, stringFrom: 0, stringTo: 5 });
    expect(result!.fingers).toEqual([1, 3, 4, 2, 1, 1]);
    expect(result!.fingerCount).toBeLessThanOrEqual(4);
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
