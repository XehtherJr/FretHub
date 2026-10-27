import { describe, it, expect } from 'vitest';
import { buildScale, buildArpeggio, SCALE_TYPES } from './scales';
import {
  diatonicTriads, diatonicSevenths, naturalMinorTriads, harmonicMinorTriads,
  buildProgression, PROGRESSION_TEMPLATES, circleOfFifths,
} from './progressions';
import { noteToPc } from './notes';

const pcs = (names: string[]) => names.map(noteToPc);

describe('scales and modes', () => {
  it('builds the C major scale', () => {
    expect(buildScale('C', 'major').map((n) => n.name)).toEqual(
      ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
    );
  });

  it('natural minor shares the major key signature (relative minor)', () => {
    const aMinor = buildScale('A', 'natural-minor').map((n) => n.pc).sort();
    const cMajor = buildScale('C', 'major').map((n) => n.pc).sort();
    expect(aMinor).toEqual(cMajor);
  });

  it('builds pentatonics and the blues scale', () => {
    expect(buildScale('A', 'minor-pentatonic').map((n) => n.name)).toEqual(
      ['A', 'C', 'D', 'E', 'G'],
    );
    expect(buildScale('C', 'major-pentatonic').map((n) => n.pc)).toEqual(
      pcs(['C', 'D', 'E', 'G', 'A']),
    );
    expect(buildScale('A', 'blues').map((n) => n.pc)).toEqual(
      pcs(['A', 'C', 'D', 'Eb', 'E', 'G']),
    );
  });

  it('builds all seven diatonic modes with correct colour tones', () => {
    expect(buildScale('D', 'dorian').map((n) => n.pc)).toEqual(pcs(['D', 'E', 'F', 'G', 'A', 'B', 'C']));
    expect(buildScale('E', 'phrygian').map((n) => n.pc)).toEqual(pcs(['E', 'F', 'G', 'A', 'B', 'C', 'D']));
    expect(buildScale('F', 'lydian').map((n) => n.pc)).toEqual(pcs(['F', 'G', 'A', 'B', 'C', 'D', 'E']));
    expect(buildScale('G', 'mixolydian').map((n) => n.pc)).toEqual(pcs(['G', 'A', 'B', 'C', 'D', 'E', 'F']));
    expect(buildScale('B', 'locrian').map((n) => n.pc)).toEqual(pcs(['B', 'C', 'D', 'E', 'F', 'G', 'A']));
  });

  it('harmonic and melodic minor raise the right degrees', () => {
    const hm = buildScale('A', 'harmonic-minor').map((n) => n.pc);
    expect(hm).toEqual(pcs(['A', 'B', 'C', 'D', 'E', 'F', 'G#']));
    const mm = buildScale('A', 'melodic-minor').map((n) => n.pc);
    expect(mm).toEqual(pcs(['A', 'B', 'C', 'D', 'E', 'F#', 'G#']));
  });

  it('handles symmetrical scales and the chromatic scale', () => {
    expect(buildScale('C', 'whole-tone')).toHaveLength(6);
    expect(buildScale('C', 'diminished')).toHaveLength(8);
    expect(buildScale('C', 'chromatic')).toHaveLength(12);
  });

  it('every scale definition builds without duplicate pitch classes (except chromatic)', () => {
    for (const type of SCALE_TYPES) {
      const notes = buildScale('C', type.id);
      const unique = new Set(notes.map((n) => n.pc));
      expect(unique.size, type.id).toBe(notes.length);
    }
  });

  it('builds a two-octave arpeggio from chord intervals', () => {
    const arp = buildArpeggio('C', ['1', '3', '5']);
    expect(arp).toHaveLength(5); // root, third, fifth + third/fifth an octave up
    expect(arp[0].name).toBe('C');
    expect(arp[3].interval).toContain('8va');
  });
});

describe('diatonic harmony and Roman numerals', () => {
  it('produces the C major diatonic triads C Dm Em F G Am Bdim', () => {
    const triads = diatonicTriads('C');
    expect(triads.map((c) => c.chordTypeId)).toEqual(
      ['major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'],
    );
    expect(triads.map((c) => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(triads[4].rootName).toBe('G'); // V = G
  });

  it('produces seventh chords with the right qualities', () => {
    const sevs = diatonicSevenths('C');
    expect(sevs.map((c) => c.chordTypeId)).toEqual([
      'major-7', 'minor-7', 'minor-7', 'major-7', 'dominant-7', 'minor-7', 'half-diminished',
    ]);
  });

  it('natural minor triads follow i ii° III iv v VI VII', () => {
    const triads = naturalMinorTriads('A');
    expect(triads.map((c) => c.chordTypeId)).toEqual(
      ['minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'],
    );
  });

  it('harmonic minor turns v into V major and vii into diminished', () => {
    const triads = harmonicMinorTriads('A');
    expect(triads[4].chordTypeId).toBe('major'); // E major V
    expect(triads[4].pitchClasses).toEqual(pcs(['E', 'G#', 'B']));
    expect(triads[6].chordTypeId).toBe('diminished'); // G#dim
  });

  it('resolves the I–V–vi–IV template in C to C G Am F', () => {
    const template = PROGRESSION_TEMPLATES.find((t) => t.id === 'pop-punk')!;
    const chords = buildProgression('C', template);
    expect(chords.map((c) => c.rootName)).toEqual(['C', 'G', 'A', 'F']);
    expect(chords.map((c) => c.chordTypeId)).toEqual(['major', 'major', 'minor', 'major']);
  });

  it('resolves ii7–V7–Imaj7 in F with seventh qualities', () => {
    const template = PROGRESSION_TEMPLATES.find((t) => t.id === 'jazz-251-major7')!;
    const chords = buildProgression('F', template);
    expect(chords.map((c) => c.rootName)).toEqual(['G', 'C', 'F']);
    expect(chords.map((c) => c.chordTypeId)).toEqual(['minor-7', 'dominant-7', 'major-7']);
  });

  it('the 12-bar blues has twelve bars with the expected structure', () => {
    const template = PROGRESSION_TEMPLATES.find((t) => t.id === 'blues-12')!;
    expect(template.numerals).toHaveLength(12);
    const chords = buildProgression('E', template);
    expect(chords[0].rootName).toBe('E');
    expect(chords[4].rootName).toBe('A'); // IV
    expect(chords[8].rootName).toBe('B'); // V
  });

  it('circle of fifths starts C G D and reports key signatures', () => {
    const circle = circleOfFifths();
    expect(circle.slice(0, 3).map((c) => c.rootName)).toEqual(['C', 'G', 'D']);
    expect(circle[0].sharps).toBe(0);
    expect(circle[1].sharps).toBe(1);
    expect(circle[7].sharps).toBe(-5); // Db major, five flats
    expect(circle[0].relativeMinor).toBe('A');
  });
});
