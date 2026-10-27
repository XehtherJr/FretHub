import { describe, it, expect } from 'vitest';
import { buildChord, buildEncyclopedia, chordSearchNames } from './chords';
import { CHORD_TYPES } from './chord-definitions';
import { noteToPc } from './notes';

const pcs = (names: string[]) => names.map(noteToPc);

describe('chord construction from interval formulas', () => {
  it('builds the canonical triads', () => {
    expect(buildChord('C', 'major').pitchClasses).toEqual(pcs(['C', 'E', 'G']));
    expect(buildChord('A', 'minor').pitchClasses).toEqual(pcs(['A', 'C', 'E']));
    expect(buildChord('B', 'diminished').pitchClasses).toEqual(pcs(['B', 'D', 'F']));
    expect(buildChord('C', 'augmented').pitchClasses).toEqual(pcs(['C', 'E', 'G#']));
  });

  it('builds suspended and power chords', () => {
    expect(buildChord('A', 'sus2').pitchClasses).toEqual(pcs(['A', 'B', 'E']));
    expect(buildChord('A', 'sus4').pitchClasses).toEqual(pcs(['A', 'D', 'E']));
    expect(buildChord('E', 'power').pitchClasses).toEqual(pcs(['E', 'B']));
  });

  it('builds the seventh-chord family', () => {
    expect(buildChord('G', 'dominant-7').pitchClasses).toEqual(pcs(['G', 'B', 'D', 'F']));
    expect(buildChord('F', 'major-7').pitchClasses).toEqual(pcs(['F', 'A', 'C', 'E']));
    expect(buildChord('D', 'minor-7').pitchClasses).toEqual(pcs(['D', 'F', 'A', 'C']));
    expect(buildChord('B', 'half-diminished').pitchClasses).toEqual(pcs(['B', 'D', 'F', 'A']));
    expect(buildChord('C#', 'diminished-7').pitchClasses).toEqual(pcs(['C#', 'E', 'G', 'Bb']));
    expect(buildChord('C', 'minor-major-7').pitchClasses).toEqual(pcs(['C', 'Eb', 'G', 'B']));
    expect(buildChord('A', 'dominant-7-sus4').pitchClasses).toEqual(pcs(['A', 'D', 'E', 'G']));
  });

  it('builds sixth and add-note chords', () => {
    expect(buildChord('C', 'sixth').pitchClasses).toEqual(pcs(['C', 'E', 'G', 'A']));
    expect(buildChord('C', 'minor-sixth').pitchClasses).toEqual(pcs(['C', 'Eb', 'G', 'A']));
    expect(buildChord('C', 'add9').pitchClasses).toEqual(pcs(['C', 'E', 'G', 'D']));
    expect(buildChord('D', 'madd9').pitchClasses).toEqual(pcs(['D', 'F', 'A', 'E']));
  });

  it('builds extended and altered chords', () => {
    expect(buildChord('E', 'dominant-9').pitchClasses).toEqual(pcs(['E', 'G#', 'B', 'D', 'F#']));
    // E7#9 "Hendrix chord": E G# B D G
    expect(buildChord('E', 'dominant-7sharp9').pitchClasses).toEqual(pcs(['E', 'G#', 'B', 'D', 'G']));
    expect(buildChord('C', 'major-9').pitchClasses).toEqual(pcs(['C', 'E', 'G', 'B', 'D']));
    expect(buildChord('C', 'dominant-7b9').pitchClasses).toEqual(pcs(['C', 'E', 'G', 'Bb', 'Db']));
    expect(buildChord('C', 'dominant-7sharp11').pitchClasses).toEqual(pcs(['C', 'E', 'G', 'Bb', 'D', 'F#']));
  });

  it('builds quartal and special structures', () => {
    expect(buildChord('D', 'quartal').pitchClasses).toEqual(pcs(['D', 'G', 'C']));
    // So What chord contains the pitch set D G C E A (ordering follows the formula)
    const soWhat = buildChord('D', 'so-what').pitchClasses.sort((a, b) => a - b);
    expect(soWhat).toEqual(pcs(['D', 'E', 'G', 'A', 'C']).sort((a, b) => a - b));
  });

  it('handles roots given as pitch classes and flat spellings', () => {
    // Numeric roots default to sharp spelling; named flat roots keep flats.
    expect(buildChord(3, 'minor').rootName).toBe('D#');
    const eb = buildChord('Eb', 'minor');
    expect(eb.rootName).toBe('Eb');
    expect(eb.tones.map((t) => t.name)).toEqual(['Eb', 'Gb', 'Bb']);
  });

  it('spells chord tones by interval rather than a misleading enharmonic', () => {
    expect(buildChord('C', 'minor').tones.map((tone) => tone.name)).toEqual(['C', 'Eb', 'G']);
    expect(buildChord('C', 'augmented').tones.map((tone) => tone.name)).toEqual(['C', 'E', 'G#']);
    expect(buildChord('C', 'dominant-7').tones.map((tone) => tone.name)).toEqual(['C', 'E', 'G', 'Bb']);
    expect(buildChord('C', 'diminished-7').tones.map((tone) => tone.name)).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
    expect(noteToPc('Bbb')).toBe(noteToPc('A'));
    expect(noteToPc('F##')).toBe(noteToPc('G'));
    expect(chordSearchNames(buildChord('C', 'minor')).join(' ')).toContain('c d# g');
  });

  it('represents slash chords and inversions', () => {
    const slash = buildChord('C', 'major', 'E');
    expect(slash.shortName).toBe('C/E');
    expect(slash.bassPc).toBe(noteToPc('E'));
    expect(slash.isInversion).toBe(true);
    const root = buildChord('C', 'major');
    expect(root.isInversion).toBe(false);
  });

  it('exposes interval labels per tone', () => {
    const g7 = buildChord('G', 'dominant-7');
    expect(g7.tones.map((t) => t.interval)).toEqual(['1', '3', '5', 'b7']);
    expect(g7.formula.join(' ')).toBe('1 3 5 b7');
  });

  it('every definition produces distinct, in-range pitch classes', () => {
    for (const type of CHORD_TYPES) {
      const chord = buildChord('C', type.id);
      const unique = new Set(chord.pitchClasses);
      expect(unique.size, type.id).toBe(chord.pitchClasses.length);
      chord.pitchClasses.forEach((pc) => {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(12);
      });
    }
  });

  it('the encyclopedia covers all 12 roots x all chord types', () => {
    const enc = buildEncyclopedia();
    expect(enc.length).toBe(12 * CHORD_TYPES.length);
  });

  it('produces searchable names including notes and formula', () => {
    const names = chordSearchNames(buildChord('G', 'dominant-7'));
    expect(names).toContain('g7');
    expect(names.some((n) => n.includes('g b d f'))).toBe(true);
    expect(names.some((n) => n.includes('1 3 5 b7'))).toBe(true);
  });
});
