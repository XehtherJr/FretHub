import { normalizePc } from './notes';

/**
 * A voicing-specific label needs register and ordering, not just a pitch set.
 * Pattern offsets are measured in semitones from the lowest (root) note.
 */
export function matchesVoicingPattern(midis: number[], rootPc: number, pattern: number[]): boolean {
  if (midis.length !== pattern.length || !midis.every(Number.isInteger)) return false;
  const ascending = [...midis].sort((a, b) => a - b);
  return normalizePc(ascending[0]) === normalizePc(rootPc)
    && ascending.every((midi, index) => midi - ascending[0] === pattern[index]);
}
