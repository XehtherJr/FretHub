import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buildChord } from '@core/chords';
import { intervalSemitones } from '@core/intervals';
import { CYCLE_OF_FIFTHS, pcOctaveToMidi, pcToNote } from '@core/notes';
import { buildScale, SCALE_TYPES } from '@core/scales';
import { getTuning } from '@core/tunings';
import { generateVoicings } from '@core/voicing-engine';
import { getAudioContext, isAudioSupported, playClick, playMidi, playSequence, strum } from '@core/audio';
import { chordPath, scalePath, triadStudyPath } from '@/lib/urls';
import ChordDiagram from './ChordDiagram';

function LabFrame({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return <section className="lesson-lab"><p className="eyebrow">{kicker} · TRY IT YOURSELF</p><h2>{title}</h2>{children}</section>;
}

function StringLab() {
  const tuning = getTuning('standard');
  const [selected, setSelected] = useState<number | null>(null);
  return <LabFrame kicker="STRING EXPLORER" title="Hear the open strings">
    <p className="small muted">Tap from thickest to thinnest. Each note is a real acoustic guitar recording.</p>
    <div className="lesson-strings">{tuning.strings.map((string, index) => <button key={index} type="button" aria-pressed={selected === index} onClick={() => { setSelected(index); playMidi(pcOctaveToMidi(string.pc, string.octave)); }}><small>STRING {6 - index}</small><strong>{string.label}</strong><span>{index === 0 ? 'LOW' : index === 5 ? 'HIGH' : 'PLAY'}</span></button>)}</div>
    <Link className="text-link" to="/tuner">Open the tuner →</Link>
  </LabFrame>;
}

function DiagramLab() {
  const tuning = getTuning('standard');
  const chord = buildChord('C', 'major');
  const voicing = useMemo(() => generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxResults: 1 })[0], [tuning, chord.rootPc, chord.pitchClasses.join(',')]);
  return <LabFrame kicker="DIAGRAM EXPLORER" title="A C major shape">
    <div className="lesson-diagram-lab">{voicing && <ChordDiagram voicing={voicing} tuning={tuning} name="C" rootPc={chord.rootPc} showNotes={false} />}<div><p>The grid is the guitar neck. Read the strings from thick to thin, left to right. Follow the dots; O means open and × means skip.</p>{voicing && <button type="button" className="btn btn-primary btn-sm" onClick={() => strum(voicing.midi)}>Hear the shape</button>} <Link className="text-link" to={chordPath('C', 'major')}>Explore C major →</Link></div></div>
  </LabFrame>;
}

function RhythmLab() {
  const [steps, setSteps] = useState([true, false, true, false, true, false, true, false]);
  const labels = ['1', '&', '2', '&', '3', '&', '4', '&'];
  const play = () => {
    const audio = getAudioContext();
    const start = audio.currentTime + 0.08;
    steps.forEach((on, index) => { if (on) playClick(index === 0, start + index * (60 / 90 / 2)); });
  };
  return <LabFrame kicker="RHYTHM BUILDER" title="Make a one-bar pattern">
    <p className="small muted">Turn on the notes you want to hear. The numbers are beats; “&” sits halfway between them.</p>
    <div className="rhythm-steps">{labels.map((label, index) => <button type="button" key={index} aria-label={`Step ${index + 1}, ${label === '&' ? 'and' : `beat ${label}`}`} aria-pressed={steps[index]} onClick={() => setSteps((previous) => previous.map((on, i) => i === index ? !on : on))}>{label}</button>)}</div>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={play} disabled={!steps.some(Boolean)}>Play pattern · 90 BPM</button><Link className="text-link" to="/metronome">Practise with the metronome →</Link></div>
  </LabFrame>;
}

function NoteLab() {
  const [step, setStep] = useState(0);
  return <LabFrame kicker="NOTE EXPLORER" title="Move one fret at a time">
    <p className="small muted">Start on C. Each step to the right is one fret higher; after 12 you reach C again, one octave higher.</p>
    <div className="lesson-note-scroll"><div className="lesson-note-strip">{Array.from({ length: 13 }, (_, i) => <button type="button" key={i} aria-pressed={step === i} onClick={() => { setStep(i); playMidi(60 + i); }}><small>{i}</small><strong>{pcToNote(i)}</strong></button>)}</div></div>
    <p className="small lesson-lab-caption">{step === 0 ? 'Starting note' : `${step} ${step === 1 ? 'fret' : 'frets'} above C`} · {pcToNote(step)}{step === 12 ? '5' : '4'}</p>
  </LabFrame>;
}

function IntervalLab() {
  const [kind, setKind] = useState<'major' | 'minor'>('major');
  const third = buildChord('C', kind).tones[1];
  const play = () => playSequence([60, 60 + intervalSemitones(third.interval)], 0.45, 0.8);
  return <LabFrame kicker="INTERVAL COMPARISON" title="One fret changes the third">
    <p className="small muted">Keep C as the starting note. Compare the distance to E with the distance to E flat; then listen to those same notes inside a chord.</p>
    <div className="row lesson-choice-row"><button type="button" className="btn btn-sm" aria-pressed={kind === 'major'} onClick={() => setKind('major')}>Major third</button><button type="button" className="btn btn-sm" aria-pressed={kind === 'minor'} onClick={() => setKind('minor')}>Minor third</button></div>
    <div className="lesson-chord-result"><div><span className="lesson-chord-name">C → {third.name}</span><small>{third.intervalName}</small></div><p>{intervalSemitones(third.interval)} semitones above C{kind === 'minor' ? ': one fewer than the major third.' : '.'}</p></div>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!isAudioSupported()} onClick={play}>Hear the interval</button><Link className="text-link" to={triadStudyPath('C', kind)}>Find it in a chord →</Link></div>
  </LabFrame>;
}

function InversionLab() {
  const [bass, setBass] = useState(0);
  const chord = buildChord('C', 'major');
  const ordered = [...chord.tones.slice(bass), ...chord.tones.slice(0, bass)];
  const midi = [...chord.tones.slice(bass).map((tone) => 60 + intervalSemitones(tone.interval)), ...chord.tones.slice(0, bass).map((tone) => 72 + intervalSemitones(tone.interval))];
  return <LabFrame kicker="INVERSION COMPARISON" title="Same chord, different lowest note">
    <p className="small muted">C, E and G remain the same chord tones. Changing which is lowest changes the inversion—not the chord’s root.</p>
    <div className="row lesson-choice-row">{chord.tones.map((tone, index) => <button key={tone.interval} type="button" className="btn btn-sm" aria-pressed={bass === index} onClick={() => setBass(index)}>{tone.name} in bass</button>)}</div>
    <div className="lesson-chord-result"><div><span className="lesson-chord-name">{buildChord('C', 'major', chord.tones[bass].pc).shortName}</span><small>{bass === 0 ? 'Root position' : bass === 1 ? 'First inversion' : 'Second inversion'}</small></div><p>Low to high: {ordered.map((tone) => tone.name).join(' · ')}</p></div>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!isAudioSupported()} onClick={() => strum(midi)}>Hear this inversion</button><Link className="text-link" to={triadStudyPath('C', 'major')}>Find playable shapes →</Link></div>
  </LabFrame>;
}

function ChordLab() {
  const [type, setType] = useState('major');
  const chord = buildChord('C', type);
  const qualities = [
    ['major', 'Major'], ['minor', 'Minor'], ['augmented', 'Augmented'], ['diminished', 'Diminished'], ['dominant-7', 'Dominant 7'], ['major-7', 'Major 7'],
  ];
  return <LabFrame kicker="CHORD LAB" title="Change a note, change the sound">
    <p className="small muted">Keep C as the root and compare these chord qualities. An augmented triad raises the fifth by one fret.</p>
    <div className="row lesson-choice-row">{qualities.map(([id, label]) => <button key={id} type="button" className="btn btn-sm" aria-pressed={type === id} onClick={() => setType(id)}>{label}</button>)}</div>
    <div className="lesson-chord-result"><div><span className="lesson-chord-name">{chord.shortName}</span><small>{chord.fullName}</small></div><div className="lesson-tone-list">{chord.tones.map((tone) => <span key={tone.interval}><strong>{tone.name}</strong><small>{tone.interval}</small></span>)}</div></div>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={() => strum(chord.formula.map((interval) => 60 + intervalSemitones(interval)))}>Hear {chord.shortName}</button><Link className="text-link" to={chordPath('C', type)}>Explore this chord →</Link></div>
  </LabFrame>;
}

function ScaleLab() {
  const [type, setType] = useState('major');
  const notes = buildScale('C', type);
  const scale = SCALE_TYPES.find((entry) => entry.id === type)!;
  const preferFlats = type !== 'major';
  const play = () => playSequence([...notes.map((note) => 60 + ((note.pc + 12) % 12)), 72], 0.3, 0.65);
  return <LabFrame kicker="SCALE STEPPER" title="Compare two paths from C">
    <p className="small muted">A scale is a set of notes in order. Compare the major and natural minor patterns, then listen.</p>
    <div className="row lesson-choice-row"><button type="button" className="btn btn-sm" aria-pressed={type === 'major'} onClick={() => setType('major')}>C major</button><button type="button" className="btn btn-sm" aria-pressed={type === 'natural-minor'} onClick={() => setType('natural-minor')}>C natural minor</button></div>
    <div className="lesson-scale-notes">{notes.map((note) => <span key={note.degree}><small>{note.degree}</small><strong>{pcToNote(note.pc, preferFlats)}</strong></span>)}<span><small>8</small><strong>C</strong></span></div>
    <p className="small muted">Steps: {scale.stepFormula.replaceAll('W', 'whole').replaceAll('H', 'half').replaceAll('–', ' · ')}</p>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!isAudioSupported()} onClick={play}>Hear the scale</button><Link className="text-link" to={scalePath(type, 'C')}>Explore the scale →</Link></div>
  </LabFrame>;
}

function ModeLab() {
  const [type, setType] = useState<'natural-minor' | 'dorian'>('natural-minor');
  const notes = buildScale('D', type);
  const play = () => playSequence([...notes.map((note) => 62 + intervalSemitones(note.interval)), 74], 0.3, 0.7);
  return <LabFrame kicker="MODE COMPARISON" title="Keep D as home; change one note">
    <p className="small muted">D natural minor and D Dorian share the same minor triad, D–F–A. Their sixth differs: B flat in natural minor, B natural in Dorian.</p>
    <div className="row lesson-choice-row"><button type="button" className="btn btn-sm" aria-pressed={type === 'natural-minor'} onClick={() => setType('natural-minor')}>D natural minor</button><button type="button" className="btn btn-sm" aria-pressed={type === 'dorian'} onClick={() => setType('dorian')}>D Dorian</button></div>
    <div className="lesson-scale-notes">{notes.map((note) => <span key={note.interval} className={note.degree === 6 ? 'mode-characteristic' : ''}><small>{note.interval}</small><strong>{note.name}</strong></span>)}<span><small>8</small><strong>D</strong></span></div>
    <p className="small muted">D Dorian shares its pitch classes with C major, but D—not C—is its tonal center. The surrounding harmony makes that difference audible.</p>
    <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!isAudioSupported()} onClick={play}>Hear this scale</button><Link className="text-link" to={triadStudyPath('D', 'minor', type)}>Find D minor in this scale →</Link></div>
  </LabFrame>;
}

function CircleLab() {
  const [root, setRoot] = useState(0);
  const rootName = pcToNote(root, CYCLE_OF_FIFTHS.indexOf(root) >= 7);
  const chord = buildChord(rootName, 'major');
  return <LabFrame kicker="KEY WHEEL" title="Travel around the circle">
    <p className="small muted">Each step clockwise moves up a fifth. Choose a note to hear its major chord.</p>
    <div className="lesson-wheel" role="group" aria-label="Circle of fifths">{CYCLE_OF_FIFTHS.map((pc, index) => {
      const angle = index * Math.PI / 6;
      return <button key={pc} type="button" aria-pressed={root === pc} style={{ left: `${50 + 41 * Math.sin(angle)}%`, top: `${50 - 41 * Math.cos(angle)}%` }} onClick={() => setRoot(pc)}>{pcToNote(pc, index >= 7)}</button>;
    })}<div className="lesson-wheel-center"><strong>{rootName}</strong><small>MAJOR</small></div></div>
    <div className="row lesson-center"><button type="button" className="btn btn-primary btn-sm" onClick={() => strum(chord.formula.map((interval) => 60 + root + intervalSemitones(interval)))}>Hear {chord.shortName}</button><Link className="text-link" to={chordPath(chord.rootName, chord.typeId)}>Explore {chord.shortName} →</Link></div>
  </LabFrame>;
}

function ProgressionLab() {
  const [selected, setSelected] = useState('C');
  const chords = [{ root: 'C', roman: 'I', role: 'Home' }, { root: 'F', roman: 'IV', role: 'Away' }, { root: 'G', roman: 'V', role: 'Tension' }];
  return <LabFrame kicker="HARMONY LAB" title="Hear a little movement">
    <p className="small muted">Try C, then F, then G, then return to C. Each chord has a different relationship to home.</p>
    <div className="progression-lab">{chords.map(({ root, roman, role }) => <button type="button" key={root} aria-pressed={selected === root} onClick={() => { setSelected(root); const c = buildChord(root, 'major'); strum(c.formula.map((interval) => 60 + c.rootPc + intervalSemitones(interval))); }}><small>{roman} · {role.toUpperCase()}</small><strong>{root}</strong><span>Play chord</span></button>)}</div>
    <Link className="text-link" to="/progressions">Explore progressions →</Link>
  </LabFrame>;
}

export default function LessonLab({ lessonId }: { lessonId: string }) {
  if (lessonId === 'meet-your-guitar') return <StringLab />;
  if (lessonId === 'reading-chord-diagrams') return <DiagramLab />;
  if (lessonId === 'rhythm-basics') return <RhythmLab />;
  if (lessonId === 'notes-pitch-enharmonics') return <NoteLab />;
  if (lessonId === 'intervals') return <IntervalLab />;
  if (lessonId === 'inversions-slash-chords') return <InversionLab />;
  if (lessonId === 'major-minor-scales') return <ScaleLab />;
  if (lessonId === 'modes') return <ModeLab />;
  if (lessonId === 'circle-of-fifths') return <CircleLab />;
  if (lessonId === 'diatonic-harmony' || lessonId === 'progressions-function' || lessonId === 'voice-leading') return <ProgressionLab />;
  return <ChordLab />;
}
