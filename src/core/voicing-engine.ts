/**
 * voicing-engine.ts — algorithmic guitar chord voicing generator.
 *
 * Given a set of chord-tone pitch classes, a tuning (any number of strings),
 * a fret window and playability constraints, the engine searches candidate
 * shapes with pruning, then validates and ranks them. A node budget can stop
 * the search early; fingering and comfort are necessarily heuristic.
 *
 * The engine has no DOM or React dependency and is fully unit-tested.
 */

import { normalizePc, fretToMidi } from './notes';
import { Tuning } from './tunings';
import { matchesVoicingPattern } from './voicingPattern';

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
  /** First barre, retained for callers that only need to know whether one exists. */
  barre?: BarreInfo;
  /** All barres when more than one is suggested. */
  barres?: BarreInfo[];
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
  /** Uncalibrated ranking proxy; lower is preferred, not a measured difficulty. */
  score: number;
  playability: 'beginner' | 'intermediate' | 'advanced';
}

export interface VoicingOptions {
  /** Lowest allowed fretted note; open strings remain possible when allowOpen is true. */
  minFret?: number;
  maxFret?: number;
  /** Maximum distance between lowest and highest fretted notes. */
  maxSpan?: number;
  maxMuted?: number;
  allowOpen?: boolean;
  /** Pitch class of the lowest sounding note (slash chords / inversions). */
  requiredBass?: number;
  /** Chord-tone pitch classes allowed to be omitted. */
  allowedOmissions?: number[];
  /** At least one of these pitch classes must sound when supplied. */
  requiredOneOf?: number[];
  /** Exact ascending semitone offsets from the lowest/root note, for a specific voicing. */
  requiredVoicing?: number[];
  maxResults?: number;
  allowBarre?: boolean;
  /** Hard cap on DFS nodes; elapsed time also depends on the device and results. */
  nodeBudget?: number;
  /** Order results before applying maxResults. */
  sortBy?: 'score' | 'position';
}

export interface VoicingSearchResult {
  voicings: Voicing[];
  /** Number found before applying the result limit (a lower bound if searchTruncated). */
  totalFound: number;
  searchTruncated: boolean;
  resultLimitReached: boolean;
}

const DEFAULTS: Required<Omit<VoicingOptions, 'requiredBass' | 'allowedOmissions' | 'requiredOneOf' | 'requiredVoicing'>> = {
  minFret: 0,
  maxFret: 14,
  maxSpan: 4,
  maxMuted: 2,
  allowOpen: true,
  maxResults: 24,
  allowBarre: true,
  nodeBudget: 250_000,
  sortBy: 'score',
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
      if (f === 0 ? !allowOpen : f < minFret) continue;
      frets.push(f);
    }
  }
  return [...new Set(frets)].sort((a, b) => a - b);
}

interface FingeringResult {
  fingers: Finger[];
  barre?: BarreInfo;
  barres?: BarreInfo[];
  fingerCount: number;
}

interface BarreCandidate extends BarreInfo { indices: number[] }
interface FingerGroup { fret: number; indices: number[] }

/**
 * Suggest a structurally consistent fingering, not a biomechanical guarantee.
 * Prefer separate fingers when they fit, then one barre, then two barres.
 * An earlier-fret barre is preferred when several one-barre solutions fit;
 * a higher partial barre can also coexist with lower fretted notes.
 * See docs/voicing-heuristics.md for evidence and limits of these preferences.
 */
export function assignFingering(
  frets: (number | null)[],
  allowBarre: boolean,
): FingeringResult | null {
  const fretted = frets.map((fret, i) => ({ fret, i }))
    .filter((entry): entry is { fret: number; i: number } => entry.fret !== null && entry.fret > 0);

  const makeResult = (barres: BarreCandidate[]): FingeringResult | null => {
    const assigned = new Set<number>();
    const groups: FingerGroup[] = [];
    for (const barre of barres) {
      if (barre.indices.some((index) => assigned.has(index))) return null;
      barre.indices.forEach((index) => assigned.add(index));
      groups.push({ fret: barre.fret, indices: barre.indices });
    }
    for (const entry of fretted) if (!assigned.has(entry.i)) groups.push({ fret: entry.fret, indices: [entry.i] });
    if (groups.length > 4) return null;
    const fingers: Finger[] = frets.map((fret) => fret === null ? 'x' : 0);
    groups.sort((a, b) => a.fret - b.fret || a.indices[0] - b.indices[0]).forEach((group, index) => {
      for (const stringIndex of group.indices) fingers[stringIndex] = (index + 1) as Finger;
    });
    const cleanBarres = barres.map(({ fret, stringFrom, stringTo }) => ({ fret, stringFrom, stringTo }));
    return {
      fingers,
      ...(cleanBarres.length ? { barre: cleanBarres[0] } : {}),
      ...(cleanBarres.length > 1 ? { barres: cleanBarres } : {}),
      fingerCount: groups.length,
    };
  };

  const separate = makeResult([]);
  if (separate) return separate;
  if (!allowBarre) return null;

  const candidates: BarreCandidate[] = [];
  for (const fret of [...new Set(fretted.map((entry) => entry.fret))].sort((a, b) => a - b)) {
    const indices = fretted.filter((entry) => entry.fret === fret).map((entry) => entry.i);
    for (let a = 0; a < indices.length; a++) for (let b = a + 1; b < indices.length; b++) {
      const from = indices[a];
      const to = indices[b];
      // Conservatively avoid open, muted and lower-fretted strings within the
      // barre. Higher fretted notes within it are compatible (as in F major).
      if (!frets.slice(from, to + 1).every((value) => value !== null && value >= fret)) continue;
      candidates.push({ fret, stringFrom: from, stringTo: to, indices: indices.filter((index) => index >= from && index <= to) });
    }
  }
  candidates.sort((a, b) => a.fret - b.fret || b.indices.length - a.indices.length || a.stringFrom - b.stringFrom || a.stringTo - b.stringTo);
  for (const candidate of candidates) {
    const result = makeResult([candidate]);
    if (result) return result;
  }
  for (let a = 0; a < candidates.length; a++) for (let b = a + 1; b < candidates.length; b++) {
    const result = makeResult([candidates[a], candidates[b]]);
    if (result) return result;
  }
  return null;
}

/** Named, deliberately uncalibrated preferences; see docs/voicing-heuristics.md. */
export const VOICING_EASE_WEIGHTS = {
  span: 2,
  edgeMuted: 0.5,
  interiorMuted: 2,
  finger: 0.5,
  barre: 1.25,
  position: 0.3,
  lowOpen: -0.5,
} as const;

type VoicingFeatures = Pick<Voicing, 'frets' | 'span' | 'fingerCount' | 'position' | 'barre' | 'barres'>;

/** Muted strings between sounding strings need selective picking or damping. */
export function interiorMutedCount(frets: (number | null)[]): number {
  const first = frets.findIndex((fret) => fret !== null);
  let last = frets.length - 1;
  while (last >= 0 && frets[last] === null) last--;
  return first < 0 ? 0 : frets.slice(first, last + 1).filter((fret) => fret === null).length;
}

/** A ranking proxy for an isolated grip, not a measured physical difficulty. */
export function estimateVoicingEase(v: VoicingFeatures): number {
  const interior = interiorMutedCount(v.frets);
  const muted = v.frets.filter((fret) => fret === null).length;
  const barres = v.barres?.length ?? (v.barre ? 1 : 0);
  const highest = Math.max(0, ...v.frets.filter((fret): fret is number => fret !== null));
  // Open strings are treated as a beginner-friendly cue only in low positions;
  // distant fretted notes plus open strings are not assumed to be easy.
  const lowOpen = highest <= 4 ? Math.min(3, v.frets.filter((fret) => fret === 0).length) : 0;
  const w = VOICING_EASE_WEIGHTS;
  const score = v.span * w.span + (muted - interior) * w.edgeMuted + interior * w.interiorMuted
    + v.fingerCount * w.finger + barres * w.barre + v.position * w.position + lowOpen * w.lowOpen;
  return Math.round(score * 100) / 100;
}

/** Explain the coarse visual grade independently of chord identity or bass. */
export function estimateVoicingDifficulty(v: VoicingFeatures): { level: Voicing['playability']; reasons: string[] } {
  const barreCount = v.barres?.length ?? (v.barre ? 1 : 0);
  const interior = interiorMutedCount(v.frets);
  const reasons: string[] = [];
  if (barreCount > 1) reasons.push('two barres');
  else if (barreCount) reasons.push('barre');
  if (v.span >= 4) reasons.push('wide fret span');
  else if (v.span >= 3) reasons.push('fret stretch');
  if (v.fingerCount >= 4) reasons.push('four fretting fingers');
  if (interior) reasons.push('interior muted string requires selective picking or damping');
  if (v.position >= 5) reasons.push('higher fret position');
  const level = barreCount > 1 || v.span >= 4 || interior >= 2 ? 'advanced'
    : barreCount || v.span >= 3 || v.fingerCount >= 4 || interior || v.position >= 5 ? 'intermediate'
      : 'beginner';
  return { level, reasons: reasons.length ? reasons : ['compact fingering'] };
}

/**
 * Generate voicings for a chord tone set on a given tuning.
 *
 * @param chordPcs  distinct pitch classes that define the chord
 * @param tuning    instrument tuning (6, 7 or 8 strings supported)
 * @param rootPc    chord root, used for root-bass tie breaks and registered voicings
 * @param options   fret window and playability constraints
 */
export function searchVoicings(
  chordPcs: number[],
  tuning: Tuning,
  rootPc: number = chordPcs[0],
  options: VoicingOptions = {},
): VoicingSearchResult {
  const opts = { ...DEFAULTS, ...options };
  const toneSet = new Set(chordPcs.map(normalizePc));
  const omissions = new Set((options.allowedOmissions ?? []).map(normalizePc));
  const requiredOneOf = new Set((options.requiredOneOf ?? []).map(normalizePc));
  const stringCount = tuning.strings.length;

  // Which tones are legally allowed to be missing at a leaf?
  const canOmit = (pc: number) => omissions.has(pc);

  const perStringCandidates: number[][] = tuning.strings.map((_, i) => {
    const frets = candidateFrets(
      tuning, i, toneSet, opts.minFret, opts.maxFret, opts.allowOpen,
    );
    // Search the entire requested window. Trimming by pitch count silently
    // discarded valid upper-fret shapes, especially for extended chords.
    return [-1, ...frets]; // -1 sentinel = muted
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
    if (sounding.length < 2 || (opts.minFret > 0 && !sounding.some((fret) => fret > 0))) return;

    // All non-omittable tones must be present; nothing outside the chord allowed.
    for (const pc of toneSet) {
      if (!covered.has(pc) && !canOmit(pc)) return;
    }
    if (opts.requiredBass !== undefined && bassPc !== normalizePc(opts.requiredBass)) return;
    if (requiredOneOf.size && ![...requiredOneOf].some((pc) => covered.has(pc))) return;

    const midi = current.map((f, i) =>
      f === null ? null : fretToMidi(tuning.strings[i].pc, tuning.strings[i].octave, f),
    );
    if (options.requiredVoicing && !matchesVoicingPattern(midi.filter((n): n is number => n !== null), rootPc, options.requiredVoicing)) return;

    const fingering = assignFingering(current, opts.allowBarre);
    if (!fingering) return;

    const frettedFrets = sounding.filter((f) => f > 0);
    const position = frettedFrets.length ? Math.min(...frettedFrets) : 0;
    const span = frettedFrets.length ? Math.max(...frettedFrets) - Math.min(...frettedFrets) : 0;

    const key = current.map((f) => (f === null ? 'x' : String(f))).join('|');
    if (seen.has(key)) return;
    seen.add(key);

    const pitchClasses = current.map((f, i) =>
      f === null ? null : fretPc(tuning, i, f),
    );

    const partial = {
      frets: [...current],
      fingers: fingering.fingers,
      barre: fingering.barre,
      ...(fingering.barres ? { barres: fingering.barres } : {}),
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
      score: estimateVoicingEase(partial),
      playability: estimateVoicingDifficulty(partial).level,
    });
  }

  dfs(0);

  // Alternatives in a required-one-of group (such as 7alt alterations) are
  // not incomplete just because a different valid alteration was chosen.
  const missingCount = new Map(results.map((voicing) => [voicing, [...omissions].filter((pc) => toneSet.has(pc) && !requiredOneOf.has(pc) && !voicing.pitchClasses.includes(pc)).length]));
  const root = normalizePc(rootPc);
  const compareFrets = (a: Voicing, b: Voicing) => {
    for (let i = 0; i < a.frets.length; i++) {
      const difference = (a.frets[i] ?? -1) - (b.frets[i] ?? -1);
      if (difference) return difference;
    }
    return 0;
  };
  results.sort((a, b) => {
    const primary = opts.sortBy === 'position' ? a.position - b.position : a.score - b.score;
    // Completeness and then root bass break ties; neither is a claim about
    // hand difficulty, and neither filters out inversions or omissions.
    return primary || missingCount.get(a)! - missingCount.get(b)!
      || (opts.sortBy === 'position' ? a.score - b.score : a.position - b.position)
      || Number(b.bassPc === root) - Number(a.bassPc === root) || compareFrets(a, b);
  });
  return {
    voicings: results.slice(0, opts.maxResults),
    totalFound: results.length,
    searchTruncated: budgetExceeded,
    resultLimitReached: results.length > opts.maxResults,
  };
}

/** Convenience wrapper for callers that only need the ranked shapes. */
export function generateVoicings(
  chordPcs: number[],
  tuning: Tuning,
  rootPc: number = chordPcs[0],
  options: VoicingOptions = {},
): Voicing[] {
  return searchVoicings(chordPcs, tuning, rootPc, options).voicings;
}
