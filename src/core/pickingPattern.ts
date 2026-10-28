import { noteToPc, pcOctaveToMidi } from './notes';
import type { Tuning } from './tunings';

/** String indices follow the tuning's physical bass-side-to-treble-side order. */
export type PatternStep =
  | { kind: 'pick'; strings: number[] }
  | { kind: 'down' }
  | { kind: 'up' }
  | { kind: 'rest' };
export type StepsPerBeat = 1 | 2 | 3 | 4;
export type PlaybackPattern =
  | { mode: 'arpeggio'; stepsPerBeat: StepsPerBeat }
  | { mode: 'custom'; stepsPerBeat: StepsPerBeat; steps: PatternStep[] };

export const MAX_PATTERN_STEPS = 64;

/** Validate persisted data before it reaches playback or another device. */
export function validPlaybackPattern(value: unknown, stringCount: number): value is PlaybackPattern {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pattern = value as Record<string, unknown>;
  if (![1, 2, 3, 4].includes(pattern.stepsPerBeat as number)) return false;
  if (pattern.mode === 'arpeggio') return pattern.steps === undefined;
  if (pattern.mode !== 'custom' || !Array.isArray(pattern.steps) || !pattern.steps.length || pattern.steps.length > MAX_PATTERN_STEPS) return false;
  return pattern.steps.every((step: unknown) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
    const entry = step as Record<string, unknown>;
    if (entry.kind === 'down' || entry.kind === 'up' || entry.kind === 'rest') return entry.strings === undefined;
    if (entry.kind !== 'pick' || !Array.isArray(entry.strings) || !entry.strings.length || entry.strings.length > stringCount) return false;
    return entry.strings.every((index: unknown) => Number.isInteger(index) && (index as number) >= 0 && (index as number) < stringCount)
      && new Set(entry.strings).size === entry.strings.length;
  });
}

export type PatternParseResult = { steps: PatternStep[]; error: null } | { steps: null; error: string };

/**
 * Resolve a string by its conventional number or by its open, un-capoed
 * tuning name (with an octave if needed). Numeric 1 is the treble-side string.
 */
function stringIndex(token: string, tuning: Tuning): { index: number } | { error: string } {
  if (/^\d+$/.test(token)) {
    const number = Number(token);
    if (number >= 1 && number <= tuning.strings.length) return { index: tuning.strings.length - number };
    return { error: `String ${token} is outside this instrument. Use 1–${tuning.strings.length}.` };
  }
  const normalized = token.replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = /^([A-Ga-g])((?:#+|b+)?)(\d+)?$/.exec(normalized);
  if (!match) return { error: `“${token}” is not a string. Use a string name or number, down, up, or rest.` };
  const note = `${match[1]}${match[2]}`;
  const pc = noteToPc(note);
  const writtenOctave = match[3] === undefined ? null : Number(match[3]);
  const accidental = match[2];
  const offset = accidental.startsWith('#') ? accidental.length : -accidental.length;
  // Preserve octave crossings in spellings such as B#2 = C3, not C2.
  const writtenMidi = writtenOctave === null ? null : (writtenOctave + 1) * 12 + noteToPc(match[1]) + offset;
  const matches = tuning.strings.flatMap((string, index) => {
    const matchesPitch = writtenMidi === null ? string.pc === pc : pcOctaveToMidi(string.pc, string.octave) === writtenMidi;
    return matchesPitch ? [index] : [];
  });
  if (!matches.length) return { error: `No ${token} string in ${tuning.name}. Use the string numbers or labels below.` };
  if (matches.length > 1) {
    const choices = matches.map((index) => `${tuning.strings[index].label} (string ${tuning.strings.length - index})`).join(' or ');
    return { error: `“${token}” is ambiguous. Use ${choices}.` };
  }
  return { index: matches[0] };
}

/** Parse equal-length steps; + means simultaneous strings, not a strum. */
export function parsePickingPattern(text: string, tuning: Tuning): PatternParseResult {
  const input = text.trim().replace(/\s*\+\s*/g, '+');
  if (!input) return { steps: null, error: 'Enter at least one pattern step.' };
  const tokens = input.split(/[\s,;\-]+/).filter(Boolean);
  if (!tokens.length) return { steps: null, error: 'Enter at least one pattern step.' };
  if (tokens.length > MAX_PATTERN_STEPS) return { steps: null, error: `Use at most ${MAX_PATTERN_STEPS} steps.` };
  const steps: PatternStep[] = [];
  for (const token of tokens) {
    const keyword = token.toLowerCase();
    if (keyword === 'down' || keyword === 'up' || keyword === 'rest') {
      steps.push({ kind: keyword });
      continue;
    }
    const parts = token.split('+');
    if (parts.some((part) => !part)) return { steps: null, error: `“${token}” needs a string on each side of +.` };
    const indices: number[] = [];
    for (const part of parts) {
      const result = stringIndex(part, tuning);
      if ('error' in result) return { steps: null, error: result.error };
      if (indices.includes(result.index)) return { steps: null, error: `“${token}” repeats the same string in one step.` };
      indices.push(result.index);
    }
    steps.push({ kind: 'pick', strings: indices.sort((a, b) => a - b) });
  }
  return { steps, error: null };
}

/** A portable editable representation; string numbers stay stable across capo changes. */
export function formatPickingPattern(steps: PatternStep[], stringCount: number): string {
  return steps.map((step) => step.kind === 'pick' ? step.strings.map((index) => stringCount - index).join('+') : step.kind).join(' ');
}
