import { Link } from 'react-router-dom';
import { CHORD_TYPES } from '@core/chord-definitions';
import { TUNINGS, getTuning } from '@core/tunings';
import { SCALE_TYPES } from '@core/scales';
import { buildChord } from '@core/chords';
import { chordPath } from '@/lib/urls';
import ChordDiagram from '@/components/ChordDiagram';
import Icon from '@/components/Icon';
import { generateVoicings } from '@core/voicing-engine';

const POPULAR: [string, string][] = [
  ['G', 'major'], ['C', 'major'], ['D', 'major'], ['E', 'minor'],
  ['A', 'dominant-7'], ['D', 'minor-7'], ['C', 'major-7'], ['E', 'dominant-7sharp9'],
];

const DESTINATIONS = [
  { to: '/fretboard', number: '01', title: 'Fretboard workbench', text: 'Find notes, identify chords, and see scales across the neck.', meta: 'EXPLORE THE NECK' },
  { to: '/chords', number: '02', title: 'Chord encyclopedia', text: 'Understand the notes, intervals, and shapes behind a chord.', meta: 'FIND A VOICING' },
  { to: '/scales', number: '03', title: 'Scales & modes', text: 'Connect familiar patterns to the sounds they make.', meta: 'MAP A SCALE' },
];

export default function HomePage() {
  const standard = getTuning('standard');
  const featured = buildChord('G', 'major-7');
  const featuredVoicing = generateVoicings(featured.pitchClasses, standard, featured.rootPc, { maxResults: 1 })[0];

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">A WORKSPACE FOR GUITARISTS</p>
          <h1>Get to know<br /><span>your fretboard.</span></h1>
          <p>Follow an idea from a single note to a new chord, a scale, or a deeper understanding of the music you play.</p>
          <div className="hero-actions">
            <Link to="/fretboard" className="btn btn-primary">Open the fretboard <Icon name="arrow" /></Link>
            <Link to="/chords" className="btn">Browse the encyclopedia</Link>
          </div>
          <p className="home-guest-note">No account needed. Play, explore and save on this device as a guest.</p>
          <div className="home-hero-meta"><span>{CHORD_TYPES.length * 12} CHORDS</span><span>{SCALE_TYPES.length} SCALES</span><span>{TUNINGS.length} TUNINGS</span></div>
        </div>
        <article className="home-study">
          <div className="home-study-top"><span>IN THE ENCYCLOPEDIA</span><span>CHORD STUDY / 01</span></div>
          <div className="home-study-body">
            <div className="home-study-info"><span className="home-study-label">A LITTLE HARMONY</span><h2 id="featured-symbol">{featured.shortName}</h2><p>{featured.fullName}</p><div className="home-study-tones">{featured.tones.map((tone) => <span key={tone.interval}><b>{tone.name}</b><small>{tone.interval}</small></span>)}</div></div>
            {featuredVoicing && <ChordDiagram voicing={featuredVoicing} tuning={standard} rootPc={featured.rootPc} compact showNotes={false} />}
          </div>
          <Link to={chordPath(featured.rootName, featured.typeId)} className="home-study-bottom" aria-labelledby="featured-action featured-symbol"><span id="featured-action">See the chord and its voicings</span><Icon name="arrow" /></Link>
        </article>
      </section>

      <section className="home-section">
        <div className="home-section-heading"><div><p className="eyebrow">PICK UP WHERE YOU ARE</p><h2>A place to start</h2></div><span>YOUR TOOLS, ALL IN ONE PLACE</span></div>
        <div className="home-destinations">
          {DESTINATIONS.map((item) => <Link to={item.to} key={item.to} className="home-destination"><span className="home-destination-number">{item.number} /</span><div><h3>{item.title}</h3><p>{item.text}</p><small>{item.meta} <Icon name="arrow" /></small></div></Link>)}
        </div>
      </section>

      <section className="home-section home-popular-section">
        <div className="home-section-heading"><div><p className="eyebrow">A FEW FAMILIAR SOUNDS</p><h2>Popular chords</h2></div><Link to="/chords" className="text-link">All chords <Icon name="arrow" /></Link></div>
        <div className="home-popular">
          {POPULAR.map(([root, typeId]) => {
            const chord = buildChord(root, typeId);
            const voicing = generateVoicings(chord.pitchClasses, standard, chord.rootPc, { maxResults: 1 })[0];
            return <Link key={`${root}-${typeId}`} to={chordPath(root, typeId)} className="home-chord">{voicing && <ChordDiagram voicing={voicing} tuning={standard} name={chord.shortName} rootPc={chord.rootPc} compact showNotes={false} />}<span>{chord.tones.map((tone) => tone.name).join(' · ')}</span></Link>;
          })}
        </div>
      </section>

      <section className="home-section home-learning">
        <div><p className="eyebrow">KEEP GOING</p><h2>Make the connections.</h2><p>Learn the why behind the shapes, then put it into practice.</p></div>
        <div className="home-learning-links">
          <Link to="/theory"><span><b>Music theory</b><small>A guided path, from notes to harmony.</small></span><Icon name="arrow" /></Link>
          <Link to="/progressions"><span><b>Progression explorer</b><small>Hear how chords move together.</small></span><Icon name="arrow" /></Link>
          <Link to="/practice"><span><b>Practice</b><small>Train your ears and learn the neck.</small></span><Icon name="arrow" /></Link>
          <Link to="/tuner"><span><b>Guitar tuner</b><small>Get every string ready to play.</small></span><Icon name="arrow" /></Link>
          <Link to="/metronome"><span><b>Metronome</b><small>Find your pulse and practise your timing.</small></span><Icon name="arrow" /></Link>
        </div>
      </section>
    </div>
  );
}
