import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildChord, type BuiltChord } from '@core/chords';
import { isAudioSupported, playMidi, playSequence, strum } from '@core/audio';
import { intervalSemitones } from '@core/intervals';
import { noteToPc, pcToNote, ROOT_NOTES, transposePc } from '@core/notes';
import { buildScale } from '@core/scales';
import { getTuning, TUNINGS } from '@core/tunings';
import { changesFromMajor, isTriadQuality, neckPositions, sameRootScalesContaining, type NeckPosition, type TriadQuality } from '@core/triadRelationships';
import Fretboard, { type FretMarkerData } from '@/components/Fretboard';
import TriadVoicings from '@/components/TriadVoicings';
import TriadTransferChallenge from '@/components/TriadTransferChallenge';
import { chordPath, lessonPath, scalePath } from '@/lib/urls';

const DEFAULT_SCALE: Record<TriadQuality, string> = { major: 'major', minor: 'natural-minor', diminished: 'locrian', augmented: 'whole-tone' };
const ROOT_OPTIONS = [...new Set(ROOT_NOTES.flatMap((root) => [root, pcToNote(noteToPc(root), true)]))];
const FRET_OPTIONS = [12, 15, 22, 24];

type BoardView = 'tones' | 'scale' | 'shape';
interface ShapeSelection { context: string; positions: NeckPosition[]; label: string }

function safeRoot(value: string | null): string {
  if (!value) return 'C';
  try { return pcToNote(noteToPc(value), value.includes('b')); } catch { return 'C'; }
}
function chordMidi(chord: BuiltChord): number[] {
  const rootMidi = 60 + chord.rootPc;
  return chord.tones.map((tone) => rootMidi + intervalSemitones(tone.interval));
}

export default function TriadStudyPage() {
  const [params, setParams] = useSearchParams();
  const root = safeRoot(params.get('root'));
  const qualityParam = params.get('quality') ?? 'major';
  const quality: TriadQuality = isTriadQuality(qualityParam) ? qualityParam : 'major';
  const tuningId = TUNINGS.some((item) => item.id === params.get('tuning')) ? params.get('tuning')! : 'standard';
  const tuning = getTuning(tuningId);
  const rawCapo = Number(params.get('capo') ?? 0);
  const capo = Number.isInteger(rawCapo) && rawCapo >= 0 && rawCapo <= 7 ? rawCapo : 0;
  const rawFrets = Number(params.get('frets') ?? 12);
  const fretCount = FRET_OPTIONS.includes(rawFrets) ? rawFrets : 12;
  const [view, setView] = useState<BoardView>(() => params.has('scale') ? 'scale' : 'tones');
  const [shape, setShape] = useState<ShapeSelection | null>(null);
  const [lastNote, setLastNote] = useState<NeckPosition | null>(null);

  const chord = useMemo(() => buildChord(root, quality), [root, quality]);
  const comparison = useMemo(() => changesFromMajor(chord), [chord]);
  const possibleScales = useMemo(() => sameRootScalesContaining(chord), [chord]);
  const requestedScale = params.get('scale');
  const scaleId = possibleScales.some((scale) => scale.id === requestedScale) ? requestedScale! : DEFAULT_SCALE[quality];
  const scale = possibleScales.find((item) => item.id === scaleId)!;
  const scaleNotes = useMemo(() => buildScale(root, scaleId), [root, scaleId]);
  const positions = useMemo(() => neckPositions(tuning, capo, fretCount), [tuning, capo, fretCount]);
  const context = `${root}|${quality}|${tuningId}|${capo}`;
  const visibleShape = shape?.context === context && shape.positions.every((position) => position.fret <= fretCount) ? shape : null;
  const currentView = view === 'shape' && !visibleShape ? 'tones' : view;
  const audioAvailable = isAudioSupported();

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    setParams(next, { replace: true });
  };
  const markers = useMemo<FretMarkerData[]>(() => {
    const candidates = currentView === 'shape' && visibleShape ? visibleShape.positions : positions;
    return candidates.flatMap((position) => {
      const tone = chord.tones.find((item) => item.pc === position.pc);
      const scaleNote = currentView === 'scale' ? scaleNotes.find((item) => item.pc === position.pc) : undefined;
      if (!tone && !scaleNote) return [];
      const role = tone ? chord.tones.indexOf(tone) : -1;
      return [{
        stringIndex: position.stringIndex, fret: position.fret,
        label: tone ? (role === 0 ? 'R' : tone.interval) : scaleNote!.name,
        variant: role === 0 ? 'root' as const : role === 1 ? 'cool' as const : role === 2 ? 'tone' as const : 'scale' as const,
        description: tone ? `${tone.name}, ${role === 0 ? 'root' : tone.intervalName} of ${chord.rootName}` : `${scaleNote!.name}, ${scaleNote!.intervalName} of ${chord.rootName} ${scale.name}`,
      }];
    });
  }, [currentView, visibleShape, positions, chord, scaleNotes, scale.name]);

  const hearChord = (value: BuiltChord) => { if (audioAvailable) strum(chordMidi(value)); };
  const hearArpeggio = () => {
    if (!audioAvailable) return;
    playSequence([...chordMidi(chord), 72 + chord.rootPc], 0.38, 0.9);
  };
  const audition = (stringIndex: number, fret: number) => {
    const position = positions.find((item) => item.stringIndex === stringIndex && item.fret === fret);
    if (!position) return;
    setLastNote(position);
    if (audioAvailable) playMidi(position.midi);
  };
  const showShape = (shapePositions: NeckPosition[], label: string) => {
    const max = Math.max(...shapePositions.map((position) => position.fret));
    if (max > fretCount) update({ frets: String(FRET_OPTIONS.find((count) => count >= max) ?? 24) });
    setShape({ context, positions: shapePositions, label });
    setLastNote(null);
    setView('shape');
    const neck = document.getElementById('triad-neck');
    neck?.scrollIntoView?.({ block: 'start' });
    neck?.focus({ preventScroll: true });
  };
  const playedTone = lastNote && chord.tones.find((tone) => tone.pc === lastNote.pc);
  const playedScaleNote = lastNote && scaleNotes.find((tone) => tone.pc === lastNote.pc);
  const nextRoot = pcToNote(transposePc(chord.rootPc, 5), root.includes('b'));
  const nextChord = buildChord(nextRoot, 'major');

  return <div className="page triad-study-page">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/theory">Theory</Link><span>/</span><Link to={lessonPath('triads')}>Triads</Link><span>/</span><span>Connected study</span></nav>
    <header className="triad-heading"><div><p className="eyebrow">A CONNECTED STUDY / TRIADS</p><h1>One chord. A whole neck.</h1><p className="lead">Start with three notes. See how they become a chord, a shape and a path through a scale—then find them somewhere new.</p></div><span>UNDERSTAND <b>→</b> EXPLORE <b>→</b> COMPARE <b>→</b> APPLY <b>→</b> TRANSFER</span></header>

    <section className="triad-foundation" aria-labelledby="foundation-heading">
      <div className="triad-foundation-copy"><p className="eyebrow">01 / BUILD THE SOUND</p><h2 id="foundation-heading">Start with a chord</h2><p>A triad is a chord built from three note types, or pitch classes: a <strong>root</strong> (its name), a <strong>third</strong> and a <strong>fifth</strong>. Each can appear on several strings and in different octaves. Play the chord tones one at a time and you have an <strong>arpeggio</strong>.</p>
        <div className="triad-pickers"><div className="field"><label htmlFor="study-root">Root note</label><select id="study-root" value={root} onChange={(event) => { update({ root: event.target.value }); setLastNote(null); }}>{ROOT_OPTIONS.map((name) => <option value={name} key={name}>{name}</option>)}</select></div><div className="field"><label htmlFor="study-quality">Chord quality</label><select id="study-quality" value={quality} onChange={(event) => { update({ quality: event.target.value }); setLastNote(null); }}><option value="major">Major</option><option value="minor">Minor</option><option value="diminished">Diminished</option><option value="augmented">Augmented</option></select></div></div>
        <p className="triad-current"><strong>{chord.shortName}</strong><span>{chord.fullName}</span></p>
        <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!audioAvailable} onClick={() => hearChord(chord)}>Hear the chord</button><button type="button" className="btn btn-sm" disabled={!audioAvailable} onClick={hearArpeggio}>Hear notes one by one</button><Link className="text-link" to={chordPath(root, quality)}>Chord details →</Link></div>
      </div>
      <div className="triad-foundation-notes"><p className="triad-control-label">THE THREE CHORD TONES <span>· TAP TO HEAR</span></p><div className="triad-tone-row">{chord.tones.map((tone, index) => <button key={tone.interval} type="button" className={`triad-tone triad-tone-${index}`} disabled={!audioAvailable} onClick={() => playMidi(60 + chord.rootPc + intervalSemitones(tone.interval))}><strong>{tone.name}</strong><small>{index === 0 ? 'Root' : tone.intervalName}</small><span>{index === 0 ? 'R' : tone.interval}</span></button>)}</div>
        <div className="triad-comparison"><p className="triad-control-label">COMPARE WITH {root.toUpperCase()} MAJOR</p>{comparison.length ? <><p>{comparison.map((change) => `${change.from.name} → ${change.to.name} (${change.role} ${change.semitones < 0 ? 'down' : 'up'} one semitone)`).join(' · ')}.</p><small>One semitone is one fret on the same string. The other chord tones stay put.</small></> : <><p>Change the quality to hear and see what moves.</p><small>For minor, lower the third by one semitone; the root and fifth stay the same.</small></>}<div className="row"><button type="button" className="btn btn-sm" disabled={!audioAvailable} onClick={() => hearChord(buildChord(root, 'major'))}>Hear {root} major</button><button type="button" className="btn btn-sm" disabled={!audioAvailable} onClick={() => hearChord(buildChord(root, 'minor'))}>Hear {root} minor</button></div></div>
      </div>
    </section>

    <section id="triad-neck" className="triad-neck" aria-labelledby="neck-heading" tabIndex={-1}>
      <div className="triad-section-heading"><div><p className="eyebrow">02 / FIND THE RELATIONSHIP</p><h2 id="neck-heading">Find the same notes again</h2></div><p>Each marker is a chord tone, not a fixed fingering. Select any position to hear it; the same role can appear in many registers.</p></div>
      <div className="triad-view-bar"><div className="triad-view-buttons" role="group" aria-label="Neck view"><button type="button" className="btn btn-sm" aria-pressed={currentView === 'tones'} onClick={() => setView('tones')}>Chord tones</button><button type="button" className="btn btn-sm" aria-pressed={currentView === 'scale'} onClick={() => setView('scale')}>Inside a scale</button>{visibleShape && <button type="button" className="btn btn-sm" aria-pressed={currentView === 'shape'} onClick={() => setView('shape')}>Selected shape</button>}</div>
        {currentView === 'scale' && <div className="triad-scale-select"><label htmlFor="related-scale">Same-root scale</label><select id="related-scale" value={scaleId} onChange={(event) => update({ scale: event.target.value })}>{possibleScales.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}
        <details className="triad-instrument"><summary>Instrument: {tuningId === 'standard' ? 'standard' : tuning.name.split(' (')[0]}{capo ? ` · capo ${capo}` : ''} · {fretCount} frets</summary><div className="triad-instrument-fields"><div className="field"><label htmlFor="study-tuning">Tuning</label><select id="study-tuning" value={tuningId} onChange={(event) => { update({ tuning: event.target.value }); setLastNote(null); }}>{TUNINGS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="field"><label htmlFor="study-capo">Capo</label><select id="study-capo" value={capo} onChange={(event) => { update({ capo: event.target.value }); setLastNote(null); }}>{Array.from({ length: 8 }, (_, value) => <option key={value} value={value}>{value ? `Fret ${value}` : 'None'}</option>)}</select></div><div className="field"><label htmlFor="study-frets">Frets shown</label><select id="study-frets" value={fretCount} onChange={(event) => { update({ frets: event.target.value }); setLastNote(null); }}>{FRET_OPTIONS.map((count) => <option key={count} value={count}>{count} frets</option>)}</select></div></div></details>
      </div>
      <div className="triad-neck-caption"><strong>{currentView === 'shape' ? visibleShape?.label : currentView === 'scale' ? `${root} ${scale.name} · chord tones inside` : `${chord.fullName} · all chord tones`}</strong><span>R = root · {chord.tones[1].interval} = third · {chord.tones[2].interval} = fifth{currentView === 'scale' ? ' · note names = other scale tones' : ''}</span></div>
      <Fretboard tuning={tuning} capo={capo} fretCount={fretCount} markers={markers} interactive interaction="play" onToggle={audition} preferFlats={root.includes('b')} ariaLabel={`${chord.fullName} relationship fretboard`} />
      <div className="triad-neck-foot"><p aria-live="polite">{lastNote ? <><strong>{playedTone?.name ?? playedScaleNote?.name ?? pcToNote(lastNote.pc, root.includes('b'))}</strong> · {playedTone ? (playedTone.interval === '1' ? 'root' : playedTone.intervalName) + ` of ${root}` : playedScaleNote && currentView === 'scale' ? `${playedScaleNote.intervalName} in the scale` : 'outside this triad'} · string {tuning.strings.length - lastNote.stringIndex}, {lastNote.fret ? `fret ${lastNote.fret}` : 'open'}</> : 'Select a note to hear it. Use arrow keys to move; scroll sideways to see the whole neck.'}</p>{currentView === 'scale' && <Link to={scalePath(scaleId, root)}>Open this scale →</Link>}</div>
      {currentView === 'scale' && <p className="triad-scale-explanation">The chord tones are part of this same-root scale; the other notes add melodic choices. Shared notes alone do not make scales interchangeable—the chord, tonal center and phrase matter.</p>}
    </section>

    <TriadVoicings key={context} chord={chord} tuning={tuning} capo={capo} fretCount={fretCount} onShow={showShape} />

    <section className="triad-musical-use"><div><p className="eyebrow">FROM SHAPE TO SOUND</p><h2>Use a chord tone as a landing place</h2><p>While {chord.shortName} sounds, try ending a melody on {chord.tones[1].name}, its third. Then try {nextChord.shortName}: {chord.tones[0].name} is a shared pitch class in both chords. Notice what stays and what moves; other notes can work too.</p></div><div className="row"><button type="button" className="btn btn-sm" disabled={!audioAvailable} onClick={() => hearChord(chord)}>Hear {chord.shortName}</button><button type="button" className="btn btn-sm" disabled={!audioAvailable} onClick={() => hearChord(nextChord)}>Hear {nextChord.shortName}</button><Link className="text-link" to="/progressions">Explore progressions →</Link></div></section>

    <TriadTransferChallenge key={`${context}|${fretCount}`} chord={chord} tuning={tuning} capo={capo} fretCount={fretCount} />
    <nav className="triad-next-links" aria-label="Continue learning"><span>KEEP CONNECTING</span><Link to={lessonPath('intervals')}>Intervals</Link><Link to={lessonPath('inversions-slash-chords')}>Inversions</Link><Link to={lessonPath('diatonic-harmony')}>Chords in a key</Link><Link to={lessonPath('modes')}>Modes</Link></nav>
  </div>;
}
