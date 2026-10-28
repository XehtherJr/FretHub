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
  // Keep all sources for immediate cancellation, and separately remember each
  // note's latest scheduled end so rests cannot postpone an earlier stop.
  const ringing = new Map<AudioScheduledSourceNode, number>();
  const track = (created: AudioScheduledSourceNode[], when: number, duration: number, gap: number) => {
    created.forEach((source, index) => {
      sources.add(source);
      ringing.set(source, Math.max(audio.currentTime, when + index * gap) + duration);
      source.onended = () => { sources.delete(source); ringing.delete(source); };
    });
  };

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
    if (typeof audio.removeEventListener === 'function') audio.removeEventListener('statechange', onAudioStateChange);
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    sources.clear();
    ringing.clear();
  };
  function onAudioStateChange() {
    if (!stopped && audio.state !== 'running') { stop(); callbacks.onError(); }
  }

  const midis = chords.flatMap((chord) => chord.midi.filter((midi): midi is number => midi !== null));
  const waitForAudio = (): Promise<void> => {
    if (audio.state === 'running') return Promise.resolve();
    if (audio.state === 'closed') return Promise.reject(new Error('Audio context is closed.'));
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(new Error('Audio could not resume.')), 5000);
      timers.add(timeout);
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout); timers.delete(timeout);
        if (error) reject(error); else resolve();
      };
      const fail = (error: unknown) => finish(error instanceof Error ? error : new Error('Audio could not resume.'));
      // Call resume in the original play gesture. Some browsers reject it or
      // leave it pending; neither should leave the UI playing forever.
      try {
        void audio.resume().then(() => finish(audio.state === 'running' ? undefined : new Error('Audio is still suspended.')), fail);
      } catch (error) { fail(error); }
    });
  };
  const preparing = audio.state === 'running'
    ? prepareStrummer(audio, midis)
    : waitForAudio().then(() => stopped ? null : prepareStrummer(audio, midis));
  void preparing.then((scheduleStrum) => {
    if (stopped || !scheduleStrum) return;
    if (typeof audio.addEventListener === 'function') audio.addEventListener('statechange', onAudioStateChange);
    nextTime = audio.currentTime + 0.05;
    chordEnd = nextTime + chords[0].beats * secondsPerBeat;
    const tick = () => {
      try {
        if (audio.state !== 'running') throw new Error('Audio was interrupted.');
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
          if (!pattern) {
            // Preserve one downstroke for old saves, but account for the
            // sweep so its last string finishes before the next chord.
            const count = chord.midi.filter((midi) => midi !== null).length;
            const strumWindow = chord.beats * secondsPerBeat * 0.95;
            const gap = count < 2 ? 0 : Math.min(0.035, strumWindow * 0.8 / (count - 1));
            const duration = Math.max(0.005, Math.min(2.8, strumWindow - gap * (count - 1)));
            track(scheduleStrum(chord.midi, nextTime, duration, { direction: 'down', gap }), nextTime, duration, gap);
            nextTime = chordEnd;
          } else {
            const soundingIndices = chord.midi.flatMap((midi, stringIndex) => midi === null ? [] : [stringIndex]);
            const step: PatternStep = pattern.mode === 'custom' ? pattern.steps[stepIndex % pattern.steps.length]
              : soundingIndices.length ? { kind: 'pick', strings: [soundingIndices[stepIndex % soundingIndices.length]] } : { kind: 'rest' };
            const notes = step.kind === 'pick' ? step.strings.map((stringIndex) => chord.midi[stringIndex]) : chord.midi;
            const count = notes.filter((midi) => midi !== null).length;
            if (step.kind === 'rest') {
              ringing.forEach((end, source) => {
                if (nextTime < end) { try { source.stop(nextTime); } catch { /* Already ended. */ } }
              });
              ringing.clear();
            } else if (count > 0) {
              // Picked strings start simultaneously; a strum has a brief,
              // bounded sweep that cannot run into the next pattern step.
              const gap = step.kind === 'pick' || count < 2 ? 0 : Math.min(0.035, Math.min(stepDuration, remaining) * 0.8 / (count - 1));
              // Leave room for the last note in the sweep, even for very
              // short subdivisions; otherwise it rings into the next chord.
              const duration = Math.max(0.005, Math.min(2.8, remaining - gap * (count - 1)));
              track(scheduleStrum(notes, nextTime, duration, { direction: step.kind === 'up' ? 'up' : 'down', gap }), nextTime, duration, gap);
            }
            nextTime += stepDuration;
            stepIndex++;
          }
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
