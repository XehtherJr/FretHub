# FretHub

A local-first guitar reference and learning workspace: an interactive fretboard, a calculated chord
encyclopedia, scales, progressions, hands-on theory, and practical tools. **No account is required**
to browse, play sounds, practise, or save a library on the current device.

## What is included

| Area | Features |
| --- | --- |
| Fretboard | Equal-tempered physical fret geometry, 6/7/8-string tunings, capo, keyboard navigation, note selection, strum or arpeggiate selected strings, chord identification, scale and root-triad overlays. |
| Chords | 54 chord/voicing definitions × 12 roots = 648 calculated entries, including suspended extensions and altered dominants. Search by name, symbol, notes or formula; generated voicings, fingering, barres and inversions. |
| Sound | Locally hosted steel-string acoustic guitar recordings with pitch-corrected samples, strumming and a synthesized fallback if a sample cannot load. |
| Theory | 15 ordered lessons with interactive labs, glossary and optional saved checks. The connected triad study follows a chord from its notes through the neck, inversions, scales, application and a two-key challenge. |
| Scales and progressions | 17 scales and modes, arpeggio overlays, playable scales, diatonic chord tables and progression templates. |
| Tuner | A local microphone tuner with automatic open-string targets, optional chromatic mode, selectable reference notes, 13 tunings and real-time pitch feedback. |
| Metronome | An audio-clock metronome with steady, timing-coach and disappearing-click modes; tap tempo, quarter- and eighth-note meters, group accents and optional device-latency calibration. |
| Practice | Chord and note quizzes, with local scores and streaks. The tuner and metronome are also accessible from Practice for existing users. |
| Library | Favorites, chord notes, recent chords and lesson progress work locally. An optional passwordless account can sync favorites, notes and lesson challenges when a deployment configures the cloud service. |

## Getting started

Use Node.js **22.12 or later** (Node 22 LTS is recommended; `.nvmrc` is provided).

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and interaction tests
npm run typecheck  # strict TypeScript check
npm run build      # production output in dist/
npm run preview    # serve the production build
```

The static app works without any environment variables. The tuner and timing coach require a
secure context (HTTPS or localhost), Web Audio and a microphone permission grant. They process
microphone audio in the browser; no recording or microphone audio is uploaded. The timing coach
works best with headphones, one clear attack per beat, and calibration for device latency.

### Optional cross-device library sync

Cross-device sync is implemented with Supabase Auth and a row-level-secured Postgres table. It is
**not enabled automatically**: an operator must configure a Supabase project for the deployment.
Without that configuration, the site displays an honest guest-only state and all local features
continue working. Do not put service-role keys or other secrets in a browser build.

1. Create a Supabase project and enable email magic-link authentication. Run
   [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor. The table's row-level security
   permits authenticated users to read, insert and update **only their own** library row.
2. In Supabase Authentication URL Configuration, set the site URL and allow the deployed
   `/library` redirect URL (also add the preview URL when needed).
3. Copy `.env.example` to `.env.local` for local development, or set the variables in your host's
   build settings. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's **public**
   URL and publishable/anon key. Restart the dev server or rebuild the deployment. Never use the
   secret/service-role key here.
4. In Library, request an email link and open it in the **same browser** that requested it. Repeat
   on another device to access the same account. Authentication emails and delivery are provided by
   the configured Supabase project; production projects should configure appropriate email delivery.

On first sign-in, the current device's favorites, chord notes and completed lesson challenges are
merged into the account. Per-item timestamps and deletion markers preserve removals; revision-checked
writes retry if two devices update concurrently. Changes sync after local edits, when the page is
focused or reconnected, and via **Sync now**. Notes changed on two devices use the most recent
per-item timestamp, so device clocks should be reasonably accurate. Recently viewed chords and
practice quiz totals remain local. Signing out leaves a local copy on that browser; clear site data
on shared devices if needed. Clearing local data before it has synced removes the local copy.

## Architecture

```
src/
├── core/                    # Framework-independent music, audio and storage logic
│   ├── notes.ts, intervals.ts, chords.ts, chord-definitions.ts
│   ├── tunings.ts, voicing-engine.ts, chord-identifier.ts
│   ├── scales.ts, progressions.ts, triadRelationships.ts, audio.ts
│   ├── pitchDetection.ts, pitchTracker.ts, tuner.ts  # pitch and tuning guidance
│   ├── rhythm.ts            # beat offsets, timing feedback, silent-bar logic
│   └── storage.ts           # local library and timestamped sync snapshots
├── components/              # Fretboard, chord charts, tuner, metronome, lesson labs
├── data/                    # theory curriculum and challenge questions
├── hooks/                   # local storage, audio input and optional account sync
├── lib/                     # URLs, fret geometry and cloud sync
└── pages/                   # routed product areas
public/audio/guitar/         # CC0 acoustic guitar recordings, with attribution
public/audio/onset-detector.js # local-only AudioWorklet transient detector
supabase/schema.sql          # optional account table and row-level policies
```

The voicing engine searches string/fret combinations, prunes unplayable spans, supports open and
muted strings, assigns up to four fingers, detects barres and ranks practical results. Both the
voicing engine and chord identifier use the lowest *sounding pitch*, not just the first played
string, for inversions (including in re-entrant tunings). Fingering and playability are conservative
heuristics, not a guarantee; some valid shapes may be omitted. Chord and scale tone names follow
interval spelling (for example C minor uses E♭); fretboard pitch labels can be switched between
sharps and flats.

The shareable `/theory/triads/explore` route accepts root, quality, scale and instrument settings.
Its optional E/A CAGED examples apply only to major chords in standard six-string tuning; they are
an introduction, not a complete map. Scale containment is shown as a note relationship rather than
a promise that scales are interchangeable in every musical context. The two-key application
challenge offers optional root-finding and semitone-counting guidance, then resets the guide for a
second key and string. It saves separately from lesson checks using the existing local library/sync
snapshot. The exercise can extend the displayed fret range to make its root-to-third path reachable
above a high capo.

The metronome clicks each notated denominator note: quarter notes in /4 and eighth notes in /8.
BPM is the click rate, so 6/8 at 120 BPM means 120 eighth-note clicks per minute, grouped 3+3;
12/8 uses 3+3+3+3. Eighth-note meters allow up to 480 clicks per minute; the interface also shows
the equivalent dotted-quarter rate for 6/8 and 12/8. The 7/8 grouping is selectable (2+2+3, 2+3+2
or 3+2+2). Bar downbeats and
secondary group starts have distinct accents; disappearing mode mutes complete bars in each meter.

## Audio and asset credits

The acoustic guitar samples were recorded by **Jeff Learman** on a 2017 Martin HD28 and are from
the [Discord SFZ General MIDI Bank](https://github.com/sfzinstruments/Discord-SFZ-GM-Bank).
The source instrument declares them **CC0**. The unchanged WAVs and details are in
[`public/audio/guitar/README.md`](public/audio/guitar/README.md). FretHub adjusts playback rate to
correct each recording's measured pitch and transpose neighboring notes. The sound is sampled, not
a claim to reproduce every guitar articulation. Samples are served from the app's own host.

## Deployment and constraints

The frontend builds to static files and can be deployed to Netlify, Vercel, or another static host.
Configure an SPA fallback to `index.html`; `public/_redirects` provides it for Netlify. Node 22 is
specified for compatible builds. A Supabase project is only needed for the optional account feature.

- The chord vocabulary is extensive but not exhaustive. The fretboard finder reports exact
  pitch-class matches, labels omitted tones in partial matches, and distinguishes a non-chord slash
  bass from an inversion. It considers an unplayed root only when the player chooses the optional
  root hint, including for two-note third-and-seventh shells. Rootless voicings and shared note
  sets are interpretations, not proof of harmonic function. The specific So What voicing requires
  its actual ascending registers (e.g. D–G–C–F–A),
  not merely the same pitch classes. Chord-reference links retain the bass, tuning and capo but
  generate their own fingerings; they are not a copy of the selected fingering.
- The tuner estimates pitch and can be affected by noise, string harmonics and microphone quality.
  Auto mode compares against the selected tuning's nearest open string; chromatic mode compares
  against the nearest semitone. Select the string manually if it is far out of tune, verify the
  target and octave, and turn the peg in small steps. Reference playback pauses pitch feedback so
  the speaker sound is not mistaken for the guitar. The target-based approach was informed by the
  archived [Google Guitar Tuner](https://github.com/googlearchive/guitar-tuner); the implementation
  here is independent.
- The timing coach estimates individual note attacks against the beat. Device/browser audio latency,
  speaker bleed and noisy rooms affect results; use headphones and calibrate. It does not record or
  judge the musicality of a performance. Background-tab throttling can affect metronome scheduling.
- The first sample playback may take a moment on a slow connection. A synthesized fallback keeps
  playback available if a sample is unavailable; reduced-data settings skip automatic prefetching.
- Cloud sync requires a configured project and working email delivery. It is not a substitute for a
  backup, and the local browser can retain signed-out data.

## License

FretHub source is MIT licensed; see [`LICENSE`](LICENSE). The separately credited audio recordings are
CC0 as described above.
