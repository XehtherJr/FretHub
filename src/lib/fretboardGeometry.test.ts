import { describe, expect, it } from 'vitest';
import { FRETBOARD_NUT_X, FRETBOARD_SCALE_LENGTH, fretCentreX, fretDistance, fretWireX } from './fretboardGeometry';

describe('equal-tempered fretboard geometry', () => {
  it('places the nut, octave and two-octave frets at the correct fractions of the scale length', () => {
    expect(fretDistance(0)).toBe(0);
    expect(fretDistance(12)).toBeCloseTo(FRETBOARD_SCALE_LENGTH / 2, 8);
    expect(fretDistance(24)).toBeCloseTo(FRETBOARD_SCALE_LENGTH * 0.75, 8);
    expect(fretWireX(0)).toBe(FRETBOARD_NUT_X);
  });

  it('narrows each successive fret by the twelfth-root-of-two ratio', () => {
    for (let fret = 1; fret < 24; fret++) {
      const currentWidth = fretWireX(fret) - fretWireX(fret - 1);
      const nextWidth = fretWireX(fret + 1) - fretWireX(fret);
      expect(nextWidth / currentWidth).toBeCloseTo(Math.pow(2, -1 / 12), 10);
      expect(fretCentreX(fret)).toBeCloseTo((fretWireX(fret - 1) + fretWireX(fret)) / 2, 10);
    }
  });
});
