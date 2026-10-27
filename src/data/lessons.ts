/**
 * lessons.ts — structured music theory curriculum.
 * Blocks are rendered by TheoryLessonPage; example chords/scales link
 * straight into the working encyclopedia and fretboard tools.
 */

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LessonExampleChord {
  root: string;
  typeId: string;
  caption?: string;
}
export interface LessonExampleScale {
  root: string;
  scaleId: string;
  caption?: string;
}

export interface LessonBlock {
  kind: 'paragraph' | 'list' | 'formula' | 'callout' | 'example';
  title?: string;
  text?: string;
  items?: string[];
  formula?: string;
  chords?: LessonExampleChord[];
  scales?: LessonExampleScale[];
}

export interface Lesson {
  id: string;
  title: string;
  level: LessonLevel;
  summary: string;
  minutes: number;
  blocks: LessonBlock[];
  related?: string[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'meet-your-guitar',
    title: 'Meet your guitar',
    level: 'beginner',
    minutes: 6,
    summary: 'Learn the names of the strings and the parts you will use to make your first notes.',
    blocks: [
      { kind: 'paragraph', text: 'A guitar makes sound when a string vibrates. The long part you hold is the neck; the thin metal strips across it are frets. Press a string just behind a fret and pluck it with your other hand. Shortening the vibrating string makes its pitch (how high or low it sounds) rise.' },
      { kind: 'paragraph', text: 'Strings are numbered from the thinnest, highest-sounding string to the thickest, lowest-sounding string. On a six-string guitar, string 1 is the high E and string 6 is the low E. An open string is played without pressing any fret.' },
      { kind: 'formula', title: 'Standard tuning, from thickest to thinnest', formula: '6 E2  ·  5 A2  ·  4 D3  ·  3 G3  ·  2 B3  ·  1 E4' },
      { kind: 'list', title: 'A few useful parts', items: ['The headstock holds the tuning pegs; turn these gently to adjust string tension.', 'The nut is the small bar at the end of the neck that guides the open strings.', 'A capo is a clamp that holds all the strings down at the same fret.', 'The body amplifies the sound of an acoustic guitar.'] },
      { kind: 'callout', title: 'Try it', text: 'Use the string explorer below. Listen from the low E to the high E; then open the tuner to hear each reference note again.' },
    ],
    related: ['notes-pitch-enharmonics', 'reading-chord-diagrams'],
  },
  {
    id: 'reading-chord-diagrams',
    title: 'Read your first chord diagram',
    level: 'beginner',
    minutes: 7,
    summary: 'Turn the little grid above a chord into a shape you can play.',
    blocks: [
      { kind: 'paragraph', text: 'A chord is two or more different notes played together. A chord diagram is a picture of the neck as if the guitar were standing upright. Its vertical lines are strings: the thick low string is on the left, and the thin high string is on the right.' },
      { kind: 'list', title: 'Read the picture', items: ['The thick horizontal line at the top is the nut. The spaces below it are frets.', 'A dot tells you where to press a string. A number inside a dot suggests a fretting finger: 1 is index, 2 middle, 3 ring and 4 little finger.', 'O means play the string open. An × means do not play that string.', 'A bar across several strings means one finger presses more than one string at the same fret.'] },
      { kind: 'callout', title: 'Try it', text: 'Look at the C major diagram below. Tap Hear the shape, then follow the dots and the open and muted symbols from left to right.' },
    ],
    related: ['meet-your-guitar', 'triads'],
  },
  {
    id: 'rhythm-basics',
    title: 'Feel the beat',
    level: 'beginner',
    minutes: 8,
    summary: 'Find a steady pulse, count a bar and make a simple strumming pattern.',
    blocks: [
      { kind: 'paragraph', text: 'The beat is the steady pulse you can tap your foot to. Tempo is the speed of that pulse, measured in beats per minute (BPM). A bar groups beats together; in 4/4 time, count four beats in each bar: 1, 2, 3, 4.' },
      { kind: 'paragraph', text: 'You can divide each beat in two by counting “1 and 2 and 3 and 4 and.” These smaller spaces are eighth notes. Try a downstroke on each number and an upstroke on each “and,” even if you skip some strings or strums.' },
      { kind: 'callout', title: 'Try it', text: 'Turn beats on and off in the rhythm builder below, then listen. Start slowly and keep your hand moving through the spaces you leave silent.' },
      { kind: 'list', title: 'Remember', items: ['A beat is a pulse, not necessarily a strum: you can play more than one note per beat or leave a beat empty.', 'A metronome gives you a steady reference, but it is normal to need practice staying with it.', 'Slow and relaxed is more useful than fast and tense.'] },
    ],
    related: ['meet-your-guitar', 'progressions-function'],
  },
  {
    id: 'notes-pitch-enharmonics',
    title: 'Notes, octaves and enharmonic equivalents',
    level: 'beginner',
    minutes: 8,
    summary: 'The 12-note chromatic system, semitones, whole tones and why one note can have two names.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'The twelve-tone equal-tempered system used here divides each octave into 12 notes, arranged as a repeating loop: C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab, A, A#/Bb, B, then C again an octave higher. On a guitar, moving up one fret raises the pitch by a semitone (half step). The 12 pitch classes repeat in different octaves: C3 and C4 are the same pitch class, but different pitches. Two frets make a whole tone (whole step).',
      },
      {
        kind: 'formula',
        title: 'Distances every guitarist should memorize',
        formula: '1 fret = 1 semitone (half step) · 2 frets = 1 whole tone (whole step) · 12 frets = 1 octave',
      },
      {
        kind: 'paragraph',
        text: 'Notice that some pitches carry two names — C# and Db are the same key on a piano and the same fret on a guitar. These enharmonic equivalents are spelled differently according to their harmonic context: the raised fourth of C is F#, while the flattened fifth of C is Gb — the same sounding pitch. Choosing the correct spelling keeps notation and theory coherent.',
      },
      {
        kind: 'list',
        title: 'Key takeaways',
        items: [
          'There are 12 unique pitch classes; the 13th note is the starting note one octave up.',
          'Natural notes (E–F and B–C) are a semitone apart with no sharp/flat between them.',
          'All other adjacent natural-note pairs are a whole tone apart, with one sharp/flat in between.',
          'Enharmonic equivalents sound identical; context decides the spelling.',
        ],
      },
      {
        kind: 'callout',
        title: 'Try it',
        text: 'Open the Fretboard, choose Standard tuning, and click any note — then find the same pitch class on the next string at a different fret. The note labels make the 12-note loop visible.',
      },
    ],
    related: ['intervals', 'major-minor-scales'],
  },
  {
    id: 'intervals',
    title: 'Intervals: the distance between two notes',
    level: 'beginner',
    minutes: 10,
    summary: 'Major, minor, perfect, augmented and diminished intervals — the atoms of every chord and scale.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'An interval describes the distance between two notes by quality and number. The number counts letter names (C to E is a third: C–D–E), while the quality — major, minor, perfect, augmented or diminished — gives the exact semitone count. Unisons, fourths, fifths and octaves are "perfect"; seconds, thirds, sixths and sevenths can be major or minor.',
      },
      {
        kind: 'formula',
        title: 'Intervals in semitones (within one octave)',
        formula: '1=0 · m2=1 · M2=2 · m3=3 · M3=4 · P4=5 · A4/d5=6 (tritone) · P5=7 · m6=8 · M6=9 · m7=10 · M7=11 · 8va=12',
      },
      {
        kind: 'list',
        title: 'The interval shorthand used across this app',
        items: [
          '1 = root, 2/3/6/7 = major scale degrees, b = flattened (one semitone lower), # = raised.',
          'A major third (3) is 4 semitones; a minor third (b3) is 3 — that single fret difference is what separates major from minor.',
          'The tritone (#4/b5, 6 semitones) is a strongly dissonant interval in tonal harmony and helps create dominant-seventh tension.',
          'Compound intervals continue past the octave: 9 = octave + 2, 11 = octave + 4, 13 = octave + 6.',
        ],
      },
      {
        kind: 'example',
        title: 'Hear the difference',
        chords: [
          { root: 'C', typeId: 'major', caption: 'C major contains a bright major third (4 semitones)' },
          { root: 'C', typeId: 'minor', caption: 'C minor lowers that third by one fret (3 semitones)' },
          { root: 'C', typeId: 'diminished', caption: 'Cdim also flattens the fifth to create the tritone' },
        ],
      },
    ],
    related: ['triads', 'notes-pitch-enharmonics'],
  },
  {
    id: 'major-minor-scales',
    title: 'Major and minor scales and key signatures',
    level: 'beginner',
    minutes: 12,
    summary: 'How seven-note scales are constructed, and the relationship between a major key and its relative minor.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A scale is an ordered set of notes following a fixed interval pattern. The major scale uses the step pattern W–W–H–W–W–W–H (whole and half steps). Starting on C requires no sharps or flats, which is why the key of C major is the easiest place to begin — its notes are simply C D E F G A B.',
      },
      {
        kind: 'formula',
        title: 'The three minor scales',
        formula: 'Natural minor: W–H–W–W–H–W–W · Harmonic minor raises the 7th · Melodic minor (ascending) raises the 6th and 7th',
      },
      {
        kind: 'paragraph',
        text: 'Every major key has a relative minor that shares its exact key signature, starting on the sixth degree: C major and A natural minor both contain no sharps or flats. Harmonic minor raises the seventh note (G becomes G# in A minor) to create a leading tone that pulls strongly back to the root, which is why minor-key cadences use a major V chord.',
      },
      {
        kind: 'example',
        title: 'Compare on the fretboard',
        scales: [
          { root: 'C', scaleId: 'major', caption: 'C major — the white-key reference' },
          { root: 'A', scaleId: 'natural-minor', caption: 'A natural minor — identical notes, darker centre of gravity' },
          { root: 'A', scaleId: 'harmonic-minor', caption: 'A harmonic minor — note the raised G#' },
        ],
      },
      {
        kind: 'list',
        title: 'Key signatures at a glance',
        items: [
          'Sharps accumulate in the order F# C# G# D# A# E# B# (keys G, D, A, E, B, F#, C#).',
          'Flats accumulate in the reverse order Bb Eb Ab Db Gb Cb Fb (keys F, Bb, Eb, Ab, Db, Gb, Cb).',
          'A key signature applies to every octave of those notes, not just one register.',
        ],
      },
    ],
    related: ['circle-of-fifths', 'intervals'],
  },
  {
    id: 'circle-of-fifths',
    title: 'The circle of fifths',
    level: 'beginner',
    minutes: 8,
    summary: 'A map of key relationships, key signatures and harmonic distance.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'The circle of fifths arranges the 12 keys clockwise by perfect fifths: C (0 sharps), G (1 sharp), D (2), A (3), E (4), B (5), F# (6), then the flat keys counterclockwise: F (1 flat), Bb (2), Eb (3), Ab (4), Db (5), Gb (6). Each clockwise step adds one sharp; each counterclockwise step adds one flat.',
      },
      {
        kind: 'list',
        title: 'Why it matters on the guitar',
        items: [
          'Adjacent keys share six of seven notes — modulations a fifth away sound natural and smooth.',
          'Each major key has a relative minor whose root is three semitones lower.',
          'Cycle-of-fifths chord movement (ii–V–I, vi–ii–V–I) is the backbone of jazz standards.',
          'The tritone sits directly opposite on the circle and is the most distant possible key.',
        ],
      },
      {
        kind: 'callout',
        title: 'Try it',
        text: 'Open Progressions and build a vi–ii–V–I in any key — its roots move by descending fifths toward the tonic.',
      },
    ],
    related: ['major-minor-scales', 'diatonic-harmony'],
  },
  {
    id: 'triads',
    title: 'Triads: stacking notes in thirds',
    level: 'beginner',
    minutes: 10,
    summary: 'Major, minor, diminished and augmented triads, their formulas and their emotional character.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A triad is three notes built by stacking two thirds: a root, a third above it, and a fifth above the root. The qualities of those two thirds determine the chord type. A major third plus a minor third gives a major triad; a minor third plus a major third gives minor; two minor thirds give diminished; two major thirds give augmented.',
      },
      {
        kind: 'formula',
        title: 'The four triad formulas',
        formula: 'Major = 1 + 3 + 5 · Minor = 1 + b3 + 5 · Diminished = 1 + b3 + b5 · Augmented = 1 + 3 + #5',
      },
      {
        kind: 'example',
        title: 'All four qualities on C',
        chords: [
          { root: 'C', typeId: 'major', caption: 'C E G — stable and bright' },
          { root: 'C', typeId: 'minor', caption: 'C Eb G — dark and introspective' },
          { root: 'C', typeId: 'diminished', caption: 'C Eb Gb — tense, wants to resolve' },
          { root: 'C', typeId: 'augmented', caption: 'C E G# — floating and symmetrical' },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Suspended chords replace the third entirely: sus2 uses the second (1–2–5) and sus4 the fourth (1–4–5). With no third they are neither major nor minor, and typically resolve back to a triad. Power chords (1–5) go further and omit the third altogether, making them ideal for high-gain rock where distortion turns thirds muddy.',
      },
      {
        kind: 'example',
        title: 'Third-less colours',
        chords: [
          { root: 'A', typeId: 'sus4', caption: 'A D E — classic suspended tension' },
          { root: 'A', typeId: 'sus2', caption: 'A B E — airy and open' },
          { root: 'E', typeId: 'power', caption: 'E B — the rock power chord' },
        ],
      },
    ],
    related: ['intervals', 'inversions-slash-chords', 'major-minor-scales', 'diatonic-harmony', 'seventh-chords'],
  },
  {
    id: 'seventh-chords',
    title: 'Seventh chords and extensions',
    level: 'intermediate',
    minutes: 14,
    summary: 'Adding the seventh, then ninths, elevenths and thirteenths — plus altered tones and quartal colour.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Adding a third third on top of a triad produces a seventh chord. The seventh is either major (11 semitones, e.g. B above C) or minor (10 semitones, Bb above C). Pairing the two triad qualities with the two seventh qualities gives the core jazz vocabulary.',
      },
      {
        kind: 'formula',
        title: 'The seventh-chord family',
        formula: 'maj7 = 1 3 5 7 · 7 = 1 3 5 b7 · m7 = 1 b3 5 b7 · mMaj7 = 1 b3 5 7 · m7b5 = 1 b3 b5 b7 · dim7 = 1 b3 b5 bb7',
      },
      {
        kind: 'example',
        title: 'Core seventh sounds',
        chords: [
          { root: 'F', typeId: 'major-7', caption: 'Fmaj7 — smooth, dreamy major colour' },
          { root: 'G', typeId: 'dominant-7', caption: 'G7 — tritone tension that resolves to C' },
          { root: 'D', typeId: 'minor-7', caption: 'Dm7 — the ii chord in C major' },
          { root: 'B', typeId: 'half-diminished', caption: 'Bm7b5 — the vii chord in C major' },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Extensions continue the stack of thirds past the octave: a ninth is a second an octave up, an eleventh a fourth, and a thirteenth a sixth. Because the guitar has only six strings, practical extended voicings routinely omit the neutral fifth — the engine marks these omittable tones and the identifier still recognizes the chord.',
      },
      {
        kind: 'list',
        title: 'Extension shorthand',
        items: [
          'add9 / madd9: triad plus ninth, with no seventh — chiming and modern.',
          '9, 11, 13: dominant extensions that always include the b7 beneath them.',
          'maj9, maj13: extended major-seventh colour, lush and impressionistic.',
          'Altered dominants (7b9, 7#9, 7#11, 7b13, 7alt) tension the dominant further before resolution.',
          'Quartal chords stack fourths (1–4–b7) instead of thirds — the modal jazz sound of the 1960s.',
        ],
      },
      {
        kind: 'example',
        title: 'Extended and altered colours',
        chords: [
          { root: 'C', typeId: 'major-9', caption: 'Cmaj9 — five lush notes' },
          { root: 'E', typeId: 'dominant-7sharp9', caption: 'E7#9 — the Hendrix chord' },
          { root: 'D', typeId: 'so-what', caption: 'The So What quartal voicing' },
        ],
      },
    ],
    related: ['triads', 'jazz-altered', 'diatonic-harmony'],
  },
  {
    id: 'inversions-slash-chords',
    title: 'Inversions and slash chords',
    level: 'intermediate',
    minutes: 9,
    summary: 'What changes when the bass note is not the root — and how the engine generates these voicings.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A chord is in root position when its root is the lowest note. When the third is in the bass it is a first inversion; the fifth in the bass is a second inversion; the seventh in the bass a third. Written notation uses a slash: C/E means a C major chord with E in the bass, which is exactly its first inversion.',
      },
      {
        kind: 'formula',
        title: 'Inversions of C major',
        formula: 'Root position: C (C–E–G) · 1st inversion: C/E (E in bass) · 2nd inversion: C/G (G in bass)',
      },
      {
        kind: 'paragraph',
        text: 'Not every slash chord is an inversion: if the bass note is not part of the chord (for example D/C), it is a polychord-style slash chord used for smooth basslines. On the guitar, inversions are generated by constraining the lowest sounding note to the required bass pitch — use the "Bass note" control on any chord page to see and hear the options.',
      },
      {
        kind: 'example',
        title: 'Hear inversion smooth the bass',
        chords: [
          { root: 'C', typeId: 'major', caption: 'C in root position' },
          { root: 'C', typeId: 'major', caption: 'Select bass E on the chord page for C/E' },
          { root: 'G', typeId: 'major', caption: 'Compare with G to hear bassline C–B–A–G movement' },
        ],
      },
    ],
    related: ['triads', 'voice-leading'],
  },
  {
    id: 'diatonic-harmony',
    title: 'Diatonic harmony and Roman numerals',
    level: 'intermediate',
    minutes: 12,
    summary: 'The seven chords native to a key, how Roman numerals encode their function, and upper- vs lower-case.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Stacking thirds on each degree of the major scale yields seven diatonic triads in a fixed quality pattern: major, minor, minor, major, major, minor, diminished. Roman numerals name the degrees — uppercase for major, lowercase for minor, with a degree symbol for diminished: I ii iii IV V vi vii°.',
      },
      {
        kind: 'formula',
        title: 'Diatonic triads in C major',
        formula: 'I = C · ii = Dm · iii = Em · IV = F · V = G · vi = Am · vii° = Bdim',
      },
      {
        kind: 'paragraph',
        text: 'Adding another third gives the diatonic seventh chords: Imaj7, iim7, iiim7, IVmaj7, V7, vim7, viiø7. The numeral system is transposition-independent — "a I–V–vi–IV progression" means the same harmonic relationship in every key, which is how the Progressions tool rebuilds any template instantly.',
      },
      {
        kind: 'list',
        title: 'The three harmonic functions',
        items: [
          'Tonic (I, iii, vi): home, stability, rest.',
          'Subdominant (IV, ii): movement away from home.',
          'Dominant (V, vii°): maximum tension and pull back to the tonic.',
        ],
      },
      {
        kind: 'callout',
        title: 'Try it',
        text: 'In Progressions, switch the key of the ii7–V7–Imaj7 template and watch the qualities stay constant while the notes transpose.',
      },
    ],
    related: ['progressions-function', 'circle-of-fifths', 'seventh-chords'],
  },
  {
    id: 'progressions-function',
    title: 'Chord progressions and harmonic function',
    level: 'intermediate',
    minutes: 12,
    summary: 'Cadences, the four-chord song, 12-bar blues and why progressions create expectation and release.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A progression is a sequence of chords whose movement plays with tension and release. A familiar point of arrival is the authentic cadence V–I. In V7–I, the dominant seventh contains a tritone that can resolve inward to the tonic chord. The plagal cadence IV–I is the familiar "amen" ending, and a deceptive cadence V–vi deliberately thwarts the expected resolution.',
      },
      {
        kind: 'list',
        title: 'Progressions every guitarist meets',
        items: [
          'I–V–vi–IV: the four-chord engine of modern pop and rock.',
          'I–vi–IV–V: the 1950s doo-wop progression.',
          'ii–V–I: the essential jazz cadence, usually with seventh chords.',
          '12-bar blues: I–I–I–I / IV–IV–I–I / V–IV–I–V, the root of rock and R&B.',
          'i–VII–VI–V: the Andalusian/Phrygian-flavoured minor progression.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'The vi chord shares two notes with I, which is why vi can substitute for the tonic and why vi–IV–I–V feels like a slightly melancholic version of the four-chord loop. Functional substitution — using iii for I, or ii for IV — is the first step toward reharmonization.',
      },
      {
        kind: 'callout',
        title: 'Try it',
        text: 'Choose the 12-bar blues in E in the Progressions tool and hear its I, IV and V triads. In the chord encyclopedia, compare an E major triad with E7 for the added minor seventh often used in blues.',
      },
    ],
    related: ['diatonic-harmony', 'modes', 'voice-leading'],
  },
  {
    id: 'modes',
    title: 'Modes of the major scale',
    level: 'intermediate',
    minutes: 14,
    summary: 'Seven modes, their characteristic tones, and how a single changed note alters the mood of a key.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A mode is a scale that uses the notes of a parent scale but centres on a different note, making that note the tonal home. Starting the major scale on each of its seven degrees produces Ionian (the major scale itself), Dorian, Phrygian, Lydian, Mixolydian, Aeolian (natural minor) and Locrian. What makes each mode distinctive is its "characteristic tone" — the degree that differs from plain major or minor.',
      },
      {
        kind: 'formula',
        title: 'Mode cheat sheet (relative to major / minor)',
        formula: 'Ionian = major · Dorian = minor + natural 6 · Phrygian = minor + b2 · Lydian = major + #4 · Mixolydian = major + b7 · Aeolian = natural minor · Locrian = minor + b2 + b5',
      },
      {
        kind: 'example',
        title: 'Hear the characteristic tones',
        scales: [
          { root: 'D', scaleId: 'dorian', caption: 'D Dorian — like D minor but with a B natural instead of Bb' },
          { root: 'F', scaleId: 'lydian', caption: 'F Lydian — F major with a bright B natural (#4)' },
          { root: 'G', scaleId: 'mixolydian', caption: 'G Mixolydian — G major with an F natural, the dominant/blues mode' },
          { root: 'E', scaleId: 'phrygian', caption: 'E Phrygian — the Spanish-sounding b2 mode' },
        ],
      },
      {
        kind: 'list',
        title: 'Practical guidance',
        items: [
          'Over some static minor vamps, compare Dorian and Aeolian: the natural sixth in Dorian creates a different color from the flattened sixth in Aeolian. Listen to the harmony and tonal center rather than assuming either always fits.',
          'Lydian works over maj7#11 chords; Mixolydian is the default scale over dominant-seventh vamps.',
          'Locrian is played over m7b5 (half-diminished) chords, its natural home.',
          'The harmonic and melodic minor scales have their own mode families, including Phrygian Dominant and Lydian Dominant, available in the Scales library.',
        ],
      },
    ],
    related: ['major-minor-scales', 'seventh-chords', 'jazz-altered'],
  },
  {
    id: 'voice-leading',
    title: 'Borrowed chords, secondary dominants, modulation and voice leading',
    level: 'advanced',
    minutes: 16,
    summary: 'Chromatic techniques that add colour and movement while keeping a coherent tonal path.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Borrowed chords (mode mixture) take a chord from the parallel minor or major: in a major key, the minor iv (Fm in C major) is the most common borrowed chord and supplies a bittersweet chromatic descent. Borrowed chords introduce notes—and sometimes roots—outside the original key, while the surrounding music can still establish the same tonal center.',
      },
      {
        kind: 'paragraph',
        text: 'A secondary dominant is a dominant-seventh chord that targets a chord other than the tonic — V/vi, V/ii, V/IV and so on. In C major, A7 is V/ii: it is the dominant of D minor, and it resolves to Dm just as G7 resolves to C. Secondary dominants add temporary tonicization without leaving the home key.',
      },
      {
        kind: 'formula',
        title: 'Secondary dominants in C major',
        formula: 'V/vi = E7 → Am · V/ii = A7 → Dm · V/V = D7 → G · V/IV = C7 → F',
      },
      {
        kind: 'paragraph',
        text: 'Modulation changes the tonal centre itself, usually through a pivot chord that belongs to both keys. Smooth modulations move to closely related keys — relative minor, dominant or subdominant — while distant modulations use enharmonic pivots (often a diminished seventh, whose symmetry lets any note function as the root) or common-tone connections.',
      },
      {
        kind: 'list',
        title: 'Voice-leading principles for guitar arranging',
        items: [
          'Keep common tones on the same string or in the same register between adjacent chords.',
          'Move the remaining voices by the smallest possible step — smooth inner parts sound professional even on one guitar.',
          'Avoid parallel perfect fifths and octaves when arranging independent voices.',
          'Resolve tendency tones: the leading tone rises to the root, the dominant seventh descends by step.',
          'On guitar, inversions and slash chords let the bass move stepwise while upper voices stay put — try C–C/B–Am–Am/G–F.',
        ],
      },
    ],
    related: ['diatonic-harmony', 'inversions-slash-chords', 'jazz-altered'],
  },
  {
    id: 'jazz-altered',
    title: 'Jazz harmony and altered dominants',
    level: 'advanced',
    minutes: 15,
    summary: 'Tension and release with 9ths, altered 5ths and 9ths, tritone substitution and the altered scale.',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Jazz harmony treats the ii–V–I as its unit of currency and enriches each stage with chord extensions. The most expressive canvas is the dominant seventh: every available tension — b9, #9, #11, b13 — can be applied, collected in the 7alt symbol. These altered tones come from the altered scale (the seventh mode of melodic minor), and their instability makes the resolution to I feel inevitable.',
      },
      {
        kind: 'formula',
        title: 'Altered dominant vocabulary on G7 (resolving to C)',
        formula: 'G7b9 = G B D F Ab · G7#9 = G B D F A# · G7#11 = G B D F A C# · G7alt combines b9/#9/b5/#5',
      },
      {
        kind: 'example',
        title: 'Altered dominants in the encyclopedia',
        chords: [
          { root: 'G', typeId: 'dominant-7b9', caption: 'G7b9 — dramatic flat-nine tension' },
          { root: 'G', typeId: 'dominant-alt', caption: 'G7alt — the full altered palette' },
          { root: 'G', typeId: 'dominant-7sharp11', caption: 'G7#11 — Lydian dominant colour' },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Tritone substitution replaces a dominant with the dominant a tritone away: Db7 for G7, because both share the tritone B–F (enharmonically Cb–F) and resolve to C. This unlocks chromatic root movement and a whole family of reharmonizations — the basis of much bebop and later jazz. Quartal voicings and "So What"-style stacks then soften functional harmony into modal colour, where chords are static fields of sound rather than tension-and-release engines.',
      },
      {
        kind: 'list',
        title: 'Practice pathway',
        items: [
          'Comp ii–V–I with shell voicings (root, third, seventh only) in every key.',
          'Add 9ths and 13ths before adding altered tones.',
          'Improvise over V7 using first the Mixolydian scale, then the altered scale, and compare the tension.',
          'Substitute Db7 for G7 and notice how the tritone pitches still resolve correctly.',
        ],
      },
    ],
    related: ['seventh-chords', 'modes', 'voice-leading'],
  },
];

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export const LEVEL_LABELS: Record<LessonLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
