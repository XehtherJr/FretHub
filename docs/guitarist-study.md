# Guitarist usability and recall study — protocol, not results

No study has been run for this document. Automated tests can show that controls, calculated answers,
audio scheduling and persistence work in tested scenarios; they cannot show that a person learns,
retains an idea, plays comfortably, or likes the sound. Use this protocol to gather those observations
before redesigning the progression or claiming learning outcomes.

## Questions and participants

- Can a guitarist who knows a few open chords find and complete the triad learning loop without
  outside help? Where do vocabulary, navigation, the instrument settings, or feedback cause trouble?
- Can they apply the third-of-a-chord relationship to a different root and string immediately and
  after a delay, **before** seeing hints? Can they explain their choice?
- Can people find and use the tuner, progression editor and optional local-only library? What do they
  notice about the sampled guitar sound on their own equipment?

Recruit approximately 8–12 people for an exploratory round, including several beginners who know
only a few open chords and several intermediate players, with varied devices and accessibility needs.
Record experience and instrument/device type, not assumptions about ability. This is a small,
convenience sample: it can identify usability problems, not establish population-wide effectiveness.
Obtain informed consent, explain the tasks test the product rather than the person, and allow pauses,
withdrawal, or declining recording. Use anonymous participant IDs; do not collect real passwords,
private library notes, audio/video, or contact information in the study results. Obtain separate
permission before any recording and follow the applicable privacy and retention rules.

## Setup

Use a deployed build with no real account or cloud data, a fresh guest browser profile, standard
six-string tuning, no capo, and a guitar if available. Do not require microphone permission for the
learning tasks. Use a second disposable profile/account only if explicitly testing sync. Provide a
quiet room or headphones for the audio task; record browser/OS, screen size, guitar type and whether
headphones were used. State that guide buttons are available, but do not direct people to them or
explain musical terms while measuring unassisted work. A facilitator may help after an agreed stop
point; record exactly what was prompted.

## Session 1: baseline, practice and immediate transfer

1. **Baseline, before the app:** ask the participant to describe a root and a third in their own
   words. On a standard-tuned guitar or blank neck diagram, point out D at fret 3 of the B string
   and ask them to find its major third on that same string. Let them say “I don't know.” Record the
   answer, explanation, time and whether help was needed; do not give feedback yet.
2. **Find the path:** open the home page. Ask them to learn how one familiar chord's notes relate
   across the neck and use the idea somewhere new. Observe their own route to Theory and the triad
   study. Ask them to think aloud without teaching them what to click.
3. **Practice:** let them explore and attempt the two-key challenge. Record completion, number and
   type of guide/hint requests, missteps, time, confusing terms and any facilitator intervention.
   A saved completion flag is a record of an attempt, not proof of mastery.
4. **Immediate transfer, without the app or notes:** point out B♭ at fret 6 of the high E string and
   ask for its major third on that same string and why. Record their first answer before feedback.
   If they cannot answer, offer the same preplanned hint to everyone: “A major third is four frets
   higher on the same string,” and record the assisted answer separately.
5. **Other product tasks, after the learning measure:** ask them to make and save a two-chord
   progression with a picked pair and a rest, then reload and play it. Ask how to use the app without
   an account; optionally try the tuner with informed microphone permission and listen to the chord
   samples. Capture observed obstacles and their own comments, not assumed causes.

For facilitator scoring, the baseline answer is F♯ at fret 7; immediate transfer is D at fret 10.
A fret position and enharmonic spelling that sound the intended pitch are acceptable. Score position,
explanation and assistance separately. Do not tell a participant the key until their response is
recorded. Counterbalance equivalent prompts across participants if comparing tasks, and record the
assignment; different strings, root familiarity, guitar range and diagrams can affect difficulty.

## Session 2: delayed recall

After 24–48 hours, before showing hints, ask the participant to explain the same relationship and
point out G at fret 5 of the D string; ask for its **major** third on that string. The answer is B at
fret 9. Record unassisted accuracy, explanation, elapsed time and assistance as above. As a separate
extension, ask for the **minor** third from that same root: B♭ (enharmonic A♯) at fret 8. Score this
quality-change transfer separately from recall of the practiced major-third relationship. Then let
them check with FretHub and discuss what helped or confused them. If a delayed session is missed,
report it as missing rather than incorrect.

## Analysis and reporting

Summarize counts and task-level observations, completion and hint rates, unassisted versus assisted
answers, and the denominator for each measure. Report baseline, immediate and delayed results
separately, with uncertainty and missing follow-ups. Separate observations from participant quotes and
interpretations. A small uncontrolled study cannot establish causation or a learning gain; use a
larger, preregistered comparison with equivalent/counterbalanced assessments to investigate those
claims. Prioritize the most consequential observed problems, retest fixes with new participants,
and document what changed, what did not, and what remains unknown.
