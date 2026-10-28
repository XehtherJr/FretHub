/** Timing helpers shared by the metronome and deterministic signal tests. */
export type TimingSummary = 'listening' | 'on-time' | 'ahead' | 'behind' | 'inconsistent';

/** Signed distance from an onset to the nearest beat, in milliseconds. */
export function beatOffsetMs(onsetSeconds: number, anchorSeconds: number, bpm: number, latencyMs = 0): number {
  const period = 60 / bpm;
  const corrected = onsetSeconds - latencyMs / 1000;
  return (corrected - (anchorSeconds + Math.round((corrected - anchorSeconds) / period) * period)) * 1000;
}

export function describeTiming(offsets: number[], bpm: number): { summary: TimingSummary; mean: number; spread: number } {
  const values = offsets.slice(-8);
  if (!values.length) return { summary: 'listening', mean: 0, spread: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  if (values.length < 3) return { summary: 'listening', mean, spread };
  const unstableThreshold = Math.max(32, Math.min(70, (60000 / bpm) * 0.1));
  if (spread > unstableThreshold) return { summary: 'inconsistent', mean, spread };
  if (mean < -22) return { summary: 'ahead', mean, spread };
  if (mean > 22) return { summary: 'behind', mean, spread };
  return { summary: 'on-time', mean, spread };
}

/** Alternates whole audible and silent bars while the audio clock keeps time. */
export function isAudibleBeat(beatIndex: number, beatsPerBar: number, audibleBars: number, silentBars: number): boolean {
  const cycle = beatsPerBar * (audibleBars + silentBars);
  return ((beatIndex % cycle) + cycle) % cycle < beatsPerBar * audibleBars;
}

/** One scheduler pulse is a notated denominator note, not always a conducting beat. */
export interface TimeSignature {
  id: string;
  numerator: number;
  denominator: 4 | 8;
  /** Eighth-note group lengths, or one ungrouped set of quarter-note pulses. */
  groups: readonly number[];
}

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  { id: '2/4', numerator: 2, denominator: 4, groups: [2] },
  { id: '3/4', numerator: 3, denominator: 4, groups: [3] },
  { id: '4/4', numerator: 4, denominator: 4, groups: [4] },
  { id: '5/4', numerator: 5, denominator: 4, groups: [5] },
  { id: '6/4', numerator: 6, denominator: 4, groups: [6] },
  { id: '7/4', numerator: 7, denominator: 4, groups: [7] },
  { id: '6/8', numerator: 6, denominator: 8, groups: [3, 3] },
  { id: '7/8', numerator: 7, denominator: 8, groups: [2, 2, 3] },
  { id: '12/8', numerator: 12, denominator: 8, groups: [3, 3, 3, 3] },
];

export const SEVEN_EIGHT_GROUPINGS: readonly (readonly number[])[] = [[2, 2, 3], [2, 3, 2], [3, 2, 2]];
export type ClickAccent = boolean | 'group';

/** Bar downbeat is strongest; secondary group starts get a lighter accent. */
export function clickAccent(pulse: number, meter: TimeSignature, groups: readonly number[] = meter.groups): ClickAccent {
  const position = ((pulse % meter.numerator) + meter.numerator) % meter.numerator;
  if (position === 0) return true;
  let start = 0;
  for (const length of groups.slice(0, -1)) {
    start += length;
    if (position === start) return 'group';
  }
  return false;
}
