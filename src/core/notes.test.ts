import { describe, it, expect } from 'vitest';
import {
  noteToPc, pcToNote, normalizePc, transposeNote, transposePc,
  enharmonic, semitonesBetween, midiToFreq, pcOctaveToMidi, fretToMidi,
  CYCLE_OF_FIFTHS,
} from './notes';

describe('pitch-class primitives', () => {
  it('parses sharp and flat spellings including aliases', () => {
    expect(noteToPc('C')).toBe(0);
    expect(noteToPc('C#')).toBe(1);
    expect(noteToPc('Db')).toBe(1);
    expect(noteToPc('Bb')).toBe(10);
    expect(noteToPc('eb')).toBe(3);
    expect(noteToPc('F#')).toBe(6);
    expect(noteToPc('Gb')).toBe(6);
    // Theoretical spellings
    expect(noteToPc('E#')).toBe(5);
    expect(noteToPc('Cb')).toBe(11);
    expect(noteToPc('Fb')).toBe(4); // F flat is enharmonic with E.
  });

  it('throws on garbage input', () => {
    expect(() => noteToPc('Z#')).toThrow(/Unknown note/);
  });

  it('normalizes out-of-range integers', () => {
    expect(normalizePc(12)).toBe(0);
    expect(normalizePc(-1)).toBe(11);
    expect(normalizePc(25)).toBe(1);
  });

  it('names pitch classes with correct enharmonic spelling', () => {
    expect(pcToNote(1, false)).toBe('C#');
    expect(pcToNote(1, true)).toBe('Db');
    expect(pcToNote(0)).toBe('C');
    expect(pcToNote(10, true)).toBe('Bb');
    expect(pcToNote(11, true)).toBe('B');
  });

  it('transposes notes and preserves spelling preference', () => {
    expect(transposePc(0, 7)).toBe(7);
    expect(transposeNote('C', 7)).toBe('G');
    expect(transposeNote('Eb', 3)).toBe('Gb');
    expect(transposeNote('B', 1)).toBe('C');
    expect(transposeNote('C', -1)).toBe('B');
  });

  it('returns enharmonic equivalents', () => {
    expect(enharmonic('C#')).toBe('Db');
    expect(enharmonic('Db')).toBe('C#');
    expect(enharmonic('Gb')).toBe('F#');
  });

  it('measures ascending semitone distances within an octave', () => {
    expect(semitonesBetween(0, 4)).toBe(4);
    expect(semitonesBetween(11, 0)).toBe(1);
    expect(semitonesBetween(7, 7)).toBe(0);
  });

  it('converts MIDI numbers and frequencies against A4=440', () => {
    expect(pcOctaveToMidi(0, 4)).toBe(60); // middle C
    expect(pcOctaveToMidi(9, 4)).toBe(69); // A4
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6); // A3
  });

  it('computes sounding MIDI from string + fret', () => {
    // Low E string = E2 = MIDI 40; 5th fret = A2 = 45
    expect(fretToMidi(4, 2, 5)).toBe(45);
    expect(fretToMidi(4, 2, 0)).toBe(40);
  });

  it('builds the cycle of fifths starting on C', () => {
    expect(CYCLE_OF_FIFTHS.slice(0, 4)).toEqual([0, 7, 2, 9]); // C G D A
    expect(CYCLE_OF_FIFTHS).toHaveLength(12);
  });
});
