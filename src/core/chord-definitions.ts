/**
 * chord-definitions.ts — the supported chord vocabulary.
 *
 * Every chord type is declared as an interval FORMULA relative to an
 * arbitrary root, plus the symbols/abbreviations used to name and search it.
 * The encyclopedia combines these definitions with each of the 12 roots at
 * runtime, so adding a new chord type is a single declarative entry.
 *
 * This file intentionally does NOT enumerate every chord that exists in
 * music — see README "Supported vocabulary & limitations".
 */

export type ChordCategory =
  | 'triad'
  | 'suspended'
  | 'power'
  | 'sixth'
  | 'seventh'
  | 'added'
  | 'extended'
  | 'altered'
  | 'special';

export interface ChordType {
  /** Stable slug used in URLs, e.g. "dominant-7". */
  id: string;
  /** Full display name, e.g. "Dominant seventh". */
  name: string;
  /** Symbols appended after the root, e.g. ["7", "dom7"]. First is canonical. */
  symbols: string[];
  /** Interval formula from the root. */
  intervals: string[];
  category: ChordCategory;
  /** One or two sentences of music theory explanation. */
  description: string;
  /**
   * Interval symbols that may be omitted in practical guitar voicings
   * (typically the fifth, which is functionally neutral). The generator and
   * identifier use these for compact or extended voicings.
   */
  omittable?: string[];
  /** Additional tones the identifier may label as absent, without changing generated voicings. */
  identificationOmissions?: string[];
  /** At least one of these optional intervals must sound (e.g. an alteration in 7alt). */
  requireOneOf?: string[];
  /** Exact ascending semitone offsets from the lowest/root note for a voicing-specific name. */
  voicingPattern?: number[];
}

export const CHORD_TYPES: ChordType[] = [
  // ---------------------------------------------------------------- triads
  {
    id: 'major', name: 'Major', symbols: ['', 'maj', 'M'],
    intervals: ['1', '3', '5'], category: 'triad',
    identificationOmissions: ['5'],
    description: 'A root, major third and perfect fifth. Bright, stable and happy — the foundation of tonal harmony.',
  },
  {
    id: 'minor', name: 'Minor', symbols: ['m', 'min', '-'],
    intervals: ['1', 'b3', '5'], category: 'triad',
    identificationOmissions: ['5'],
    description: 'A root with a minor third and perfect fifth. The lowered third gives a darker, sadder colour than major.',
  },
  {
    id: 'diminished', name: 'Diminished', symbols: ['dim', '°'],
    intervals: ['1', 'b3', 'b5'], category: 'triad',
    description: 'Two stacked minor thirds. Tense and unstable, the diminished triad pulls strongly toward a chord a semitone away.',
  },
  {
    id: 'augmented', name: 'Augmented', symbols: ['aug', '+'],
    intervals: ['1', '3', '#5'], category: 'triad',
    description: 'Two stacked major thirds. The raised fifth creates a floating, symmetrical sound that wants to resolve.',
  },
  // ------------------------------------------------------------ suspended
  {
    id: 'sus2', name: 'Suspended second', symbols: ['sus2'],
    intervals: ['1', '2', '5'], category: 'suspended',
    description: 'The third is replaced by a second, creating an open, airy sound that usually resolves to major or minor.',
  },
  {
    id: 'sus4', name: 'Suspended fourth', symbols: ['sus4', 'sus'],
    intervals: ['1', '4', '5'], category: 'suspended',
    description: 'The third is replaced by a fourth. Tension builds against the root and typically resolves down to the third.',
  },
  {
    id: 'sus2-sus4', name: 'Suspended second and fourth', symbols: ['sus2sus4', 'sus4add9'],
    intervals: ['1', '2', '4', '5'], category: 'suspended',
    description: 'A suspended chord containing both the second and fourth, with no third. Its open sound can have several names depending on the bass and context.',
  },
  // --------------------------------------------------------------- power
  {
    id: 'power', name: 'Power chord', symbols: ['5', 'no3'],
    intervals: ['1', '5'], category: 'power',
    description: 'Root and fifth only, often doubled at the octave. With no third it is neither major nor minor — the backbone of rock and metal.',
  },
  // --------------------------------------------------------------- sixth
  {
    id: 'sixth', name: 'Major sixth', symbols: ['6'],
    intervals: ['1', '3', '5', '6'], category: 'sixth',
    omittable: ['5'],
    description: 'A major triad plus a major sixth. Warm and jazzy, common in swing, pop and early rock-and-roll.',
  },
  {
    id: 'minor-sixth', name: 'Minor sixth', symbols: ['m6', '-6'],
    intervals: ['1', 'b3', '5', '6'], category: 'sixth',
    omittable: ['5'],
    description: 'A minor triad plus a major sixth. The minor third and major sixth give a sophisticated, bittersweet colour.',
  },
  {
    id: 'six-nine', name: 'Six-nine', symbols: ['6/9', '69'],
    intervals: ['1', '3', '5', '6', '9'], category: 'sixth',
    omittable: ['5'],
    description: 'A sixth chord with an added ninth. Lush and open, frequently used as a jazzy substitute for a plain major chord.',
  },
  {
    id: 'minor-six-nine', name: 'Minor six-nine', symbols: ['m6/9', 'm69'],
    intervals: ['1', 'b3', '5', '6', '9'], category: 'sixth',
    omittable: ['5'],
    description: 'A minor sixth chord with an added ninth and no seventh. The perfect fifth may be left out in compact voicings.',
  },
  // ------------------------------------------------------------- seventh
  {
    id: 'major-7', name: 'Major seventh', symbols: ['maj7', 'M7', 'Δ7'],
    intervals: ['1', '3', '5', '7'], category: 'seventh',
    omittable: ['5'],
    description: 'A major triad plus a major seventh. Smooth and dreamy — a core sound of jazz and sophisticated pop.',
  },
  {
    id: 'dominant-7', name: 'Dominant seventh', symbols: ['7', 'dom7'],
    intervals: ['1', '3', '5', 'b7'], category: 'seventh',
    omittable: ['5'],
    description: 'A major triad plus a minor seventh. The tritone between third and seventh creates tension that resolves to the tonic.',
  },
  {
    id: 'minor-7', name: 'Minor seventh', symbols: ['m7', '-7', 'min7'],
    intervals: ['1', 'b3', '5', 'b7'], category: 'seventh',
    omittable: ['5'],
    description: 'A minor triad plus a minor seventh. Mellow and relaxed — one of the most common chords in jazz, funk and soul.',
  },
  {
    id: 'minor-major-7', name: 'Minor-major seventh', symbols: ['mMaj7', 'm(M7)', '-Δ7'],
    intervals: ['1', 'b3', '5', '7'], category: 'seventh',
    omittable: ['5'],
    description: 'A minor triad with a major seventh. Moody and cinematic, often used in film scores and minor-key jazz.',
  },
  {
    id: 'half-diminished', name: 'Half-diminished seventh', symbols: ['m7b5', 'ø7', 'ø'],
    intervals: ['1', 'b3', 'b5', 'b7'], category: 'seventh',
    description: 'A diminished triad plus a minor seventh. It is the diatonic vii chord in major and the ii chord in minor, and a key ingredient of the ii–V–i.',
  },
  {
    id: 'diminished-7', name: 'Diminished seventh', symbols: ['dim7', '°7'],
    intervals: ['1', 'b3', 'b5', 'bb7'], category: 'seventh',
    description: 'Three stacked minor thirds — a fully symmetrical chord. Each note can act as the root, making it a versatile pivot for modulation.',
  },
  {
    id: 'dominant-7-sus4', name: 'Dominant seventh suspended fourth', symbols: ['7sus4', '7sus'],
    intervals: ['1', '4', '5', 'b7'], category: 'seventh',
    omittable: ['5'],
    description: 'A dominant seventh with the third replaced by a fourth. Combines suspended tension with dominant pull, beloved in funk and fusion.',
  },
  {
    id: 'dominant-7-sus2', name: 'Dominant seventh suspended second', symbols: ['7sus2'],
    intervals: ['1', '2', '5', 'b7'], category: 'seventh',
    omittable: ['5'],
    description: 'A dominant seventh with the third replaced by a second. The suspended note keeps the major/minor quality open.',
  },
  {
    id: 'major-7sharp5', name: 'Major seventh sharp five', symbols: ['maj7#5', 'maj7+5'],
    intervals: ['1', '3', '#5', '7'], category: 'seventh',
    description: 'An augmented triad with a major seventh. The raised fifth is essential to its distinctive colour.',
  },
  {
    id: 'augmented-7', name: 'Augmented dominant seventh', symbols: ['7#5', '+7', 'aug7'],
    intervals: ['1', '3', '#5', 'b7'], category: 'seventh',
    description: 'A dominant seventh with a raised fifth. Whole-tone colour and extra tension on the way to a resolution.',
  },
  // ------------------------------------------------------------- added
  {
    id: 'add9', name: 'Major add nine', symbols: ['add9', 'add2'],
    intervals: ['1', '3', '5', '9'], category: 'added',
    omittable: ['5'],
    description: 'A major triad with a ninth added but no seventh — bright and chiming, a staple of alternative rock and pop.',
  },
  {
    id: 'madd9', name: 'Minor add nine', symbols: ['madd9', 'm(add9)'],
    intervals: ['1', 'b3', '5', '9'], category: 'added',
    omittable: ['5'],
    description: 'A minor triad with an added ninth. Keeps minor intimacy while gaining a shimmering upper colour.',
  },
  {
    id: 'add11', name: 'Add eleven', symbols: ['add11', 'add4'],
    intervals: ['1', '3', '5', '11'], category: 'added',
    omittable: ['5'],
    description: 'A triad plus a perfect eleventh (a fourth an octave up). Open, modern and slightly quartal in flavour.',
  },
  {
    id: 'madd11', name: 'Minor add eleven', symbols: ['madd11', 'm(add11)'],
    intervals: ['1', 'b3', '5', '11'], category: 'added',
    omittable: ['5'],
    description: 'A minor triad with an added eleventh. Dark and resonant, common in contemporary R&B and neo-soul.',
  },
  // ----------------------------------------------------------- extended
  {
    id: 'dominant-9', name: 'Dominant ninth', symbols: ['9'],
    intervals: ['1', '3', '5', 'b7', '9'], category: 'extended',
    omittable: ['5'],
    description: 'A dominant seventh plus a ninth. Five tones of rich, jazzy tension that still resolves like a dominant.',
  },
  {
    id: 'major-9', name: 'Major ninth', symbols: ['maj9', 'M9'],
    intervals: ['1', '3', '5', '7', '9'], category: 'extended',
    omittable: ['5'],
    description: 'A major seventh plus a ninth. Lush, warm and impressionistic — the textbook jazz ballad chord.',
  },
  {
    id: 'minor-9', name: 'Minor ninth', symbols: ['m9', '-9'],
    intervals: ['1', 'b3', '5', 'b7', '9'], category: 'extended',
    omittable: ['5'],
    description: 'A minor seventh plus a ninth. Smooth and full, essential in modal jazz and modern soul.',
  },
  {
    id: 'minor-major-9', name: 'Minor-major ninth', symbols: ['mMaj9', 'm(maj9)'],
    intervals: ['1', 'b3', '5', '7', '9'], category: 'extended',
    omittable: ['5'],
    description: 'A minor-major seventh with an added ninth: minor third, major seventh and ninth over the root.',
  },
  {
    id: 'half-diminished-9', name: 'Minor ninth flat five', symbols: ['m9b5', 'ø9'],
    intervals: ['1', 'b3', 'b5', 'b7', '9'], category: 'extended',
    description: 'A half-diminished seventh with a natural ninth. Its diminished fifth is part of the chord quality.',
  },
  {
    id: 'dominant-9-sus4', name: 'Dominant ninth suspended fourth', symbols: ['9sus4', '9sus'],
    intervals: ['1', '4', '5', 'b7', '9'], category: 'extended',
    omittable: ['5'],
    description: 'A dominant ninth with the third replaced by a fourth. For example, C9sus4 contains C F G Bb D.',
  },
  {
    id: 'dominant-11', name: 'Dominant eleventh', symbols: ['11'],
    intervals: ['1', '3', '5', 'b7', '9', '11'], category: 'extended',
    omittable: ['5', '3'],
    description: 'A ninth chord plus an eleventh. On guitar the third is often omitted, leaving a powerful suspended, quartal sound.',
  },
  {
    id: 'minor-11', name: 'Minor eleventh', symbols: ['m11', '-11'],
    intervals: ['1', 'b3', '5', 'b7', '9', '11'], category: 'extended',
    omittable: ['5', '9'],
    description: 'A minor ninth plus an eleventh. Deep, modal and spacious — central to McCoy Tyner-style jazz and modern fusion.',
  },
  {
    id: 'major-11', name: 'Major eleventh', symbols: ['maj11', 'M11'],
    intervals: ['1', '3', '5', '7', '9', '11'], category: 'extended',
    omittable: ['5', '3'],
    description: 'A major ninth plus an eleventh. The natural clash of 3 and 11 means the third is frequently omitted on guitar.',
  },
  {
    id: 'major-9sharp11', name: 'Major ninth sharp eleven', symbols: ['maj9#11'],
    intervals: ['1', '3', '5', '7', '9', '#11'], category: 'extended',
    omittable: ['5'],
    description: 'A major ninth with a raised eleventh, combining a major-seventh sound with Lydian colour.',
  },
  {
    id: 'dominant-13-sus4', name: 'Dominant thirteenth suspended fourth', symbols: ['13sus4', '13sus'],
    intervals: ['1', '4', '5', 'b7', '9', '13'], category: 'extended',
    omittable: ['5', '9'],
    description: 'A suspended dominant with a thirteenth. The third is replaced by a fourth; the fifth and ninth may be omitted.',
  },
  {
    id: 'dominant-13', name: 'Dominant thirteenth', symbols: ['13'],
    intervals: ['1', '3', '5', 'b7', '9', '11', '13'], category: 'extended',
    omittable: ['5', '11', '9'],
    description: 'The full dominant stack up to the thirteenth. Guitar voicings typically keep 1–3–b7–13 for a compact, funky result.',
  },
  {
    id: 'major-13', name: 'Major thirteenth', symbols: ['maj13', 'M13'],
    intervals: ['1', '3', '5', '7', '9', '11', '13'], category: 'extended',
    omittable: ['5', '11', '9'],
    description: 'A major seventh chord extended to the thirteenth. The brightest, most expansive colour in tonal jazz.',
  },
  {
    id: 'minor-13', name: 'Minor thirteenth', symbols: ['m13', '-13'],
    intervals: ['1', 'b3', '5', 'b7', '9', '11', '13'], category: 'extended',
    omittable: ['5', '11', '9'],
    description: 'A minor eleventh plus a major thirteenth. Warm and sophisticated over minor-key grooves.',
  },
  // ------------------------------------------------------------ altered
  {
    id: 'dominant-7b5', name: 'Dominant seventh flat five', symbols: ['7b5'],
    intervals: ['1', '3', 'b5', 'b7'], category: 'altered',
    description: 'A dominant seventh with a lowered fifth. Shares its notes with other dominant families and leans toward whole-tone colour.',
  },
  {
    id: 'dominant-9b5', name: 'Dominant ninth flat five', symbols: ['9b5'],
    intervals: ['1', '3', 'b5', 'b7', '9'], category: 'altered',
    description: 'A dominant ninth with a diminished fifth; the altered fifth and the ninth both define the name.',
  },
  {
    id: 'dominant-7b9', name: 'Dominant seventh flat nine', symbols: ['7b9'],
    intervals: ['1', '3', '5', 'b7', 'b9'], category: 'altered',
    omittable: ['5'],
    description: 'A dominant ninth with a lowered ninth. The b9 is only a semitone from the root, giving a dramatic, biting tension.',
  },
  {
    id: 'dominant-7sharp9', name: 'Dominant seventh sharp nine', symbols: ['7#9'],
    intervals: ['1', '3', '5', 'b7', '#9'], category: 'altered',
    omittable: ['5'],
    description: 'The famous "Hendrix chord". The raised ninth clashes against the major third for a gritty, bluesy dominant sound.',
  },
  {
    id: 'dominant-7sharp11', name: 'Dominant seventh sharp eleven', symbols: ['7#11', 'lydian-dom'],
    intervals: ['1', '3', '5', 'b7', '9', '#11'], category: 'altered',
    omittable: ['5', '9'],
    description: 'A dominant chord with a raised eleventh — the signature sound of the Lydian dominant mode and modern jazz.',
  },
  {
    id: 'dominant-7flat13', name: 'Dominant seventh flat thirteen', symbols: ['7b13'],
    intervals: ['1', '3', '5', 'b7', 'b13'], category: 'altered',
    omittable: ['5'],
    description: 'A dominant with a lowered thirteenth (equivalent to a raised fifth in the upper octave), adding dark altered tension.',
  },
  {
    id: 'dominant-alt', name: 'Altered dominant', symbols: ['7alt', 'alt'],
    intervals: ['1', '3', 'b7', 'b9', '#9', 'b5', '#5'], category: 'altered',
    omittable: ['b5', '#5', 'b9', '#9'],
    requireOneOf: ['b5', '#5', 'b9', '#9'],
    description: 'A dominant seventh built from the altered scale, using at least one altered fifth or ninth. The most tense dominant in jazz, resolving strongly to the tonic.',
  },
  {
    id: 'dominant-7b5b9', name: 'Dominant seventh flat five flat nine', symbols: ['7b5b9'],
    intervals: ['1', '3', 'b5', 'b7', 'b9'], category: 'altered',
    description: 'A dominant seventh with both its fifth and ninth lowered.',
  },
  {
    id: 'dominant-7b5sharp9', name: 'Dominant seventh flat five sharp nine', symbols: ['7b5#9'],
    intervals: ['1', '3', 'b5', 'b7', '#9'], category: 'altered',
    description: 'A dominant seventh with a lowered fifth and raised ninth.',
  },
  {
    id: 'dominant-7sharp5b9', name: 'Dominant seventh sharp five flat nine', symbols: ['7#5b9'],
    intervals: ['1', '3', '#5', 'b7', 'b9'], category: 'altered',
    description: 'A dominant seventh with a raised fifth and lowered ninth.',
  },
  {
    id: 'dominant-7sharp5sharp9', name: 'Dominant seventh sharp five sharp nine', symbols: ['7#5#9'],
    intervals: ['1', '3', '#5', 'b7', '#9'], category: 'altered',
    description: 'Two alterations stacked on a dominant seventh — maximum funk-jazz tension over a single chord.',
  },
  // ------------------------------------------------------------ special
  {
    id: 'quartal', name: 'Quartal chord', symbols: ['quartal', 'sus4-add-b7'],
    intervals: ['1', '4', 'b7'], category: 'special',
    description: 'A root, fourth and flat seventh can form two stacked perfect fourths when placed in the right registers. Other arrangements of the same notes can have different names.',
  },
  {
    id: 'so-what', name: 'So What chord', symbols: ['so-what', 'm11-voicing'],
    intervals: ['1', '4', 'b7', 'b3', '5'], category: 'special',
    voicingPattern: [0, 5, 10, 15, 19],
    description: 'A specific five-note voicing: three stacked perfect fourths topped by a major third. For D, the notes ascend D–G–C–F–A; it can function as Dm11 without the ninth. Pitch classes alone do not determine this voicing.',
  },
  {
    id: 'major-7sharp11', name: 'Major seventh sharp eleven', symbols: ['maj7#11', 'lydian'],
    intervals: ['1', '3', '5', '7', '#11'], category: 'special',
    omittable: ['5'],
    description: 'A major seventh with a raised eleventh — the chord form of the Lydian mode: floaty, modern and dreamlike.',
  },
];

const BY_ID = new Map(CHORD_TYPES.map((t) => [t.id, t]));

export function getChordType(id: string): ChordType {
  const type = BY_ID.get(id);
  if (!type) throw new Error(`Unknown chord type: "${id}"`);
  return type;
}

export function findChordTypeBySymbol(symbol: string): ChordType | undefined {
  const needle = symbol.trim();
  // Case is musically meaningful: M7 is major seventh, m7 is minor seventh.
  const exact = CHORD_TYPES.find((type) => type.symbols.includes(needle));
  if (exact) return exact;
  const folded = CHORD_TYPES.filter((type) => type.symbols.some((candidate) => candidate.toLowerCase() === needle.toLowerCase()));
  return folded.length === 1 ? folded[0] : undefined;
}

export const CHORD_CATEGORIES: { id: ChordCategory; label: string }[] = [
  { id: 'triad', label: 'Triads' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'power', label: 'Power chords' },
  { id: 'sixth', label: 'Sixth chords' },
  { id: 'seventh', label: 'Seventh chords' },
  { id: 'added', label: 'Add chords' },
  { id: 'extended', label: 'Extended (9/11/13)' },
  { id: 'altered', label: 'Altered dominants' },
  { id: 'special', label: 'Quartal & special' },
];
