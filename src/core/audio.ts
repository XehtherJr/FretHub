/**
 * Browser audio: locally hosted, CC0 steel-string guitar recordings and
 * lightweight metronome clicks. The samples are decoded lazily and cached;
 * a synthesized pluck remains available if a sample cannot be loaded.
 */
import { midiToFreq } from './notes';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const SAMPLE_PITCHES = [40, 43, 46, 49, 52, 55, 58, 61, 64, 68, 71, 74, 77, 80, 83] as const;
// Median cents offset measured after each recorded attack. Correcting it is
// especially important when these samples are used as tuning references.
const SAMPLE_CENTS: Record<number, number> = { 40: -7, 43: -7, 46: -3, 49: -6, 52: -3, 55: -4, 58: -9, 61: -8, 64: -10, 68: -10, 71: -11, 74: -13, 77: -11, 80: -13, 83: -15 };
const sampleData = new Map<number, Promise<ArrayBuffer>>();
const sampleBuffers = new Map<number, Promise<AudioBuffer>>();

/** Lazily create the AudioContext (browsers require a user gesture). */
export function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') throw new Error('Audio is only available in the browser.');
  if (!ctx || ctx.state === 'closed') {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.8;
    // Light peak control keeps several ringing strings from clipping together.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -5;
    limiter.knee.value = 6;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => { /* A later user gesture may resume it. */ });
  return ctx;
}

export function isAudioSupported(): boolean {
  return typeof window !== 'undefined' &&
    (!!window.AudioContext || !!(window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

/** The closest recording limits transposition to a few semitones on guitar. */
export function nearestSamplePitch(midi: number): number {
  return SAMPLE_PITCHES.reduce((best, pitch) => Math.abs(pitch - midi) < Math.abs(best - midi) ? pitch : best);
}

export function samplePlaybackRate(midi: number, samplePitch: number): number {
  return Math.pow(2, (midi - samplePitch) / 12 - (SAMPLE_CENTS[samplePitch] ?? 0) / 1200);
}

function fetchSample(pitch: number): Promise<ArrayBuffer> {
  let pending = sampleData.get(pitch);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}audio/guitar/${pitch}.wav`).then((response) => {
      if (!response.ok) throw new Error(`Guitar sample ${pitch} could not be loaded`);
      return response.arrayBuffer();
    }).catch((error: unknown) => {
      sampleData.delete(pitch); // Allow a later retry after a network interruption.
      throw error;
    });
    sampleData.set(pitch, pending);
  }
  return pending;
}

/** Fetch ahead without creating an AudioContext or requiring microphone access. */
export function prefetchGuitarSamples(): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  // Respect a user's reduced-data preference; sound still loads on demand.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g') return;
  SAMPLE_PITCHES.forEach((pitch) => { void fetchSample(pitch).catch(() => {}); });
}

function loadSample(audio: AudioContext, pitch: number): Promise<AudioBuffer> {
  let pending = sampleBuffers.get(pitch);
  if (!pending) {
    pending = fetchSample(pitch).then((bytes) => audio.decodeAudioData(bytes.slice(0))).catch((error: unknown) => {
      sampleBuffers.delete(pitch);
      throw error;
    });
    sampleBuffers.set(pitch, pending);
  }
  return pending;
}

interface PluckOptions {
  when?: number;
  duration?: number;
  velocity?: number;
}

function playSample(audio: AudioContext, buffer: AudioBuffer, samplePitch: number, midi: number, options: PluckOptions): AudioBufferSourceNode {
  const when = Math.max(audio.currentTime, options.when ?? audio.currentTime);
  const rate = samplePlaybackRate(midi, samplePitch);
  const duration = Math.min(options.duration ?? 2.8, buffer.duration / rate);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.setValueAtTime(rate, when);
  const env = audio.createGain();
  const gain = 0.48 * Math.max(0, Math.min(1, options.velocity ?? 0.9));
  const attack = Math.min(0.004, duration / 2);
  env.gain.setValueAtTime(0.0001, when);
  env.gain.linearRampToValueAtTime(gain, when + attack);
  env.gain.setValueAtTime(gain, Math.max(when + attack, when + duration - 0.12));
  env.gain.linearRampToValueAtTime(0.0001, when + duration);
  source.connect(env);
  env.connect(master as GainNode);
  source.start(when);
  source.stop(when + duration);
  return source;
}

/** Offline fallback for an unavailable sample, not the primary instrument. */
function playSynth(audio: AudioContext, midi: number, options: PluckOptions): OscillatorNode {
  const when = Math.max(audio.currentTime, options.when ?? audio.currentTime);
  const duration = options.duration ?? 1.6;
  const osc = audio.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(midiToFreq(midi), when);
  const env = audio.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.2 * (options.velocity ?? 0.9), when + Math.min(0.008, duration / 2));
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(env);
  env.connect(master as GainNode);
  osc.start(when);
  osc.stop(when + duration);
  return osc;
}

/** Play a recorded string; resolve after it ends so a tuner can ignore its own reference. */
export function playMidi(midi: number, options: PluckOptions = {}): Promise<void> {
  const audio = getAudioContext();
  const pitch = nearestSamplePitch(midi);
  return loadSample(audio, pitch).then((buffer) => playSample(audio, buffer, pitch, midi, options))
    .catch(() => playSynth(audio, midi, options))
    .then((source) => new Promise<void>((resolve) => { source.onended = () => resolve(); }));
}

/** Wait for all samples before scheduling a sequence, including its fallback notes. */
export function playSequence(midiNotes: number[], gap = 0.35, duration = 1.4, velocity = 0.9): void {
  const audio = getAudioContext();
  void Promise.all(midiNotes.map((midi) => {
    const pitch = nearestSamplePitch(midi);
    return loadSample(audio, pitch).then((buffer) => ({ midi, pitch, buffer })).catch(() => ({ midi, pitch, buffer: null }));
  })).then((voices) => {
    const start = audio.currentTime + 0.01;
    voices.forEach(({ midi, pitch, buffer }, i) => {
      const options = { when: start + i * gap, duration, velocity };
      if (buffer) playSample(audio, buffer, pitch, midi, options);
      else playSynth(audio, midi, options);
    });
  });
}

/** Strum low-to-high on a downstroke; wait for all samples before scheduling. */
export function strum(midiNotes: (number | null)[], direction: 'down' | 'up' = 'down', gap = 0.035): void {
  const notes = midiNotes.filter((n): n is number => n !== null);
  playSequence(direction === 'down' ? notes : [...notes].reverse(), gap, 2.8, 0.85);
}

export interface StrumOptions { direction?: 'down' | 'up'; gap?: number }
export type PreparedStrummer = (notes: (number | null)[], when: number, duration: number, options?: StrumOptions) => AudioScheduledSourceNode[];

/** Decode each needed recording once before scheduling a cancellable progression. */
export async function prepareStrummer(audio: AudioContext, midiNotes: number[]): Promise<PreparedStrummer> {
  const entries = await Promise.all([...new Set(midiNotes)].map(async (midi) => {
    const pitch = nearestSamplePitch(midi);
    const buffer = await loadSample(audio, pitch).catch(() => null);
    return [midi, { pitch, buffer }] as const;
  }));
  const prepared = new Map(entries);
  return (notes, when, duration, strumOptions = {}) => {
    const sources: AudioScheduledSourceNode[] = [];
    try {
      const sounding = notes.filter((midi): midi is number => midi !== null);
      const ordered = strumOptions.direction === 'up' ? sounding.reverse() : sounding;
      const gap = strumOptions.gap ?? 0.035;
      ordered.forEach((midi, index) => {
        const sample = prepared.get(midi);
        const options = { when: when + index * gap, duration, velocity: 0.85 };
        sources.push(sample?.buffer ? playSample(audio, sample.buffer, sample.pitch, midi, options) : playSynth(audio, midi, options));
      });
    } catch (error) {
      sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
      throw error;
    }
    return sources;
  };
}

/** Schedule a short metronome click against the audio clock. */
export function playClick(accent: boolean | 'group' = false, when?: number): OscillatorNode {
  const audio = getAudioContext();
  const start = Math.max(audio.currentTime, when ?? audio.currentTime);
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(accent === true ? 1450 : accent === 'group' ? 1150 : 900, start);
  const env = audio.createGain();
  env.gain.setValueAtTime(accent === true ? 0.23 : accent === 'group' ? 0.18 : 0.14, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
  osc.connect(env);
  env.connect(master as GainNode);
  osc.start(start);
  osc.stop(start + 0.06);
  return osc;
}
