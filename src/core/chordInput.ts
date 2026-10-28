import { CHORD_TYPES } from './chord-definitions';
import { normalizeNoteName } from './notes';

export interface ParsedChordInput { root: string; typeId: string; bass?: string }

/**
 * Interpret the same chord vocabulary used by the encyclopedia. Exact symbol
 * case matters: Cmaj7 / CM7 are major, while Cm7 is minor. A trailing slash
 * followed by a note is a bass; the slash in 6/9 is part of the chord type.
 */
export function parseChordInput(input: string): ParsedChordInput | null {
  const text = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const rootMatch = /^([A-G](?:#+|b+)?)(.*)$/i.exec(text);
  if (!rootMatch) return null;
  const root = normalizeNoteName(rootMatch[1]);
  let suffix = rootMatch[2].trim();
  let bass: string | undefined;
  const bassMatch = /\/([A-G](?:#+|b+)?)$/i.exec(suffix);
  if (bassMatch) {
    bass = normalizeNoteName(bassMatch[1]);
    suffix = suffix.slice(0, bassMatch.index).trim();
  }

  const compact = suffix.replace(/\s+/g, '');
  const exact = CHORD_TYPES.find((type) => type.symbols.includes(compact));
  if (exact) return { root, typeId: exact.id, bass };

  const fullName = CHORD_TYPES.find((type) => type.name.toLowerCase() === suffix.toLowerCase().replace(/\s+/g, ' '));
  if (fullName) return { root, typeId: fullName.id, bass };

  // Do not guess if case-folding would merge distinct major/minor symbols.
  const folded = CHORD_TYPES.filter((type) => type.symbols.some((symbol) => symbol.toLowerCase() === compact.toLowerCase()));
  return folded.length === 1 ? { root, typeId: folded[0].id, bass } : null;
}
