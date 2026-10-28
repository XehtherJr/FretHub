import { getAudioContext, prepareStrummer } from './audio';

export interface PlaybackChord { midi: (number | null)[]; beats: number }
export interface ProgressionPlayback { stop: () => void }

/**
 * Schedule a downstroke at each chord boundary using the audio clock. A short
 * lookahead permits looping without scheduling an infinite buffer. Stop also
 * cancels pending sample loads, scheduled sources and visual callbacks.
 */
export function startProgressionPlayback(
  chords: PlaybackChord[], bpm: number, loop: boolean,
  callbacks: { onChord: (index: number) => void; onEnd: () => void; onError: () => void },
): ProgressionPlayback {
  if (!chords.length || !Number.isFinite(bpm) || bpm < 40 || bpm > 240 || chords.some((chord) => !Number.isInteger(chord.beats) || chord.beats < 1 || chord.beats > 16)) {
    throw new Error('A progression, 40–240 BPM, and 1–16 beats per chord are required.');
  }
  const audio = getAudioContext(); // Must happen during the user's play gesture.
  const secondsPerBeat = 60 / bpm;
  let stopped = false;
  let finishedScheduling = false;
  let interval: number | null = null;
  let nextTime = 0;
  let nextIndex = 0;
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
    const tick = () => {
      try {
        // If a background tab was throttled, resume with the next chord instead
        // of firing every missed chord simultaneously at the current audio time.
        if (nextTime < audio.currentTime - 0.15) nextTime = audio.currentTime + 0.05;
        while (!stopped && !finishedScheduling && nextTime < audio.currentTime + 0.16) {
          const index = nextIndex;
          const chord = chords[index];
          const hold = Math.max(1, chord.beats) * secondsPerBeat;
          const created = scheduleStrum(chord.midi, nextTime, Math.min(2.8, hold * 0.95));
          created.forEach((source) => { sources.add(source); source.onended = () => sources.delete(source); });
          at(nextTime, () => callbacks.onChord(index));
          nextTime += hold;
          nextIndex++;
          if (nextIndex === chords.length) {
            if (loop) nextIndex = 0;
            else {
              finishedScheduling = true;
              if (interval !== null) { window.clearInterval(interval); interval = null; }
              at(nextTime, () => { stop(); callbacks.onEnd(); });
            }
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
