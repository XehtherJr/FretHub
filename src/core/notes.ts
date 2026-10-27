/**
 * notes.ts — low-level pitch-class and MIDI math.
 *
 * A pitch class (pc) is an integer 0..11 where 0 = C. Everything else in the
 * engine (chords, scales, voicings, identification) is built on top of these
 * primitives so that no musical fact is ever hardcoded as a note list.
 */

export const SHARP_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export const FLAT_NAMES = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const;

export type NoteName = string;

/** Normalize any integer (including negatives / >11) into a pitch class 0..11. */
export function normalizePc(pc: number): number {
  return ((pc % 12) + 12) % 12;
}

const NOTE_ALIASES: Record<string, number> = {
  'cb': 11, 'c': 0, 'c#': 1, 'db': 1, 'd': 2, 'd#': 3, 'eb': 3,
  'e': 4, 'fb': 3, 'e#': 5, 'f': 5, 'f#': 6, 'gb': 6, 'g': 7,
  'g#': 8, 'ab': 8, 'a': 9, 'a#': 10, 'bb': 10, 'b': 11, 'b#': 0,
};

/** Parse a note name (e.g. "C#", "eb", "Bb") into a pitch class. */
export function noteToPc(note: NoteName): number {
  const key = note.trim().toLowerCase().replace(/\s+/g, '');
  const pc = NOTE_ALIASES[key];
  if (pc === undefined) {
    throw new Error(`Unknown note name: "${note}"`);
  }
  return pc;
}

/** Name a pitch class, choosing sharps or flats. */
export function pcToNote(pc: number, preferFlats = false): NoteName {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[normalizePc(pc)];
}

/** Enharmonic spelling of a note (C# -> Db, Db -> C# ...). */
export function enharmonic(note: NoteName): NoteName {
  const pc = noteToPc(note);
  const isFlat = note.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(note);
  return pcToNote(pc, !isFlat);
}

/** Transpose a note by a number of semitones and return the new pitch class. */
export function transposePc(pc: number, semitones: number): number {
  return normalizePc(pc + semitones);
}

/** Transpose a named note, preserving sharp/flat spelling preference. */
export function transposeNote(note: NoteName, semitones: number): NoteName {
  const preferFlats = note.includes('b');
  return pcToNote(transposePc(noteToPc(note), semitones), preferFlats);
}

/** Signed shortest distance in semitones from a to b (ascending positive). */
export function semitonesBetween(aPc: number, bPc: number): number {
  return normalizePc(bPc - aPc);
}

/** Convert a MIDI note number to frequency in Hz (A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convert a pitch class + octave to MIDI. Middle C (C4) = 60.
 */
export function pcOctaveToMidi(pc: number, octave: number): number {
  return (octave + 1) * 12 + normalizePc(pc);
}

/**
 * Given an open string (pc + octave) and a fret, return the sounding MIDI note.
 * Fret 0 is the open string; negative frets are not valid.
 */
export function fretToMidi(openPc: number, openOctave: number, fret: number): number {
  if (fret < 0) throw new Error('Fret must be >= 0');
  return pcOctaveToMidi(openPc, openOctave) + fret;
}

/** All 12 pitch classes in the cycle-of-fifths order starting on C. */
export const CYCLE_OF_FIFTHS: number[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/** Root note order used by the encyclopedia UI (chromatic, sharps). */
export const ROOT_NOTES: NoteName[] = [...SHARP_NAMES];

/** Returns true when a note name is conventionally spelled with flats. */
export function usesFlats(note: NoteName): boolean {
  return note.includes('b');
}
