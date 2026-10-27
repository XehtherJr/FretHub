import { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import Fretboard, { FretMarkerData } from '@/components/Fretboard';
import Icon from '@/components/Icon';
import { SCALE_TYPES, ScaleCategory, buildScale, buildArpeggio, getScaleType, scaleTriadIntervals } from '@core/scales';
import { getTuning } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
import { noteToPc, pcToNote, pcOctaveToMidi, ROOT_NOTES } from '@core/notes';
import { playSequence, isAudioSupported } from '@core/audio';
import { scalePath, triadStudyPath } from '@/lib/urls';
import { qualityForTriadIntervals } from '@core/triadRelationships';

const CATEGORY_LABELS: Record<ScaleCategory, string> = {
  major: 'Major & minor', minor: 'Major & minor', mode: 'Modes',
  pentatonic: 'Pentatonic', blues: 'Blues', symmetrical: 'Symmetrical',
};

function validRoot(value: string | null): string {
  if (!value) return 'C';
  try { noteToPc(value); return value; } catch { return 'C'; }
}

export default function ScalesPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scaleId = params.scaleId && SCALE_TYPES.some((scale) => scale.id === params.scaleId) ? params.scaleId : 'major';
  const [root, setRoot] = useState(() => validRoot(searchParams.get('root')));
  const [showArpeggio, setShowArpeggio] = useState(false);
  const [fretCount, setFretCount] = useState(12);
  const tuning = getTuning('standard');

  useEffect(() => {
    setRoot(validRoot(searchParams.get('root')));
  }, [searchParams]);

  const type = getScaleType(scaleId);
  const notes = useMemo(() => buildScale(root, scaleId), [root, scaleId]);
  const rootPc = noteToPc(root);
  const triadIntervals = useMemo(() => scaleTriadIntervals(scaleId), [scaleId]);
  const arp = useMemo(() => buildArpeggio(root, triadIntervals), [root, triadIntervals]);

  const markers = useMemo<FretMarkerData[]>(() => {
    const scalePcs = new Set(notes.map((note) => note.pc));
    const arpPcs = new Set(arp.map((note) => note.pc));
    const out: FretMarkerData[] = [];
    tuning.strings.forEach((_, stringIndex) => {
      for (let fret = 0; fret <= fretCount; fret++) {
        const pc = fretPc(tuning, stringIndex, fret);
        if (!scalePcs.has(pc)) continue;
        out.push({ stringIndex, fret, variant: pc === rootPc ? 'root' : showArpeggio && arpPcs.has(pc) ? 'cool' : 'scale', label: pcToNote(pc, root.includes('b')) });
      }
    });
    return out;
  }, [notes, arp, showArpeggio, tuning, fretCount, rootPc, root]);

  const playScale = () => {
    let octave = 4;
    let previous = -1;
    const run = notes.map((note) => {
      if (note.pc <= previous) octave++;
      previous = note.pc;
      return pcOctaveToMidi(note.pc, octave);
    });
    // The starting tonic is in octave 4, so its closing octave is always 5,
    // even when the scale crosses C before reaching its final note.
    run.push(pcOctaveToMidi(rootPc, 5));
    playSequence(run, 0.32, 0.7);
  };

  const changeRoot = (note: string) => {
    setRoot(note);
    setSearchParams({ root: note }, { replace: true });
  };
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof SCALE_TYPES>();
    for (const scale of SCALE_TYPES) {
      const label = CATEGORY_LABELS[scale.category];
      const list = groups.get(label) ?? [];
      list.push(scale);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }, []);

  return (
    <div className="page scales-page">
      <p className="eyebrow">The vocabulary of the neck</p>
      <h1>Scale library</h1>
      <p className="lead">Explore scales and modes as a set of notes, intervals, and patterns on the guitar.</p>

      <div className="scale-mobile-chooser field">
        <label htmlFor="mobile-scale">Choose a scale</label>
        <select id="mobile-scale" value={scaleId} onChange={(event) => navigate(scalePath(event.target.value, root))}>
          {grouped.map(([label, scales]) => <optgroup key={label} label={label}>{scales.map((scale) => <option key={scale.id} value={scale.id}>{scale.name}</option>)}</optgroup>)}
        </select>
      </div>
      <div className="scales-layout">
        <aside className="scale-nav" aria-label="Scale library navigation">
          <p className="scale-nav-title">SCALES & MODES <span>{SCALE_TYPES.length}</span></p>
          {grouped.map(([label, scales]) => (
            <div key={label} className="scale-nav-group">
              <p>{label}</p>
              {scales.map((scale) => (
                <Link key={scale.id} to={scalePath(scale.id, root)} className={scale.id === scaleId ? 'active' : ''} aria-current={scale.id === scaleId ? 'page' : undefined}>{scale.name}</Link>
              ))}
            </div>
          ))}
        </aside>

        <div className="scale-content">
          <section className="scale-summary">
            <div className="scale-title-row">
              <div><p className="wb-section-kicker">{CATEGORY_LABELS[type.category].toUpperCase()}</p><h2>{root} {type.name}</h2></div>
              <span className="scale-formula">{type.stepFormula}</span>
            </div>
            <p className="scale-description">{type.description}</p>
            {type.modeOf && <p className="small faint">Mode {type.modeOf.degree} of the {type.modeOf.parent.replace('-', ' ')} scale</p>}
            <div className="scale-root-picker">
              <label id="scale-root-label">Root note</label>
              <div role="group" aria-labelledby="scale-root-label" className="row">
                {ROOT_NOTES.map((note) => {
                  const displayNote = pcToNote(noteToPc(note), root.includes('b'));
                  return <button key={note} type="button" className="btn btn-sm" aria-pressed={noteToPc(root) === noteToPc(note)} onClick={() => changeRoot(displayNote)}>{displayNote}</button>;
                })}
              </div>
            </div>
            <div className="scale-tone-line" aria-label={`Notes in ${root} ${type.name}`}>
              {notes.map((note) => <div key={note.interval} title={note.intervalName}><span className={`note-chip ${note.interval === '1' ? 'root' : ''}`}>{note.name}</span><small>{note.interval}</small></div>)}
            </div>
            <div className="scale-actions">
              {isAudioSupported() && <button type="button" className="btn btn-primary btn-sm" onClick={playScale}><Icon name="play" /> Play ascending</button>}
              <button type="button" className="btn btn-sm" aria-pressed={showArpeggio} onClick={() => setShowArpeggio((value) => !value)}>Root triad {showArpeggio ? 'on' : 'off'}</button>
              <select className="scale-fret-select" value={fretCount} onChange={(event) => setFretCount(Number(event.target.value))} aria-label="Frets shown">
                {[12, 15, 22, 24].map((fret) => <option key={fret} value={fret}>{fret} frets</option>)}
              </select>
              {qualityForTriadIntervals(triadIntervals) && <Link className="btn btn-sm" to={triadStudyPath(root, qualityForTriadIntervals(triadIntervals), scaleId, { frets: fretCount })}>Study the root triad →</Link>}
            </div>
            {showArpeggio && <p className="scale-triad-copy">Outlined notes form the root triad ({triadIntervals.join(' · ')}): {arp.slice(0, triadIntervals.length).map((note) => note.name).join(' · ')}.</p>}
          </section>

          <section className="scale-board">
            <div className="wb-neck-header">
              <div><span className="wb-section-kicker">THE NECK</span><span className="wb-neck-description">Standard tuning <span> / </span> {fretCount} frets</span></div>
              <div className="wb-legend"><span><i className="legend-dot root" />Root</span><span><i className="legend-dot tone" />Scale tone</span>{showArpeggio && <span><i className="legend-dot triad" />Triad</span>}</div>
            </div>
            <Fretboard tuning={tuning} fretCount={fretCount} markers={markers} showNoteNames ariaLabel={`${root} ${type.name} scale pattern across ${fretCount} frets`} />
            <p className="scale-board-hint">Scroll horizontally to explore the neck. For note-by-note playback, use the <Link to="/fretboard">fretboard workbench</Link>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
