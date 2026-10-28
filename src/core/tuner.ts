import { midiToFreq, pcOctaveToMidi, pcToNote } from './notes';
import type { PitchReading } from './pitchDetection';
import type { Tuning } from './tunings';

export type TunerMode = 'strings' | 'chromatic';
export interface TunerString { index: number; number: number; midi: number; label: string; octave: number }
export interface TunerAssessment {
  target: TunerString | null;
  targetMidi: number;
  targetLabel: string;
  cents: number;
  state: 'flat' | 'sharp' | 'in-tune' | 'verify';
  advice: string;
}

/** Preserve each string's register; use the flat names shown in Eb standard. */
export function tunerStrings(tuning: Tuning): TunerString[] {
  return tuning.strings.map((string, index) => ({
    index,
    number: tuning.strings.length - index,
    midi: pcOctaveToMidi(string.pc, string.octave),
    label: tuning.id === 'half-step-down' ? `${pcToNote(string.pc, true)}${string.octave}` : string.label,
    octave: string.octave,
  }));
}

/**
 * Auto guitar mode compares the measured frequency to the nearest configured
 * open string, not the nearest chromatic semitone. A locked target is always
 * compared in its actual octave. Far-away readings get no tuning direction:
 * the user may have plucked a different string or a harmonic.
 */
export function assessTunerPitch(reading: PitchReading, strings: TunerString[], targetIndex: number | null, mode: TunerMode): TunerAssessment {
  const centsFrom = (midi: number) => 1200 * Math.log2(reading.frequency / midiToFreq(midi));
  const locked = targetIndex === null ? null : strings.find((string) => string.index === targetIndex) ?? null;
  const target = locked ?? (mode === 'strings' ? strings.reduce<TunerString | null>((nearest, string) =>
    !nearest || Math.abs(centsFrom(string.midi)) < Math.abs(centsFrom(nearest.midi)) ? string : nearest, null) : null);
  const targetMidi = target?.midi ?? reading.midi;
  const targetLabel = target?.label ?? `${reading.note}${reading.octave}`;
  const cents = Math.round(centsFrom(targetMidi));
  const tooFar = !!target && Math.abs(cents) > (locked ? 200 : 100);
  const state = tooFar ? 'verify' : Math.abs(cents) <= 5 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp';
  const advice = state === 'verify'
    ? locked ? `Heard ${reading.note}${reading.octave}. Check the selected string before turning a peg.` : 'Not close to an open string. Select the string before adjusting.'
    : state === 'in-tune' ? 'In tune' : state === 'flat' ? 'Flat · tune up gently' : 'Sharp · tune down gently';
  return { target, targetMidi, targetLabel, cents, state, advice };
}
