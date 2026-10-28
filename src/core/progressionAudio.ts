import { getAudioContext, prepareStrummer } from './audio';
import { validPlaybackPattern, type PatternStep, type PlaybackPattern } from './pickingPattern';

export interface PlaybackChord { midi: (number | null)[]; beats: number }
export interface ProgressionPlayback { stop: () => void }

/**
 * Schedule chord boundaries and optional picking/strumming steps against the
 * audio clock. A pattern repeats and restarts at each chord boundary. A short
 * lookahead permits looping without scheduling an infinite buffer. Stop also
 * cancels sample loads, scheduled sources and visual callbacks.
 */
export function startProgressionPlayback(
  chords: PlaybackChord[], bpm: number, loop: boolean,
  callbacks: { onChord: (index: number) => void; onEnd: () => void; onError: () => void },
  pattern?: PlaybackPattern,
): ProgressionPlayback {
  if (!chords.length || !Number.isFinite(bpm) || bpm < 40 || bpm > 240 || chords.some((chord) => !Number.isInteger(chord.beats) || chord.beats < 1 || chord.beats > 16)) {
    throw new Error('A progression, 40–240 BPM, and 1–16 beats per chord are required.');
  }
  if (pattern && chords.some((chord) => !validPlaybackPattern(pattern, chord.midi.length))) {
    throw new Error('The picking pattern is invalid for this instrument.');
  }
  const audio = getAudioContext(); // Must happen during the user's play gesture.
  const secondsPerBeat = 60 / bpm;
  const stepDuration = pattern ? secondsPerBeat / pattern.stepsPerBeat : 0;
  let stopped = false;
  let finishedScheduling = false;
  let interval: number | null = null;
  let nextTime = 0;
  let chordEnd = 0;
  let nextIndex = 0;
  let stepIndex = 0;
  const timers = new Set<number>();
  const sources = new Set<AudioScheduledSourceNode>();

  const at = (time: number, action: () => void) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!stopped) action();
    }, Math.max(0, (time - audio.currentTime) * 1000));
    timers.add(id);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (interval !== null) window.clearInterval(interval);
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    sources.clear();
  };

  const midis = chords.flatMap((chord) => chord.midi.filter((midi): midi is number => midi !== null));
  void prepareStrummer(audio, midis).then((scheduleStrum) => {
    if (stopped) return;
    nextTime = audio.currentTime + 0.05;
    chordEnd = nextTime + chords[0].beats * secondsPerBeat;
    const tick = () => {
      try {
        // If a background tab was throttled, slide the remaining timeline
        // forward rather than firing all missed steps at the same instant.
        if (nextTime < audio.currentTime - 0.15) {
          const shift = audio.currentTime + 0.05 - nextTime;
          nextTime += shift;
          chordEnd += shift;
        }
        while (!stopped && !finishedScheduling && nextTime < audio.currentTime + 0.16) {
          const index = nextIndex;
          const chord = chords[index];
          if (stepIndex === 0) at(nextTime, () => callbacks.onChord(index));
          const remaining = chordEnd - nextTime;
          let created: AudioScheduledSourceNode[] = [];
          if (!pattern) {
            // Preserve the original one-downstroke behavior for old saves.
            created = scheduleStrum(chord.midi, nextTime, Math.min(2.8, chord.beats * secondsPerBeat * 0.95));
            nextTime = chordEnd;
          } else {
            const soundingIndices = chord.midi.flatMap((midi, stringIndex) => midi === null ? [] : [stringIndex]);
            const step: PatternStep = pattern.mode === 'custom' ? pattern.steps[stepIndex % pattern.steps.length]
              : soundingIndices.length ? { kind: 'pick', strings: [soundingIndices[stepIndex % soundingIndices.length]] } : { kind: 'rest' };
            const notes = step.kind === 'pick' ? step.strings.map((stringIndex) => chord.midi[stringIndex]) : chord.midi;
            const count = notes.filter((midi) => midi !== null).length;
            if (step.kind !== 'rest' && count > 0) {
              // Picked strings start simultaneously; a strum has a brief,
              // bounded sweep that cannot run into the next pattern step.
              const gap = step.kind === 'pick' || count < 2 ? 0 : Math.min(0.035, Math.min(stepDuration, remaining) * 0.8 / (count - 1));
              const duration = Math.max(0.05, Math.min(2.8, remaining - gap * (count - 1)));
              created = scheduleStrum(notes, nextTime, duration, { direction: step.kind === 'up' ? 'up' : 'down', gap });
            }
            nextTime += stepDuration;
            stepIndex++;
          }
          created.forEach((source) => { sources.add(source); source.onended = () => sources.delete(source); });
          if (nextTime >= chordEnd - 1e-9) {
            nextTime = chordEnd;
            nextIndex++;
            stepIndex = 0;
            if (nextIndex === chords.length) {
              if (loop) nextIndex = 0;
              else {
                finishedScheduling = true;
                if (interval !== null) { window.clearInterval(interval); interval = null; }
                at(nextTime, () => { stop(); callbacks.onEnd(); });
              }
            }
            if (!finishedScheduling) chordEnd = nextTime + chords[nextIndex].beats * secondsPerBeat;
          }
        }
      } catch {
        if (!stopped) { stop(); callbacks.onError(); }
      }
    };
    tick();
    if (!finishedScheduling && !stopped) interval = window.setInterval(tick, 25);
  }).catch(() => { if (!stopped) { stop(); callbacks.onError(); } });

  return { stop };
}
