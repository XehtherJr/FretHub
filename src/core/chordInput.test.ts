import { describe, expect, it } from 'vitest';
import { parseChordInput } from './chordInput';

describe('chord name input', () => {
  it.each([
    ['C', 'C', 'major'], ['c major', 'C', 'major'], ['CM7', 'C', 'major-7'],
    ['Cm7', 'C', 'minor-7'], ['Cmaj7', 'C', 'major-7'], ['cMAJ7', 'C', 'major-7'],
    ['F♯m', 'F#', 'minor'], ['B♭7', 'Bb', 'dominant-7'], ['Cbaug', 'Cb', 'augmented'],
    ['E#7alt', 'E#', 'dominant-alt'], ['Cm6/9', 'C', 'minor-six-nine'], ['D so what chord', 'D', 'so-what'],
  ])('parses %s with its intended root and type', (text, root, typeId) => {
    expect(parseChordInput(text)).toMatchObject({ root, typeId });
  });
  it('distinguishes a slash bass from a six-nine chord', () => {
    expect(parseChordInput('C6/9/E')).toEqual({ root: 'C', typeId: 'six-nine', bass: 'E' });
    expect(parseChordInput('Bbmaj7/D')).toEqual({ root: 'Bb', typeId: 'major-7', bass: 'D' });
  });
  it('does not turn unfamiliar labels into a guessed chord', () => {
    expect(parseChordInput('My favourite shape')).toBeNull();
    expect(parseChordInput('Cnotachord')).toBeNull();
    expect(parseChordInput('')).toBeNull();
  });
});
