import { Link } from 'react-router-dom';
import { CHORD_TYPES, CHORD_CATEGORIES } from '@core/chord-definitions';
import { TUNINGS } from '@core/tunings';
import { SCALE_TYPES } from '@core/scales';
import { buildChord } from '@core/chords';
import { chordPath } from '@/lib/urls';
import ChordDiagram from '@/components/ChordDiagram';
import { generateVoicings } from '@core/voicing-engine';
import { getTuning } from '@core/tunings';

const POPULAR: [string, string][] = [
  ['G', 'major'], ['C', 'major'], ['D', 'major'], ['E', 'minor'],
  ['A', 'dominant-7'], ['D', 'minor-7'], ['C', 'major-7'], ['E', 'dominant-7sharp9'],
];

const FEATURES = [
  {
    to: '/chords', glyph: '🎼', title: 'Chord encyclopedia',
    text: `${12 * CHORD_TYPES.length} chords across ${CHORD_CATEGORIES.length} families — triads to altered dominants, every note and formula shown.`,
  },
  {
    to: '/fretboard', glyph: '🎸', title: 'Interactive fretboard',
    text: 'Click strings and frets to build chords, identify what you play, overlay scales and hear synthesized audio.',
  },
  {
    to: '/theory', glyph: '📚', title: 'Music theory curriculum',
    text: 'A structured 12-lesson path from semitones to jazz reharmonization, with live guitar examples in every lesson.',
  },
  {
    to: '/scales', glyph: '🎹', title: 'Scales, modes & arpeggios',
    text: `${SCALE_TYPES.length} scales and modes mapped across the neck, with arpeggio diagrams and interval highlighting.`,
  },
  {
    to: '/progressions', glyph: '🔗', title: 'Progression explorer',
    text: 'Build Roman-numeral progressions in any key, inspect diatonic harmony and play through real song forms.',
  },
  {
    to: '/practice', glyph: '🎯', title: 'Practice tools',
    text: 'Chord and note-identification quizzes, a working metronome and a microphone tuner with pitch detection.',
  },
];

export default function HomePage() {
  const standard = getTuning('standard');

  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">Guitar reference & music theory platform</p>
        <h1>Every chord, <span className="accent">computed</span> — not copied.</h1>
        <p className="lead">
          Frethub combines a {12 * CHORD_TYPES.length}-entry chord encyclopedia, an algorithmic voicing
          engine that works in {TUNINGS.length} tunings on 6-, 7- and 8-string guitars, a fully
          interactive fretboard and a complete theory curriculum. No sign-up required — the whole
          engine runs in your browser.
        </p>
        <div className="hero-actions">
          <Link to="/chords" className="btn btn-primary">Browse the encyclopedia</Link>
          <Link to="/fretboard" className="btn">Open the fretboard</Link>
          <Link to="/theory" className="btn btn-ghost">Start learning theory</Link>
        </div>
      </section>

      <section>
        <h2 className="section-title">New here? Three steps to get going</h2>
        <div className="grid grid-3">
          <div className="card">
            <p className="eyebrow">Step 1</p>
            <h3>Learn the map of the neck</h3>
            <p className="muted small">
              Read <Link to="/theory/notes-pitch-enharmonics">notes and enharmonics</Link>, then use the
              interactive fretboard to see how each note repeats across strings.
            </p>
          </div>
          <div className="card">
            <p className="eyebrow">Step 2</p>
            <h3>Master the first-position chords</h3>
            <p className="muted small">
              Start with <Link to={chordPath('G', 'major')}>G</Link>,{' '}
              <Link to={chordPath('C', 'major')}>C</Link>,{' '}
              <Link to={chordPath('D', 'major')}>D</Link>,{' '}
              <Link to={chordPath('E', 'minor')}>Em</Link> and{' '}
              <Link to={chordPath('A', 'dominant-7')}>A7</Link> — diagrams, fingering and audio included.
            </p>
          </div>
          <div className="card">
            <p className="eyebrow">Step 3</p>
            <h3>Train your ear and recognition</h3>
            <p className="muted small">
              Take the <Link to="/practice">chord-identification quizzes</Link> and run the metronome
              while you practice. Progress is saved on this device.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Popular chords</h2>
        <div className="grid grid-4">
          {POPULAR.map(([root, typeId]) => {
            const chord = buildChord(root, typeId);
            const voicing = generateVoicings(chord.pitchClasses, standard, chord.rootPc, { maxResults: 1 })[0];
            return (
              <Link key={`${root}-${typeId}`} to={chordPath(root, typeId)} className="card feature-card" style={{ textAlign: 'center' }}>
                {voicing && (
                  <ChordDiagram voicing={voicing} tuning={standard} name={chord.shortName} compact showNotes={false} />
                )}
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {chord.tones.map((t) => t.name).join(' · ')}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Everything in one workshop</h2>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="card feature-card">
              <span className="glyph" aria-hidden="true">{f.glyph}</span>
              <h3>{f.title}</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>{f.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
