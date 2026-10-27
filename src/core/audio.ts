/**
 * audio.ts — licensing-free guitar-tone synthesis with the Web Audio API.
 * No samples, no external services: each note is a plucked-string-style
 * voice built from oscillators, a low-pass filter and an exponential envelope.
 */

import { midiToFreq } from './notes';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** Lazily create the AudioContext (browsers require a user gesture). */
export function getAudioContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('Audio is only available in the browser.');
  }
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isAudioSupported(): boolean {
  return typeof window !== 'undefined' &&
    (!!window.AudioContext || !!(window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

interface PluckOptions {
  when?: number;
  duration?: number;
  velocity?: number;
}

/** Play a single MIDI note using a two-oscillator plucked-string model. */
export function playMidi(midi: number, options: PluckOptions = {}): void {
  const audio = getAudioContext();
  const when = options.when ?? audio.currentTime;
  const duration = options.duration ?? 1.6;
  const velocity = options.velocity ?? 0.9;

  const freq = midiToFreq(midi);

  const osc1 = audio.createOscillator();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, when);

  const osc2 = audio.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.setValueAtTime(freq, when);
  osc2.detune.setValueAtTime(-6, when);

  const osc2Gain = audio.createGain();
  osc2Gain.gain.value = 0.18;

  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(freq * 8, 6500), when);
  filter.Q.value = 0.8;

  const env = audio.createGain();
  const peak = 0.22 * velocity;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  osc1.connect(filter);
  osc2.connect(osc2Gain);
  osc2Gain.connect(filter);
  filter.connect(env);
  env.connect(master as GainNode);

  osc1.start(when);
  osc2.start(when);
  osc1.stop(when + duration + 0.05);
  osc2.stop(when + duration + 0.05);
}

/**
 * Strum a voicing. MIDI array is low-to-high; `null` means a muted string.
 * Low strings sound first when `direction` is 'up' (a real up-stroke goes
 * high-to-low — naming follows musical pitch direction by default).
 */
export function strum(
  midiNotes: (number | null)[],
  direction: 'down' | 'up' = 'down',
  gap = 0.035,
): void {
  const audio = getAudioContext();
  const notes = midiNotes.filter((n): n is number => n !== null);
  const ordered = direction === 'down' ? notes : [...notes].reverse();
  ordered.forEach((midi, i) => {
    playMidi(midi, { when: audio.currentTime + i * gap, duration: 2.2, velocity: 0.85 });
  });
}

/** Short click used by the metronome. `accent` adds a brighter, louder hit. */
export function playClick(accent = false): void {
  const audio = getAudioContext();
  const when = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(accent ? 1500 : 950, when);

  const env = audio.createGain();
  env.gain.setValueAtTime(accent ? 0.25 : 0.14, when);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);

  osc.connect(env);
  env.connect(master as GainNode);
  osc.start(when);
  osc.stop(when + 0.08);
}
