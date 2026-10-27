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
