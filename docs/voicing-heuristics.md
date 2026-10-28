# Voicing search and fingering estimates

This is the maintenance record for `src/core/voicing-engine.ts` and its consumers. **A correct set of pitches is not proof that a shape is comfortable, a recommended technique, or the only way to play a chord.** Our ranking, finger choices and difficulty levels are product heuristics, not measurements calibrated against players. They are starting points that a guitarist can change.

## Musical and instrument rules

- A string contributes its tuned open MIDI note plus its relative fret. A capo raises the effective open tuning; in chord diagrams fret 0 is open at the capo, and other numbers are measured from it. The editable workbench and saved progressions instead store physical fret numbers, with 0 denoting open at the capo. String arrays run from the bass side to the treble side. The actual minimum sounding MIDI note determines the bass, even in re-entrant or alternate tunings.
- The generator uses the selected chord's pitch classes and explicit `omittable`, `requireOneOf`, and, where relevant, registered `voicingPattern` rules from `chord-definitions.ts`. An omission is not an inversion; a non-chord slash bass is an extra sounding pitch. In particular, the 7alt alteration options are alternatives, not a requirement to play every alteration at once. A generated starting reference first seeks all non-alternative tones plus at least one alteration, rather than forcing all four options. The fretboard finder calls a complete core plus at least one chosen alteration a **family match**, shows the actual alterations and ranks more-specific names ahead of the broad family. A missing assumed root or another non-alternative omission remains partial; a non-chord bass is labeled separately. Two chord names can share the same pitch classes without having the same harmonic function.
- Search enumerates muted and eligible fretted/open choices, enforcing the chosen fret range, fret **span** (highest minus lowest fretted number), muted-string limit, bass and pitch constraints. Open strings are independent of the minimum fretted position; when the minimum is above zero at least one fretted note must be in the range. The default engine limit is 250,000 search nodes. If it is hit, the returned set and its sort are incomplete: absence is not evidence a shape cannot be played, and the first result need not be globally best. The chord page reports this and lets the player narrow both ends of the fret window or change other filters. It pages through all results found rather than silently hiding shapes after a fixed display cap.
- In a generated diagram each fretted dot shows one suggested finger (1 = index through 4 = little finger); O is open, × is muted. The shape and its audio are real calculated frets, not lookup-database playback. The engine can reject valid shapes outside its model.

## Fingering model

The model first uses separate fingers if at most four fretted strings need them; otherwise it tries one barre, then two. A barre connects two or more strings at the same fret, may pass beneath *higher* fretted notes, and cannot cross an open, muted or lower-fretted string in this conservative model. When several single-barre solutions fit, lower fret comes first, then the wider grouping. Fingers are numbered in ascending fret order, then string order. This produces, for example:

| Shape, bass-to-treble | Suggested fingers | Why it is a useful regression example |
| --- | --- | --- |
| A `x02220` | `x 0 1 2 3 0` | Separate fingers are possible; an index barre is another legitimate option. |
| Em `022000` | `0 1 2 0 0 0` | Two fingers need not be replaced by a barre. |
| F `133211` | `1 3 4 2 1 1` | Low index barre passes beneath higher frets. |
| C `x35553` | `x 1 2 3 4 1` | The lower fret-3 barre is preferred; other fingerings exist. |
| C9 `x32333` | `x 2 1 3 3 3` | A higher partial barre can coexist with a lower fretted note. |
| C9 `878788` | `2 1 3 1 4 4` | Two separate partial barres, at frets 7 and 8. |

These are examples, **not** exclusive fingerings. [Fender's open-A lesson](https://www.fender.com/articles/chords/learn-to-play-the-a-chord-on-guitar) describes separate fingers and an index-barre alternative, and notes that hands and instruments vary. [All Guitar Chords' C9 examples](https://www.all-guitar-chords.com/chords/index/c/9) include a higher partial barre and other approaches. The pinned comparison dataset below includes the C and C9 shapes. None of these examples validates a universal ranking.

The model does **not** use the fretting thumb; it does not calculate joint angles, finger width, hand size, string tension, neck geometry, hand rotation or transitions; it does not model independent fingers on a string, fingertip muting, or a barre crossing a muted string that a player might damp successfully. It restricts barre count and finger assignments structurally, so it can miss playable shapes or suggest an awkward shape. Showing one solution does not rule out a more suitable alternative. This is particularly important for large stretches, high-position/open-string combinations, overlapping partial barres and instruments with more strings.

## Estimated ease and labels

`estimateVoicingEase` is an **uncalibrated sorting proxy**, not a physical measurement. Lower scores are preferred. The named constants are centralized in `VOICING_EASE_WEIGHTS`:

| Feature | Weight | Intent, not validated ergonomics |
| --- | ---: | --- |
| Fret span | +2 per fret of difference | Prefer compact fretted positions. |
| Edge mute | +0.5 each | A skipped outside string can affect strumming. |
| Interior mute | +2 each | A skip between sounding strings may require selective picking or damping. |
| Fretting finger | +0.5 each | Coarse coordination cue. |
| Suggested barre | +1.25 each | Coarse coordination cue, not proof a barre is always harder. |
| Lowest fretted position | +0.3 per fret | Favors familiar low-position shapes; higher frets are not inherently harder for every player. |
| Open string in a low shape | −0.5 each, maximum 3 | Familiarity preference only when the highest fret is at most 4; open strings with distant frets get no bonus. |

The sum is rounded to two decimals. These values are deliberately transparent but **not fitted to performance data**, and should not be interpreted as force, seconds or a universal ranking. They assume an isolated grip and general-purpose playing; for fingerpicking an interior mute may be inconsequential, while a precise rhythm, tone, transition or picking pattern may dominate difficulty. The root/bass identity does not change this score. When scores or positions tie, fewer absent optional notes and then root bass are used as musical tie-breakers, not as physical-effort claims. Alternatives within a required-one-of group are not penalized as missing notes.

The diagram's three rough labels use related but distinct rules: two barres, span at least 4, or at least two interior mutes gives **advanced**; otherwise a barre, span at least 3, four fingers, an interior mute or lowest fretted position at least 5 gives **intermediate**; the rest are **beginner**. The hover/accessibility description lists the triggered features. These are not a curriculum placement or a verdict on the player.

Saved progressions have four labels, with a manual override. The automatic estimate takes the maximum of its rough flags: wide/unmodeled grips, span 4 or highest relative fret above 8, two barres, or two interior skips can reach advanced; one barre, span 3, highest fret above 5, one interior skip, position change of at least 6 frets, or a change after less than one second can reach intermediate; four fingers, highest fret above 3 or a position change of at least 3 can reach novice. Tempo above 110/135/160 BPM can independently raise the grade to novice/intermediate/advanced. Position changes include the last-to-first transition when looping. The estimate does not grade picking-pattern coordination, tone, syncopation, expression, hands or experience. The thresholds are heuristic, not validated test cutoffs; users can choose a different label.

The [KTH fingering thesis](https://www.diva-portal.org/smash/get/diva2:668903/FULLTEXT01.pdf) illustrates that fingering can be modeled and evaluated, but its evaluated material is monophonic. It does **not** validate FretHub's chord-grip weights or labels.

## Independent comparison and maintenance

`src/core/fixtures/chords-db/guitar-subset.json` is a frets-only selection from the MIT-licensed [tabsy-gr/chords-db](https://github.com/tabsy-gr/chords-db), revision `43f8b4a7ba7b61b90bb48f8721ae918a4f421d64`. The adjacent `LICENSE.txt` preserves the source copyright and license. Source IDs retain the path back to the original data; no source fingerings are imported as the app's answers. The selected 12 roots and 38 mapped qualities cover 455 available source root/quality entries and 1,808 shapes. The source's own validation is useful comparison evidence, **not** an independent expert certification of comfort, fingering or exhaustive coverage.

At this revision, `chordsReference.test.ts` independently computes standard-tuning MIDI notes for each source shape and compares against the app's current pitch/omission policy and bounds (fret ≤14, span ≤4, at most two mutes). Of 1,808 source shapes, 98 differ in pitch/omission policy and 92 fall outside those bounds; 1,618 are eligible and 1,605 are generated (99.2%), without a truncated search. All 13 remaining examples are marked with a thumb in the source's original fingering; that observation does not prove a thumb is the only possible solution. This is a **coverage comparison**, not an estimate of correctness or ease for all chords and players. The test enforces a 99% lower bound on this pinned subset rather than claiming 100%.

To rerun with counts and missing source IDs:

```sh
FRETHUB_AUDIT_REPORT=1 npx vitest run src/core/chordsReference.test.ts
```

When changing formulas, source mappings, omissions, finger rules, score weights, bounds or labels: review the musical meaning and user-facing descriptions; add independent examples and negative tests; update the baseline deliberately with a rationale; run the reference, exhaustive bounded-enumeration, capo/tuning and UI tests. A new external dataset must have a documented license, revision, tuning, and selection process. Any proposed ergonomic ranking needs player/instrument studies before it can be described as validated.
