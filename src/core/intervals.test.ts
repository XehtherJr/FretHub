import { describe, expect, it } from 'vitest';
import { INTERVALS, spellInterval } from './intervals';
import { noteToPc, normalizePc } from './notes';

describe('interval spelling', () => {
  it('retains the written letter and accidental, including compound intervals', () => {
    expect(spellInterval('Cb', '3')).toBe('Eb');
    expect(spellInterval('E#', '3')).toBe('G##');
    expect(spellInterval('B#', '#11')).toBe('E##');
    expect(spellInterval('C#######', '1')).toBe('C#######');
    expect(spellInterval('C#######', '3')).toBe('E#######');
    expect(spellInterval('Bbbbbbbb', '5')).toBe('Fbbbbbb');
  });
  it('spells the correct sounding pitch for every supported interval and unusual root', () => {
    for (const root of ['C', 'F#', 'Cb', 'Fb', 'E#', 'B#', 'F##', 'Bbb', 'C#######']) {
      for (const interval of Object.values(INTERVALS)) {
        expect(noteToPc(spellInterval(root, interval.symbol))).toBe(normalizePc(noteToPc(root) + interval.semitones));
      }
    }
  });
});
