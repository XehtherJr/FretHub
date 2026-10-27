/**
 * Physical fret positions, expressed in drawing units. The nut is at zero and
 * the bridge is one scale length away. Equal temperament divides the vibrating
 * length by the twelfth root of two at each successive fret.
 *
 * Keeping this separate from pitch/voicing calculations lets every instrument
 * view share the same geometry without introducing a second theory engine.
 */
export const FRETBOARD_SCALE_LENGTH = 1860;
export const FRETBOARD_NUT_X = 78;

export function fretDistance(fret: number, scaleLength = FRETBOARD_SCALE_LENGTH): number {
  return scaleLength * (1 - Math.pow(2, -fret / 12));
}

export function fretWireX(fret: number): number {
  return FRETBOARD_NUT_X + fretDistance(fret);
}

export function fretCentreX(fret: number): number {
  return (fretWireX(fret - 1) + fretWireX(fret)) / 2;
}
