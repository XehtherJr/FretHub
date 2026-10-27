# Frethub — Guitar Chord Encyclopedia & Music Theory Platform

A complete, working guitar reference and learning application. It combines a comprehensive chord
encyclopedia, an **algorithmic voicing engine** (no hardcoded chord diagrams), an interactive
fretboard, a structured music-theory curriculum, scales/modes/arpeggios, a progression explorer,
and practice tools. All musical calculation runs locally in the browser — no AI APIs, no backend
required, no account needed.

## Features

| Area | What is included |
| --- | --- |
| **Chord encyclopedia** | 38 chord formulas × 12 roots = **456 calculated chords** across 9 families: triads, suspended, power, sixth, seventh, add, extended (9/11/13), altered dominants, quartal/special. Every entry shows notes, interval formula, theory explanation, inversions, generated voicings, fingering, tab and synthesized audio. |
| **Voicing engine** | DFS enumeration with playability pruning, open/muted/barre handling, inversions via bass-note constraint, omittable-tone support for extended chords, four-finger fingering assignment, playability ranking and labels. Works in 13 tunings on 6/7/8-string instruments with capo. |
| **Chord identification** | Click notes on the fretboard and every compatible chord formula is returned, ranked by exactness and bass note; partial matches (omitted fifth) are labelled honestly. |
| **Interactive fretboard** | Real buttons for every string/fret (keyboard & screen-reader operable), scale and arpeggio overlays, tuning/capo/fret-range controls, sharp/flat spelling, note-on-click audio, deep linking from any chord. |
| **Theory curriculum** | 12 structured lessons, beginner → advanced: notes/enharmonics, intervals, scales & keys, circle of fifths, triads, seventh chords & extensions, inversions, diatonic harmony, progressions, modes, borrowed/secondary dominants/modulation/voice leading, jazz & altered dominants. Every example links to a playable chord or scale. |
| **Scales & arpeggios** | 17 scales/modes (major/minor/pentatonic/blues/7 modes/harmonic-minor modes/symmetrical), full-neck patterns, root-triad arpeggio overlay, ascending playback. |
| **Progressions** | Diatonic triad & seventh tables with Roman numerals and harmonic function, 9 progression templates (pop, jazz ii–V–I, 12-bar blues, flamenco…), custom numeral builder, sequenced playback in any key. |
| **Practice** | Chord-ID multiple-choice quiz, neck note-finder quiz (scores/streaks persisted), working metronome with accents and time signatures, microphone chromatic tuner with autocorrelation pitch detection and honest permission/unsupported states. |
| **Personal library** | Favorites, recently viewed chords and per-chord notes via `localStorage`. |
| **Global search** | Command palette (`/` or `Ctrl/Cmd+K`) over chords (name, symbol, notes, formula), scales and lessons, with full keyboard navigation. |

## Tech stack

- **React 18 + TypeScript + Vite** — SPA, typed end-to-end, strict mode.
- **React Router v6** — multi-page navigation.
- **Vitest + Testing Library + jsdom** — 74 tests covering engine math and rendered pages.
- **Web Audio API** — synthesized plucked-string tones, strums and metronome clicks (no audio files,
  no third-party media licenses).
- **localStorage** — zero-backend persistence.

## Getting started

Requirements: Node.js 20+ (tested on Node 22).

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
npm test           # run the full test suite once
npm run test:watch # watch mode
npm run typecheck  # strict TypeScript check
npm run build      # production build to dist/
npm run preview    # serve the production build locally
```

## Architecture

```
src/
├── core/                  # Framework-agnostic music engine (no DOM, no React)
│   ├── notes.ts           # pitch classes, enharmonics, MIDI/frequency math
│   ├── intervals.ts       # interval vocabulary and semitone mappings
│   ├── chord-definitions.ts  # all 38 chord types as interval formulas
│   ├── chords.ts          # builds concrete chords, encyclopedia index, search names
│   ├── tunings.ts         # 13 tunings (6/7/8 string) + capo application
│   ├── voicing-engine.ts  # DFS voicing generator, fingering/barre assignment, ranking
│   ├── chord-identifier.ts# reverse lookup: sounding notes -> chord names
│   ├── scales.ts          # 17 scale/mode formulas + two-octave arpeggios
│   ├── progressions.ts    # diatonic harmony, Roman numerals, templates, circle of 5ths
│   ├── audio.ts           # Web Audio synth (pluck voice, strum, metronome click)
│   └── storage.ts         # favorites / recents / notes / quiz progress
├── components/            # reusable UI (Fretboard, ChordDiagram, SearchModal, …)
├── pages/                 # routed pages (one module per product area)
├── data/lessons.ts        # structured theory curriculum content
├── hooks/                 # React bindings over core/storage
├── lib/urls.ts            # single source of truth for routes/storage keys
└── *.test.ts(x)           # Vitest suites colocated with the code they verify
```

### How the voicing engine works

1. For each string, compute every fret in the window whose pitch class is a chord tone (plus a
   muted option).
2. Depth-first search across strings, pruning branches that exceed the fret-span/muted limits,
   violate the required bass note, or cannot still cover all mandatory tones with the strings left.
   A hard node budget guarantees fast, bounded responses.
3. At each leaf, validate that (a) every non-omittable chord tone is present, (b) no foreign note
   exists, and (c) the shape is physically playable — at most four fretting fingers, with barre
   detection across contiguous strings.
4. Rank by span, position, muted strings, barre/finger cost, open-string bonus and root-position
   bass; tag each result beginner/intermediate/advanced.

The chord identifier inverts this: for every pitch class in the input as a candidate root, it
compares against every chord formula, accepting exact pitch-class sets or partial matches whose
missing tones are explicitly omittable.

### Testing philosophy

Musical truth is asserted against explicit interval formulas and known note sets, never against
generated lists — e.g. G7 must equal `G B D F`, the open C shape `x32010` must be generated, and
20/20 generated G7 voicings must identify back as G7. The React suite renders every route, drives
the fretboard and quizzes, and verifies filtering, deep links, search and error states.

## Supported vocabulary & honest constraints

- The 38 supported chord types are listed in
  [`src/core/chord-definitions.ts`](src/core/chord-definitions.ts). The system is **extensible by
  design** — a new chord is one formula entry — but it does not claim to enumerate every chord that
  exists in music.
- Search covers chord names/symbols, note sets, interval formulas, scale names and lesson text. It
  does not yet support fuzzy misspellings or full-text lyric/song search.
- Extended chords (9/11/13, altered) routinely omit the fifth (and sometimes 9/11) because six
  strings cannot hold seven tones; omittable intervals are declared per chord type and shown in the
  UI. The identifier labels such results as *partial matches*.
- Fingering output is a four-finger, physically plausible model. Thumb-fretted and partial-barre
  edge cases beyond the implemented rules are not modelled; percussion/tapping techniques are out of
  scope.
- Audio is synthesized plucked-string approximation, not sampled guitar. The tuner requires a
  microphone and a browser supporting `getUserMedia`; unsupported/denied states are surfaced rather
  than faked.
- Persistence is per-device `localStorage`. There are no accounts or cloud sync (see roadmap).

## Deployment

The build output in `dist/` is fully static and works on any static host (Netlify, Vercel, GitHub
Pages, S3/CloudFront). Because the app uses client-side routing, configure the host to serve
`index.html` as the fallback for unknown paths (e.g. Netlify `_redirects`: `/* /index.html 200`).
No environment variables or server processes are required.

## Roadmap / production next steps

- Optional accounts with cloud-synced favorites, notes and progress (the storage module is the
  single seam to replace).
- Sound-for-sound playback improvements (per-string timbre, palm mute and bend articulations).
- Fret-hand visualization of thumb fretting and advanced partial barres.
- Chord-scale relationship recommendations per voicing and MIDI export of progressions.
- Internationalization of note naming and curriculum content.
