import { midiToFreq, normalizePc, pcToNote } from './notes';

export interface PitchReading { frequency: number; midi: number; note: string; octave: number; cents: number }

/**
 * YIN-style fundamental-frequency estimate, bounded to instrument pitches.
 * Returns null for silence or an aperiodic/noisy signal. The quadratic
 * interpolation improves accuracy between sample lags.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number, minHz = 40, maxHz = 1000): PitchReading | null {
  let energy = 0;
  for (const sample of buffer) energy += sample * sample;
  if (Math.sqrt(energy / buffer.length) < 0.008) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(buffer.length / 2) - 1);
  const count = buffer.length - maxLag;
  if (maxLag <= minLag || count <= 0) return null;
  const normalized = new Float64Array(maxLag + 2);
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const delta = buffer[i] - buffer[i + lag];
      sum += delta * delta;
    }
    running += sum;
    normalized[lag] = running > 0 ? sum * lag / running : 1;
  }

  let best = -1;
  for (let lag = minLag; lag < maxLag; lag++) {
    if (normalized[lag] < 0.15) {
      while (lag + 1 <= maxLag && normalized[lag + 1] < normalized[lag]) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) return null;
  const left = normalized[best - 1];
  const center = normalized[best];
  const right = normalized[best + 1] || center;
  const denominator = 2 * (2 * center - right - left);
  const refined = denominator ? best + (right - left) / denominator : best;
  const frequency = sampleRate / refined;
  if (!Number.isFinite(frequency) || frequency < minHz || frequency > maxHz) return null;
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return {
    frequency,
    midi,
    note: pcToNote(normalizePc(midi)),
    octave: Math.floor(midi / 12) - 1,
    cents: Math.round(1200 * Math.log2(frequency / midiToFreq(midi))),
  };
}
