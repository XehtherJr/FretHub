/** User-created progressions keep the actual physical fingering, not a guessed chord formula. */
import { fretToMidi, normalizePc } from './notes';
import { TUNINGS, getTuning, applyCapo } from './tunings';
import { assignFingering, generateVoicings } from './voicing-engine';
import { buildChord, chordVoicingConstraints } from './chords';

export const DIFFICULTY_LEVELS = ['beginner', 'novice', 'intermediate', 'advanced'] as const;
export type ProgressionDifficulty = typeof DIFFICULTY_LEVELS[number];
export type DifficultyMode = 'auto' | 'manual';

export interface ProgressionStep {
  id: string;
  name: string;
  /** Physical frets in low-to-high string order; 0 means open at the capo, null muted. */
  frets: (number | null)[];
  /** Number of quarter-note beats to hold the chord. */
  beats: number;
}

export interface SavedProgression {
  id: string;
  name: string;
  tuningId: string;
  capo: number;
  bpm: number;
  loop: boolean;
  difficulty: ProgressionDifficulty;
  difficultyMode: DifficultyMode;
  chords: ProgressionStep[];
}

/** IDs distinguish repeated chords and independent offline edits; they are not credentials. */
export function progressionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Sound exactly the stored fingering in its original tuning and capo. */
export function progressionMidi(frets: (number | null)[], tuningId: string, capo: number): (number | null)[] {
  const tuning = getTuning(tuningId);
  return tuning.strings.map((string, index) => {
    const fret = frets[index];
    return fret == null ? null : fretToMidi(string.pc, string.octave, fret === 0 ? capo : fret);
  });
}

/** A generated starting shape can be edited on the physical neck before adding it. */
export function referenceShape(root: string, typeId: string, tuningId: string, capo: number, bass?: string): { frets: (number | null)[]; name: string } | null {
  const chord = buildChord(root, typeId, bass);
  const tuning = getTuning(tuningId);
  const capoTuning = applyCapo(tuning, capo);
  const constraints = chordVoicingConstraints(chord);
  const options = {
    ...constraints,
    requiredBass: bass ? chord.bassPc : undefined,
    maxFret: Math.min(14, 24 - capo),
    maxMuted: constraints.requiredVoicing ? Math.max(2, tuning.strings.length - constraints.requiredVoicing.length) : 2,
    maxResults: 1,
  };
  const tones = bass && !chord.pitchClasses.includes(chord.bassPc) ? [...chord.pitchClasses, chord.bassPc] : chord.pitchClasses;
  const complete = generateVoicings(tones, capoTuning, chord.rootPc, { ...options, allowedOmissions: [] });
  const [voicing] = complete.length ? complete : generateVoicings(tones, capoTuning, chord.rootPc, options);
  if (!voicing) return null;
  return {
    frets: voicing.frets.map((fret) => fret === null || fret === 0 ? fret : fret + capo),
    name: buildChord(root, typeId, voicing.bassPc ?? undefined).shortName,
  };
}

/**
 * A practical starting estimate, not a judgement of the player. It considers
 * physical span, likely barre/finger count, position, changes and tempo. A
 * player may override it; musical context and individual hands are not measured.
 */
export function estimateProgressionDifficulty(chords: ProgressionStep[], capo: number, bpm: number): { level: ProgressionDifficulty; reasons: string[] } {
  let score = 0;
  const reasons = new Set<string>();
  for (const chord of chords) {
    const relative = chord.frets.map((fret) => fret === null || fret === 0 ? fret : fret - capo);
    const fretted = relative.filter((fret): fret is number => fret !== null && fret > 0);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const highest = fretted.length ? Math.max(...fretted) : 0;
    const fingering = assignFingering(relative, true);
    if (!fingering || span > 4) { score = Math.max(score, 3); reasons.add('wide or unusual fingering'); }
    else if (span === 4 || highest > 8) { score = Math.max(score, 3); reasons.add('large stretch or high position'); }
    else if (fingering.barre || span === 3 || highest > 5) { score = Math.max(score, 2); reasons.add('barre, stretch or higher position'); }
    else if (fingering.fingerCount >= 4 || highest > 3) { score = Math.max(score, 1); reasons.add('four-finger or higher-fret shape'); }
  }
  for (let index = 1; index < chords.length; index++) {
    const previous = chords[index - 1];
    const position = (chord: ProgressionStep) => {
      const fretted = chord.frets.filter((fret): fret is number => fret !== null && fret > 0);
      return fretted.length ? Math.min(...fretted) - capo : 0;
    };
    const movement = Math.abs(position(chords[index]) - position(previous));
    if (movement >= 6) { score = Math.max(score, 2); reasons.add('large position changes'); }
    else if (movement >= 3) { score = Math.max(score, 1); reasons.add('position changes'); }
    if (previous.beats * 60 / bpm < 1) { score = Math.max(score, 2); reasons.add('quick chord changes'); }
  }
  if (bpm > 160) { score = Math.max(score, 3); reasons.add('fast tempo'); }
  else if (bpm > 135) { score = Math.max(score, 2); reasons.add('brisk tempo'); }
  else if (bpm > 110) { score = Math.max(score, 1); reasons.add('moderate tempo'); }
  if (!reasons.size) reasons.add('compact shapes and a moderate tempo');
  return { level: DIFFICULTY_LEVELS[score], reasons: [...reasons] };
}

/** Reject malformed local/cloud data before it can affect the fretboard or audio. */
export function validProgression(value: unknown, expectedId?: string): value is SavedProgression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SavedProgression>;
  if (typeof item.id !== 'string' || !item.id || item.id.length > 180 || (expectedId && item.id !== expectedId)) return false;
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) return false;
  if (typeof item.tuningId !== 'string' || !TUNINGS.some((tuning) => tuning.id === item.tuningId)) return false;
  if (!Number.isInteger(item.capo) || item.capo! < 0 || item.capo! > 7) return false;
  if (!Number.isInteger(item.bpm) || item.bpm! < 40 || item.bpm! > 240 || typeof item.loop !== 'boolean') return false;
  if (!DIFFICULTY_LEVELS.includes(item.difficulty as ProgressionDifficulty) || (item.difficultyMode !== 'auto' && item.difficultyMode !== 'manual')) return false;
  if (!Array.isArray(item.chords) || item.chords.length === 0) return false;
  const tuning = getTuning(item.tuningId);
  const ids = new Set<string>();
  return item.chords.every((chord) => {
    if (!chord || typeof chord.id !== 'string' || !chord.id || chord.id.length > 180 || ids.has(chord.id)) return false;
    ids.add(chord.id);
    if (typeof chord.name !== 'string' || !chord.name.trim() || chord.name.length > 100) return false;
    if (!Number.isInteger(chord.beats) || chord.beats < 1 || chord.beats > 16) return false;
    if (!Array.isArray(chord.frets) || chord.frets.length !== tuning.strings.length) return false;
    if (!chord.frets.every((fret) => fret === null || (Number.isInteger(fret) && fret >= 0 && fret <= 24 && (fret === 0 || fret > item.capo!)))) return false;
    const pcs = new Set(progressionMidi(chord.frets, item.tuningId!, item.capo!).filter((midi): midi is number => midi !== null).map(normalizePc));
    return pcs.size >= 2;
  });
}
