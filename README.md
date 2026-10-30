# FretHub

A local-first guitar reference and learning workspace: an interactive fretboard, a calculated chord
encyclopedia, scales, progressions, hands-on theory, and practical tools. **No account is required**
to browse, play sounds, practise, or save a library on the current device.

## What is included

| Area | Features |
| --- | --- |
| Fretboard | Equal-tempered physical fret geometry, 6/7/8-string tunings, capo, keyboard navigation, note selection, strum or arpeggiate selected strings, chord identification, scale overlays and a custom progression builder. |
| Chords | 54 chord/voicing definitions × 12 roots = 648 calculated entries, including suspended extensions and altered dominants. Search by name, symbol, notes or formula; generated voicings, fingering, barres and inversions. |
| Sound | Locally hosted steel-string acoustic guitar recordings with pitch-corrected samples, strumming and a synthesized fallback if a sample cannot load. |
| Theory | 15 ordered lessons with interactive labs, glossary and optional saved checks. The connected triad study follows a chord from its notes through the neck, inversions, scales, application and a two-key challenge. |
| Scales and progressions | 17 scales and modes, arpeggio overlays, playable scales, diatonic chord tables and progression templates. |
| Tuner | A local microphone tuner with automatic open-string targets, optional chromatic mode, selectable reference notes, 13 tunings and real-time pitch feedback. |
| Metronome | An audio-clock metronome with steady, timing-coach and disappearing-click modes; tap tempo, quarter- and eighth-note meters, group accents and optional device-latency calibration. |
| Practice | Chord and note quizzes, with local scores and streaks. The tuner and metronome are also accessible from Practice for existing users. |
| Library | Favorites, chord notes, custom progressions, recent chords and lesson progress work locally. An optional email/password account can sync favorites, notes, saved progressions and lesson challenges when a deployment configures the cloud service. |

## Getting started

Use Node.js **22.12 or later** (Node 22 LTS is recommended; `.nvmrc` is provided).

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
npm test           # unit and interaction tests
npm run typecheck  # strict TypeScript check
npm run build      # production output in dist/
npm run preview    # serve the production build at http://127.0.0.1:4173
```

The dev and preview servers bind to **127.0.0.1** by default and reject other DNS hostnames unless
explicitly allowed. Vite also accepts `localhost`, `.localhost` names and IP-literal Host headers;
network binding and a trusted proxy therefore remain important. To share one deliberately behind a
trusted HTTPS proxy, supply the exact proxy hostname (or a comma-separated list) and explicitly bind
the server to a network interface, for example:

```bash
FRETHUB_ALLOWED_HOSTS=preview.example.com npm run dev -- --host 0.0.0.0
```

Do not use `true`, wildcards, URLs, IP addresses or suffix-wide host permissions. Set this as a shell
environment variable, not a Vite client variable. Exposing the dev server can reveal local source
and files; use a trusted network/proxy, and remove the opt-in when finished. Production builds are
static files and should be served by a properly configured host, not Vite's development server.

### Automated verification

```bash
npx playwright install chromium  # once; Linux may also need: npx playwright install-deps chromium
npm run test:e2e                # builds, serves and tests a production build in Chromium
```

The GitHub Actions workflow runs unit/interaction tests, TypeScript, a production build and the
browser suite on pushes and pull requests. Browser tests use a loopback preview, fake Supabase
configuration and an intercepted in-memory service; external browser requests and service workers
are blocked. The browser suite writes its fake build to the ignored `.e2e-dist/` directory, separate
from `dist/`. Tests cover two isolated browser contexts with a forced revision race, v2 migration,
pattern save/reload and Web Audio scheduling, learning navigation, a synthetic tuner signal, and
host restrictions. Chromium uses a fake microphone and auto-accepts its permission UI; a browser
Permissions Policy supplies the real denied-access error path. This does not test a physical
microphone or the user's browser permission prompt. These tests are not a live Supabase test, a
human audio audition, or evidence of learning. See the [guitarist study protocol](docs/guitarist-study.md)
for a proposed usability and delayed-recall study; it contains no results.

The static app works without any environment variables. The tuner and timing coach require a
secure context (HTTPS or localhost), Web Audio and a microphone permission grant. They process
microphone audio in the browser; no recording or microphone audio is uploaded. The timing coach
works best with headphones, one clear attack per beat, and calibration for device latency.

### Custom progressions

Open **Build a progression** on the fretboard. Select notes directly, or type a chord (for example
`Am7` or `Bbmaj7/D`) or choose its root and type, then show a suggested voicing on the neck. Add it
beside the arpeggiate button and repeat in any order. A recognized chord name must be shown first,
unless you explicitly use it as a label for your current frets. You can edit the selected shape,
reorder or remove chords, choose how many quarter-note beats each lasts, change tempo, and loop
playback. **Save progression** opens a dialog for the name and difficulty. The workbench displays the
bass-side string at the top; the selection arpeggio has slow, medium and fast speeds.

Under **Picking & strumming**, choose one downstrum per chord (the default for older saves), a
low-to-high arpeggio, or a custom pattern. Pick the number of equal steps per quarter-note beat.
The same pattern repeats within each chord and restarts at the next chord. A four-beat chord at one
step per beat plays only its first four steps: increase the chord's beats or select more steps per
beat if the pattern needs more room. The editor warns when steps won't fit or a selected string is
muted. New custom patterns start empty. Enter string numbers or open tuning names, with spaces or
dashes between steps: `A-D-G-B-G-G+E4` (or `5 4 3 2 3 3+1` in standard tuning) ends by picking G
and high E at the same time. Use `down`, `up` and `rest` for strums and rests; a rest stops ringing
notes. String names refer to the tuning before the capo; include the octave or use a number when a
name is ambiguous. **Build steps with buttons** offers the same controls without typing: selected
strings do not become part of the pattern until **Add picked step** is pressed. Patterns are limited
to 64 steps.

A saved progression retains its pattern, exact frets and muted/open strings, tuning and capo, not just chord
names. Load it from the builder or Library; loading restores its instrument setup. Every progression
has a beginner, novice, intermediate or advanced label. Automatic labels are **rough estimates**
based on span, likely fingering, position changes, chord duration and tempo; they do not judge
musical difficulty or picking-pattern coordination. Choose a label manually if it fits better. Suggested voicings and automatic
grades are heuristics and do not guarantee that a shape is comfortable for every player.

### Optional cross-device library sync

Everything remains usable without signing in. Sync uses Supabase Auth and a row-level-secured
Postgres table; each deployment must provide its own configuration. Without it, the app clearly
remains guest-only. No service-role key or other secret belongs in a browser build.

1. In the Supabase project, enable email/password sign-in and signups, and **disable email
   confirmation** for this immediate-signup flow. Run [`supabase/schema.sql`](supabase/schema.sql)
   in the SQL editor; the library table's RLS permits authenticated users to read, insert and update
   only their own row. The idempotent schema also installs the optional email-verification functions
   and updates the default to snapshot version 3 without replacing existing rows.
2. Copy `.env.example` to `.env.local` for local development. Set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` to the project's **public project URL and publishable (or legacy anon)
   key**. Restart the dev server. Keep `.env.local` out of Git and never use a secret/service-role key.
3. For Netlify, set the same two variables in the site's environment/build settings for the intended
   deploy contexts and redeploy. Other static hosts need equivalent build-time variables: Vite embeds
   them when building, so local `.env.local` alone does not configure a deployed site.
4. For **email links, optional verification and password reset**, set the real deployed origin as
   Supabase Auth's Site URL and allow that origin's `/library`, `/account/verify`, and `/account/reset`
   redirect URLs. Add only the development/preview origins you actually use. Configure suitable
   production SMTP and email templates; Supabase's default mail service is restricted and rate-limited.
   The static host must serve `index.html` for all three routes. The app uses PKCE, so links must be
   opened in the **same browser and site origin** where they were requested.
5. Use the **Sign in** link in the header or open Library, choose **Create account**, and enter an
   email and password of at least eight characters. Sign in with the same credentials on another
   device. No confirmation email is needed to start using the account. In the signed-in account area,
   **Verify email (optional)** sends a link; **Forgot password?** sends a password-reset link.
   Optional email-link sign-in remains available, including for accounts without passwords.

**Security and recovery:** auto-confirmation is not proof of mailbox access: anyone can register an
address they do not control, potentially preventing its real owner from using it. The optional badge
is recorded by a server function only after a fresh signed PKCE email-link/recovery session and is
invalidated if the Auth email changes. It means mailbox access was demonstrated at that time, not
exclusive account ownership. It does not prevent fraudulent registrations. Password recovery and
verification require a reachable mailbox, approved redirect URLs and working email delivery; the
app cannot make those guarantees on an unconfigured deployment. Avoid using the library for sensitive
information, use a unique password, protect shared devices, and configure appropriate abuse controls.
The rollback-only [`supabase/tests/optional_email_verification.sql`](supabase/tests/optional_email_verification.sql)
checks the server proof rules on a test database without sending mail. The read-only
[`supabase/tests/library_read_rls.sql`](supabase/tests/library_read_rls.sql) checks owner and
non-owner read visibility using simulated claims when at least one library row exists; it does not
exercise real authentication, write policies, or two-device sync.

The first account used on a device adopts its guest library. Later account switches keep separate
local library copies; signing out leaves the last copy available locally, and signing into that same
account merges any subsequent guest edits. Favorites, notes, lesson challenges and progressions use
per-item timestamps and deletion markers; revision-checked writes retry concurrent changes. Changes
sync after edits, on focus/reconnection, or with **Sync now**. If the same item changes on multiple
devices, one version wins according to device timestamps (with a deterministic tie-break); simultaneous
edits to the same item can overwrite one another, especially if clocks differ. Sync before editing
on another device and avoid editing the same item concurrently. The exact policy and its limits are
in [sync conflict policy](docs/sync-conflicts.md). Unsupported or malformed cloud **and local**
library data stop writes/sync rather than being silently discarded; the original local or cloud
data are left in place. A note or progression draft stays tied to the account where it was started;
if the account changes, switch back or copy the draft before starting over. Current FretHub tabs
coordinate account changes and local edits through IndexedDB, and a write-ahead journal allows interrupted multi-key writes to be rolled back. If coordination or recovery
is unavailable, writes fail rather than proceeding without the lock. This is not a substitute for a
backup: storage failures can prevent recovery until storage is available again. Refresh or close **all**
older app tabs after updating, because older clients do not participate in this coordination and can
still interfere. Recent chords and practice quiz totals stay on the device rather than syncing. Clearing
site data removes local copies and any recovery journal, including changes that have not synced; do so
on shared devices after signing out if privacy matters. Sync is not a backup. Version-1 and version-2
snapshots are upgraded without changing existing progression playback. Older app versions cannot safely
read version-3 snapshots with picking patterns and must be updated rather than allowed to overwrite them.

See [staging validation](docs/staging-validation.md) for the checks still required with real auth,
email, devices and microphones, and [performance notes](docs/performance-notes.md) for the measured
local baseline and its limitations.

#### Configure production email

Supabase's default email service only sends to addresses on the project's team; it is not a
production mail service. To send verification and password-reset links to other users:

1. Choose a transactional email provider that supports SMTP and verify a sender address/domain with
   that provider. Obtain its SMTP host, port, username and password. Use the port and TLS settings
   recommended by the provider.
2. In the Supabase dashboard, open the project’s **Authentication → SMTP Settings**, enable custom
   SMTP, and enter the sender address/name and provider settings there. Keep SMTP credentials out of
   the repository, frontend environment variables and chat. See the
   [Supabase custom SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).
3. Leave email confirmation disabled if immediate signup without verification is desired. Confirm
   the Site URL and the three redirect URLs listed above point to the deployed app, and review the
   Auth email rate limit for the provider's plan.
4. After deploying this app, request a reset link and an optional verification link for a mailbox you
   control. Open each link in the same browser and origin that requested it, and verify delivery and
   the resulting account screen. Browser-only and mocked tests cannot verify real email delivery.

## Architecture

```
src/
├── core/                    # Framework-independent music, audio and storage logic
│   ├── notes.ts, intervals.ts, chords.ts, chord-definitions.ts
│   ├── tunings.ts, voicing-engine.ts, chord-identifier.ts
│   ├── scales.ts, progressions.ts, triadRelationships.ts, audio.ts
│   ├── userProgressions.ts, progressionAudio.ts # saved shapes, grading and playback
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
supabase/schema.sql          # optional account tables, policies and email-proof functions
```

The voicing engine searches string/fret combinations within a chosen span, supports open and muted
strings, and suggests up to four fingers and two barres. Both the voicing engine and chord identifier
use the lowest *sounding pitch*, not just the first played string, for inversions (including in
re-entrant tunings). Fingering and difficulty are conservative, uncalibrated heuristics, not a
guarantee; the model does not use a fretting thumb, and some valid shapes may be omitted. Chord
details sort by position or estimated ease, expose position and mute filters, and page through all
found results. The safety limit is reported if it stops the search; narrow the filters to explore
further. See [voicing heuristics and evidence](docs/voicing-heuristics.md) for the exact rules,
limitations and independent reference comparison. Chord and scale tone names follow interval spelling
(for example C minor uses E♭); fretboard pitch labels can be switched between sharps and flats.

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
  pitch-class matches, labels omitted tones in partial matches, treats choices such as 7alt as a
  family rather than requiring every alteration, and distinguishes a non-chord slash bass from an inversion. It considers an unplayed root only when the player chooses the optional
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
- Cloud sync requires a configured project, build-time public configuration and network access. It
  is not a substitute for a backup, and the local browser can retain signed-out data. Optional
  email links and recovery need configured redirects and email delivery; immediate signup has the
  ownership risks described above.

## License

FretHub source is MIT licensed; see [`LICENSE`](LICENSE). The separately credited audio recordings are
CC0 as described above.
