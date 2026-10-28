import { midiToFreq, normalizePc, pcToNote } from './notes';

export interface PitchReading { frequency: number; midi: number; note: string; octave: number; cents: number }

/** RMS after removing a DC offset; useful for a microphone-level indicator. */
export function signalLevel(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  let squared = 0;
  for (const sample of buffer) { sum += sample; squared += sample * sample; }
  const mean = sum / buffer.length;
  return Math.sqrt(Math.max(0, squared / buffer.length - mean * mean));
}

/**
 * YIN-style difference function with a bounded search and parabolic lag
 * interpolation. A small low-pass/downsample pass reduces CPU work on phones
 * while retaining enough samples per period for guitar and chromatic notes.
 * Returns null for silence or an aperiodic/noisy signal.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number, minHz = 35, maxHz = 1600): PitchReading | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || minHz <= 0 || maxHz <= minHz || signalLevel(buffer) < 0.0015) return null;

  // Box-filter before decimation, rather than merely dropping samples.
  const factor = Math.max(1, Math.floor(sampleRate / 16000));
  const length = Math.floor(buffer.length / factor);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += buffer[i * factor + j];
    samples[i] = sum / factor;
  }
  const rate = sampleRate / factor;
  const minLag = Math.max(2, Math.floor(rate / maxHz));
  const maxLag = Math.min(Math.floor(rate / minHz), Math.floor(length / 2) - 1);
  const count = length - maxLag;
  if (maxLag <= minLag || count <= 0) return null;
  const normalized = new Float64Array(maxLag + 2);
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const delta = samples[i] - samples[i + lag];
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

  // A strong second harmonic can cross the threshold before the fundamental.
  // Prefer the longer period only when it is *substantially* more periodic;
  // merely being slightly better could turn a real note into a false octave.
  if (normalized[best] > 0.075 && best * 2 + 2 <= maxLag) {
    let doubled = best * 2;
    for (let lag = best * 2 - 2; lag <= best * 2 + 2; lag++) {
      if (normalized[lag] < normalized[doubled]) doubled = lag;
    }
    if (normalized[doubled] < normalized[best] * 0.4) best = doubled;
  }

  const left = normalized[best - 1];
  const center = normalized[best];
  const right = normalized[best + 1] || center;
  const denominator = 2 * (2 * center - right - left);
  const refined = denominator ? best + (right - left) / denominator : best;

  // The decimated search is inexpensive, but at high notes its lag can span
  // only a handful of samples. Refine the chosen period against the original
  // waveform so chromatic readings remain accurate without a full-rate search.
  const originalLag = Math.round(refined * factor);
  let finalLag = refined * factor;
  if (originalLag > 1 && originalLag + 1 < buffer.length) {
    const differences = [0, 0, 0];
    const originalCount = buffer.length - originalLag - 1;
    for (let i = 0; i < originalCount; i++) {
      for (let n = 0; n < 3; n++) {
        const delta = buffer[i] - buffer[i + originalLag + n - 1];
        differences[n] += delta * delta;
      }
    }
    const [a, b, c] = differences;
    const curvature = 2 * (2 * b - c - a);
    if (b <= a && b <= c && curvature) finalLag = originalLag + (c - a) / curvature;
  }
  const frequency = sampleRate / finalLag;
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
