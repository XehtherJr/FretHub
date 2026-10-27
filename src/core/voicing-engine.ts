/**
 * voicing-engine.ts — algorithmic guitar chord voicing generator.
 *
 * Given a set of chord-tone pitch classes, a tuning (any number of strings),
 * a fret window and playability constraints, the engine enumerates every
 * plausible fingering via depth-first search with aggressive pruning, then
 * validates and ranks the results.
 *
 * The engine has no DOM or React dependency and is fully unit-tested.
 */

import { normalizePc, fretToMidi } from './notes';
import { Tuning } from './tunings';

export type Finger = 0 | 1 | 2 | 3 | 4 | 'x';

export interface BarreInfo {
  fret: number;
  /** Low-to-high string indices covered by the barre. */
  stringFrom: number;
  stringTo: number;
}

export interface Voicing {
  /** Per-string fret, low-to-high. `null` means the string is muted. */
  frets: (number | null)[];
  /** Per-string fingering: 0 = open, 'x' = muted, 1..4 = fretting fingers. */
  fingers: Finger[];
  barre?: BarreInfo;
  /** Sounding MIDI notes per string (null when muted). */
  midi: (number | null)[];
  /** Sounding pitch classes low-to-high. */
  pitchClasses: number[];
  bassPc: number | null;
  /** Lowest actually-fretted fret (ignoring open strings); 0 when all open. */
  position: number;
  /** Fret span between the lowest and highest fretted notes. */
  span: number;
  fingerCount: number;
  hasOpen: boolean;
  mutedCount: number;
  score: number;
  playability: 'beginner' | 'intermediate' | 'advanced';
}

export interface VoicingOptions {
  minFret?: number;
  maxFret?: number;
  /** Maximum distance between lowest and highest fretted notes. */
  maxSpan?: number;
  maxMuted?: number;
  allowOpen?: boolean;
  /** Pitch class of the lowest sounding note (slash chords / inversions). */
  requiredBass?: number;
  /** Additional interval symbols allowed to be omitted beyond the type's defaults. */
  allowedOmissions?: number[];
  maxResults?: number;
  allowBarre?: boolean;
  /** Hard safety cap on DFS nodes to guarantee fast responses. */
  nodeBudget?: number;
}

const DEFAULTS: Required<Omit<VoicingOptions, 'requiredBass' | 'allowedOmissions'>> = {
  minFret: 0,
  maxFret: 14,
  maxSpan: 4,
  maxMuted: 2,
  allowOpen: true,
  maxResults: 24,
  allowBarre: true,
  nodeBudget: 250_000,
};

/** Pitch class produced by playing `fret` on a given open string. */
export function fretPc(tuning: Tuning, stringIndex: number, fret: number): number {
  const s = tuning.strings[stringIndex];
  return normalizePc(s.pc + fret);
}

/** Candidate frets on one string that produce a member of `toneSet`. */
function candidateFrets(
  tuning: Tuning,
  stringIndex: number,
  toneSet: Set<number>,
  minFret: number,
  maxFret: number,
  allowOpen: boolean,
): number[] {
  const open = tuning.strings[stringIndex].pc;
  const frets: number[] = [];
  for (const tone of toneSet) {
    const first = normalizePc(tone - open); // 0..11
    for (let f = first; f <= maxFret; f += 12) {
      if (f < minFret) continue;
      if (f === 0 && !allowOpen) continue;
      frets.push(f);
    }
  }
  return [...new Set(frets)].sort((a, b) => a - b);
}

interface FingeringResult {
  fingers: Finger[];
  barre?: BarreInfo;
  fingerCount: number;
}

/**
 * Assign fingers conservatively: individual fretted notes need individual
 * fingers unless the index finger can barre the lowest fret across them.
 * This is a playability heuristic, not a substitute for a player's fingering.
 */
export function assignFingering(
  frets: (number | null)[],
  allowBarre: boolean,
): FingeringResult | null {
  const fingers: Finger[] = frets.map((fret) => fret === null ? 'x' : 0);
  const fretted = frets.map((fret, i) => ({ fret, i }))
    .filter((entry): entry is { fret: number; i: number } => entry.fret !== null && entry.fret > 0);
  if (!fretted.length) return { fingers, fingerCount: 0 };

  const lowest = Math.min(...fretted.map((entry) => entry.fret));
  const lowestIndices = fretted.filter((entry) => entry.fret === lowest).map((entry) => entry.i);
  let barre: BarreInfo | undefined;
  let coveredCount = 0;
  if (allowBarre) {
    for (let a = 0; a < lowestIndices.length; a++) for (let b = a + 1; b < lowestIndices.length; b++) {
      const from = lowestIndices[a];
      const to = lowestIndices[b];
      // Conservatively avoid a barre across an open or muted string. Higher
      // fretted notes between endpoints are fine (as in a standard F shape).
      if (!frets.slice(from, to + 1).every((fret) => fret !== null && fret >= lowest)) continue;
      const covered = lowestIndices.filter((index) => index >= from && index <= to).length;
      if (covered > coveredCount) { barre = { fret: lowest, stringFrom: from, stringTo: to }; coveredCount = covered; }
    }
  }

  const remaining = fretted.filter(({ fret, i }) => !(barre && fret === barre.fret && i >= barre.stringFrom && i <= barre.stringTo));
  const fingerCount = remaining.length + (barre ? 1 : 0);
  if (fingerCount > 4) return null;
  if (barre) for (let i = barre.stringFrom; i <= barre.stringTo; i++) if (frets[i] === barre.fret) fingers[i] = 1;
  remaining.sort((a, b) => a.fret - b.fret || a.i - b.i).forEach((entry, index) => {
    fingers[entry.i] = (index + (barre ? 2 : 1)) as Finger;
  });
  return { fingers, barre, fingerCount };
}

function scoreVoicing(v: Omit<Voicing, 'score' | 'playability'>, rootPc: number): number {
  let score = 0;
  score += v.span * 2.0;
  score += v.mutedCount * 1.8;
  score += v.fingerCount * 0.5;
  if (v.barre) score += 1.0;
  score += v.position * 0.3;
  const openCount = v.frets.filter((f) => f === 0).length;
  score -= Math.min(openCount, 3) * 0.5;
  const highest = Math.max(...v.frets.filter((f): f is number => f !== null).map((f) => f));
  score += highest * 0.05;
  // Root-position voicings are the canonical reference; inversions rank later
  // unless the caller explicitly requested a bass note.
  if (v.bassPc === rootPc) score -= 1.8;
  else score += 2.2;
  return Math.round(score * 100) / 100;
}

function playability(v: { barre?: BarreInfo; span: number; fingerCount: number; position: number }): Voicing['playability'] {
  if (!v.barre && v.span <= 3 && v.fingerCount <= 3) return 'beginner';
  if ((v.barre && v.position >= 5) || v.span >= 4 || v.fingerCount >= 4) return 'advanced';
  return 'intermediate';
}

/**
 * Generate voicings for a chord tone set on a given tuning.
 *
 * @param chordPcs  distinct pitch classes that define the chord
 * @param tuning    instrument tuning (6, 7 or 8 strings supported)
 * @param rootPc    chord root, used for ranking root-position voicings first
 * @param options   fret window and playability constraints
 */
export function generateVoicings(
  chordPcs: number[],
  tuning: Tuning,
  rootPc: number = chordPcs[0],
  options: VoicingOptions = {},
): Voicing[] {
  const opts = { ...DEFAULTS, ...options };
  const toneSet = new Set(chordPcs.map(normalizePc));
  const omissions = new Set((options.allowedOmissions ?? []).map(normalizePc));
  const stringCount = tuning.strings.length;

  // Which tones are legally allowed to be missing at a leaf?
  const canOmit = (pc: number) => omissions.has(pc);

  const perStringCandidates: number[][] = tuning.strings.map((_, i) => {
    const frets = candidateFrets(
      tuning, i, toneSet, opts.minFret, opts.maxFret, opts.allowOpen,
    );
    // Keep the search tractable: nearest candidates plus a muted option.
    const trimmed = frets.slice(0, 5);
    return [-1, ...trimmed]; // -1 sentinel = muted
  });

  const results: Voicing[] = [];
  const seen = new Set<string>();
  let nodes = 0;
  let budgetExceeded = false;

  const current: (number | null)[] = new Array(stringCount).fill(null);
  const covered = new Set<number>();
  let mutedCount = 0;
  let minFretted = Infinity;
  let maxFretted = -Infinity;
  let bassPc: number | null = null;
  let bassMidi = Infinity;
  // Safe pruning for bass constraints: a later string may sound lower than an
  // earlier one, especially with high frets or re-entrant tunings.
  const minimumRemainingMidi = new Array<number>(stringCount + 1).fill(Infinity);
  for (let i = stringCount - 1; i >= 0; i--) {
    const string = tuning.strings[i];
    const lowest = Math.min(...perStringCandidates[i].filter((fret) => fret >= 0).map((fret) => fretToMidi(string.pc, string.octave, fret)), Infinity);
    minimumRemainingMidi[i] = Math.min(lowest, minimumRemainingMidi[i + 1]);
  }

  function dfs(index: number): void {
    if (budgetExceeded) return;
    if (++nodes > opts.nodeBudget) {
      budgetExceeded = true;
      return;
    }
    if (index === stringCount) {
      evaluate();
      return;
    }
    for (const candidate of perStringCandidates[index]) {
      const isMuted = candidate === -1;
      const fret = isMuted ? null : candidate;

      // --- pruning -------------------------------------------------------
      if (isMuted) {
        if (mutedCount + 1 > opts.maxMuted) continue;
      } else if (candidate !== 0) {
        const newMin = Math.min(minFretted, candidate);
        const newMax = Math.max(maxFretted, candidate);
        if (newMax - newMin > opts.maxSpan) continue;
      }

      // Can the remaining strings possibly cover every still-missing tone?
      const missing = [...toneSet].filter((pc) => !covered.has(pc));
      const stringsLeft = stringCount - index - 1;
      const hardMissing = missing.filter((pc) => !canOmit(pc));
      if (hardMissing.length > stringsLeft + (isMuted ? 0 : 1)) continue;

      // --- apply ----------------------------------------------------------
      current[index] = fret;
      let pc: number | null = null;
      const previousBassPc = bassPc;
      const previousBassMidi = bassMidi;
      if (isMuted) {
        mutedCount++;
      } else {
        pc = fretPc(tuning, index, fret as number);
        covered.add(pc);
        const string = tuning.strings[index];
        const midi = fretToMidi(string.pc, string.octave, fret as number);
        if (midi < bassMidi) { bassMidi = midi; bassPc = pc; }
        if (candidate !== 0) {
          minFretted = Math.min(minFretted, candidate);
          maxFretted = Math.max(maxFretted, candidate);
        }
      }

      // If the bass is wrong and no remaining string can sound below it,
      // nothing further down this branch can satisfy the requested inversion.
      if (opts.requiredBass === undefined || bassPc === null || bassPc === normalizePc(opts.requiredBass) || minimumRemainingMidi[index + 1] < bassMidi) dfs(index + 1);

      // --- undo -----------------------------------------------------------
      bassPc = previousBassPc;
      bassMidi = previousBassMidi;
      if (isMuted) {
        mutedCount--;
      } else {
        current[index] = null;
        // Remove the pc only if no other selected string still produces it.
        const stillCovered = current.some(
          (f, i) => i < index && f !== null && fretPc(tuning, i, f) === pc,
        );
        if (!stillCovered) covered.delete(pc as number);
        if (candidate !== 0) {
          const frettedFrets = current.filter((f): f is number => f !== null && f > 0);
          minFretted = frettedFrets.length ? Math.min(...frettedFrets) : Infinity;
          maxFretted = frettedFrets.length ? Math.max(...frettedFrets) : -Infinity;
        }
      }
      current[index] = null;
    }
  }

  function evaluate(): void {
    const sounding = current.filter((f): f is number => f !== null);
    if (sounding.length < 2) return;

    // All non-omittable tones must be present; nothing outside the chord allowed.
    for (const pc of toneSet) {
      if (!covered.has(pc) && !canOmit(pc)) return;
    }
    if (opts.requiredBass !== undefined && bassPc !== normalizePc(opts.requiredBass)) return;

    const fingering = assignFingering(current, opts.allowBarre);
    if (!fingering) return;

    const frettedFrets = sounding.filter((f) => f > 0);
    const position = frettedFrets.length ? Math.min(...frettedFrets) : 0;
    const span = frettedFrets.length ? Math.max(...frettedFrets) - Math.min(...frettedFrets) : 0;

    const key = current.map((f) => (f === null ? 'x' : String(f))).join('|');
    if (seen.has(key)) return;
    seen.add(key);

    const midi = current.map((f, i) =>
      f === null ? null : fretToMidi(tuning.strings[i].pc, tuning.strings[i].octave, f),
    );
    const pitchClasses = current.map((f, i) =>
      f === null ? null : fretPc(tuning, i, f),
    );

    const partial = {
      frets: [...current],
      fingers: fingering.fingers,
      barre: fingering.barre,
      midi,
      pitchClasses: pitchClasses.filter((pc): pc is number => pc !== null),
      bassPc,
      position,
      span,
      fingerCount: fingering.fingerCount,
      hasOpen: sounding.some((f) => f === 0),
      mutedCount: current.filter((f) => f === null).length,
    };

    results.push({
      ...partial,
      score: scoreVoicing(partial, rootPc),
      playability: playability(partial),
    });
  }

  dfs(0);

  results.sort((a, b) => a.score - b.score || a.span - b.span || a.position - b.position);
  return results.slice(0, opts.maxResults);
}
