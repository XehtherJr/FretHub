/**
 * tunings.ts — instrument tunings.
 *
 * A tuning is an array of strings ordered from the LOWEST pitch to the
 * highest (string 6 -> string 1 on a standard guitar). Each entry carries a
 * pitch class and an octave so MIDI playback and voicings are unambiguous.
 * Seven- and eight-string instruments are supported by simply adding entries.
 */

export interface StringSpec {
  pc: number;
  octave: number;
  /** Display label, e.g. "E2". */
  label: string;
}

export interface Tuning {
  id: string;
  name: string;
  /** Low-to-high string list. */
  strings: StringSpec[];
  /** Short description of where the tuning is commonly used. */
  description: string;
}

function str(pc: number, octave: number): StringSpec {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return { pc, octave, label: `${names[pc]}${octave}` };
}

export const TUNINGS: Tuning[] = [
  {
    id: 'standard',
    name: 'Standard (E A D G B E)',
    description: 'The default guitar tuning used for the vast majority of repertoire.',
    strings: [
      str(4, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(4, 4),
    ],
  },
  {
    id: 'drop-d',
    name: 'Drop D (D A D G B E)',
    description: 'Low E dropped to D — huge low-end power chords with one finger, popular in rock and metal.',
    strings: [
      str(2, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(4, 4),
    ],
  },
  {
    id: 'double-drop-d',
    name: 'Double Drop D (D A D G B D)',
    description: 'Both E strings dropped to D — open D sus4 flavour, favoured by folk and fingerstyle players.',
    strings: [
      str(2, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(2, 4),
    ],
  },
  {
    id: 'dadgad',
    name: 'DADGAD (D A D G A D)',
    description: 'A modal open tuning central to Celtic music and widely used in fingerstyle and rock.',
    strings: [
      str(2, 2), str(9, 2), str(2, 3), str(7, 3), str(9, 3), str(2, 4),
    ],
  },
  {
    id: 'open-g',
    name: 'Open G (D G D G B D)',
    description: 'Strummed open it sounds a G major chord — the classic slide, blues and Rolling Stones tuning.',
    strings: [
      str(2, 2), str(7, 2), str(2, 3), str(7, 3), str(11, 3), str(2, 4),
    ],
  },
  {
    id: 'open-d',
    name: 'Open D (D A D F# A D)',
    description: 'Open strings form a D major chord — a favourite for slide, blues and jangly folk.',
    strings: [
      str(2, 2), str(9, 2), str(2, 3), str(6, 3), str(9, 3), str(2, 4),
    ],
  },
  {
    id: 'open-e',
    name: 'Open E (E B E G# B E)',
    description: 'Open D shape up two semitones. Same easy major chord shapes with brighter tension.',
    strings: [
      str(4, 2), str(11, 2), str(4, 3), str(8, 3), str(11, 3), str(4, 4),
    ],
  },
  {
    id: 'open-c',
    name: 'Open C (C G C G C E)',
    description: 'A wide, resonant C major tuning used by John Fahey, Jimmy Page and many folk players.',
    strings: [
      str(0, 2), str(7, 2), str(0, 3), str(7, 3), str(0, 4), str(4, 4),
    ],
  },
  {
    id: 'half-step-down',
    name: 'Eb Standard (Eb Ab Db Gb Bb Eb)',
    description: 'Everything tuned down one semitone — easier vocal keys and slightly looser string feel.',
    strings: [
      str(3, 2), str(8, 2), str(1, 3), str(6, 3), str(10, 3), str(3, 4),
    ],
  },
  {
    id: 'whole-step-down',
    name: 'D Standard (D G C F A D)',
    description: 'Standard tuning down two semitones — heavier tone without rearranging chord shapes.',
    strings: [
      str(2, 2), str(7, 2), str(0, 3), str(5, 3), str(9, 3), str(2, 4),
    ],
  },
  {
    id: '7-string-standard',
    name: '7-String Standard (B E A D G B E)',
    description: 'Standard guitar plus a low B string — extends the range for jazz, metal and djent.',
    strings: [
      str(11, 1), str(4, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(4, 4),
    ],
  },
  {
    id: '7-string-drop-a',
    name: '7-String Drop A (A E A D G B E)',
    description: 'Low B dropped to A for one-finger power chords across the extended range.',
    strings: [
      str(9, 1), str(4, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(4, 4),
    ],
  },
  {
    id: '8-string-standard',
    name: '8-String Standard (F# B E A D G B E)',
    description: 'Adds low F# and B strings — the modern extended-range instrument for metal and jazz.',
    strings: [
      str(6, 1), str(11, 1), str(4, 2), str(9, 2), str(2, 3), str(7, 3), str(11, 3), str(4, 4),
    ],
  },
];

const BY_ID = new Map(TUNINGS.map((t) => [t.id, t]));

export function getTuning(id: string): Tuning {
  const tuning = BY_ID.get(id);
  if (!tuning) throw new Error(`Unknown tuning: "${id}"`);
  return tuning;
}

/** Apply a capo: every open string shifts up by `capo` semitones. */
export function applyCapo(tuning: Tuning, capo: number): Tuning {
  if (capo === 0) return tuning;
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return {
    ...tuning,
    id: `${tuning.id}-capo-${capo}`,
    name: `${tuning.name} · capo ${capo}`,
    strings: tuning.strings.map((s) => {
      const midi = (s.octave + 1) * 12 + s.pc + capo;
      const pc = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      return { pc, octave, label: `${names[pc]}${octave}` };
    }),
  };
}
