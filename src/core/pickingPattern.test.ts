import { describe, expect, it } from 'vitest';
import { formatPickingPattern, parsePickingPattern, validPlaybackPattern } from './pickingPattern';
import { getTuning } from './tunings';

const standard = getTuning('standard');

describe('progression picking patterns', () => {
  it('parses the requested A-D-G-B-G-G+E4 sequence with the last pair together', () => {
    const result = parsePickingPattern('A-D-G-B-G-G+E4', standard);
    expect(result.error).toBeNull();
    expect(result.steps).toEqual([
      { kind: 'pick', strings: [1] }, { kind: 'pick', strings: [2] },
      { kind: 'pick', strings: [3] }, { kind: 'pick', strings: [4] },
      { kind: 'pick', strings: [3] }, { kind: 'pick', strings: [3, 5] },
    ]);
    expect(formatPickingPattern(result.steps!, 6)).toBe('5 4 3 2 3 3+1');
  });

  it('combines picks, strum directions and rests and round-trips their string indices', () => {
    const result = parsePickingPattern('5, 4 + 1; down up rest 3', standard);
    expect(result.steps).toEqual([
      { kind: 'pick', strings: [1] }, { kind: 'pick', strings: [2, 5] },
      { kind: 'down' }, { kind: 'up' }, { kind: 'rest' }, { kind: 'pick', strings: [3] },
    ]);
    expect(parsePickingPattern(formatPickingPattern(result.steps!, 6), standard)).toEqual(result);
  });

  it('uses actual un-capoed tuning labels, enharmonics and string numbers', () => {
    const dropD = getTuning('drop-d');
    expect(parsePickingPattern('D', dropD).error).toMatch(/ambiguous/i);
    expect(parsePickingPattern('D2-D3-E4', dropD).steps).toEqual([
      { kind: 'pick', strings: [0] }, { kind: 'pick', strings: [2] }, { kind: 'pick', strings: [5] },
    ]);
    expect(parsePickingPattern('Bb3', getTuning('half-step-down')).steps).toEqual([{ kind: 'pick', strings: [4] }]);
    expect(parsePickingPattern('Cb4', standard).steps).toEqual([{ kind: 'pick', strings: [4] }]);
    expect(parsePickingPattern('F#1+1', getTuning('8-string-standard')).steps).toEqual([{ kind: 'pick', strings: [0, 7] }]);
  });

  it('explains ambiguous, repeated, unknown and out-of-range strings without playing them', () => {
    expect(parsePickingPattern('E', standard).error).toMatch(/ambiguous/i);
    expect(parsePickingPattern('E2+6', standard).error).toMatch(/same string/i);
    expect(parsePickingPattern('G+', standard).error).toMatch(/each side/i);
    expect(parsePickingPattern('7', standard).error).toMatch(/outside/i);
    expect(parsePickingPattern('H', standard).error).toMatch(/not a string/i);
    expect(parsePickingPattern('', standard).error).toMatch(/at least one/i);
  });

  it('validates persisted patterns and limits malformed or excessive data', () => {
    expect(validPlaybackPattern({ mode: 'arpeggio', stepsPerBeat: 2 }, 6)).toBe(true);
    expect(validPlaybackPattern({ mode: 'custom', stepsPerBeat: 3, steps: [{ kind: 'pick', strings: [3, 5] }, { kind: 'down' }] }, 6)).toBe(true);
    expect(validPlaybackPattern({ mode: 'custom', stepsPerBeat: 2, steps: [{ kind: 'pick', strings: [3, 3] }] }, 6)).toBe(false);
    expect(validPlaybackPattern({ mode: 'custom', stepsPerBeat: 2, steps: [{ kind: 'pick', strings: [6] }] }, 6)).toBe(false);
    expect(validPlaybackPattern({ mode: 'custom', stepsPerBeat: 0, steps: [{ kind: 'rest' }] }, 6)).toBe(false);
    expect(validPlaybackPattern({ mode: 'custom', stepsPerBeat: 2, steps: Array.from({ length: 65 }, () => ({ kind: 'up' })) }, 6)).toBe(false);
  });
});
