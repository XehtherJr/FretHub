import { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import Fretboard, { FretMarkerData } from '@/components/Fretboard';
import { SCALE_TYPES, ScaleCategory, buildScale, buildArpeggio, getScaleType } from '@core/scales';
import { getTuning } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
import { noteToPc, pcToNote, pcOctaveToMidi, ROOT_NOTES } from '@core/notes';
import { playMidi, isAudioSupported, getAudioContext } from '@core/audio';
import { scalePath } from '@/lib/urls';

const CATEGORY_LABELS: Record<ScaleCategory, string> = {
  major: 'Major & minor',
  minor: 'Major & minor',
  mode: 'Modes',
  pentatonic: 'Pentatonic',
  blues: 'Blues',
  symmetrical: 'Symmetrical',
};

export default function ScalesPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const scaleId = params.scaleId && SCALE_TYPES.some((s) => s.id === params.scaleId)
    ? params.scaleId
    : 'major';
  const [root, setRoot] = useState(searchParams.get('root') ?? 'C');
  const [showArpeggio, setShowArpeggio] = useState(false);
  const [fretCount, setFretCount] = useState(15);
  const tuning = getTuning('standard');

  useEffect(() => {
    const r = searchParams.get('root');
    if (r) setRoot(r);
  }, [searchParams]);

  const type = getScaleType(scaleId);
  const notes = useMemo(() => buildScale(root, scaleId), [root, scaleId]);
  const rootPc = noteToPc(root);
  const arp = useMemo(() => buildArpeggio(root, ['1', '3', '5']), [root]);

  const markers = useMemo<FretMarkerData[]>(() => {
    const scalePcs = new Map(notes.map((n) => [n.pc, n]));
    const arpPcs = new Set(arp.map((n) => n.pc));
    const out: FretMarkerData[] = [];
    tuning.strings.forEach((_, stringIndex) => {
      for (let fret = 0; fret <= fretCount; fret++) {
        const pc = fretPc(tuning, stringIndex, fret);
        const note = scalePcs.get(pc);
        if (!note) continue;
        out.push({
          stringIndex,
          fret,
          variant: pc === rootPc ? 'root' : showArpeggio && arpPcs.has(pc) ? 'cool' : 'scale',
          label: pcToNote(pc, root.includes('b')),
        });
      }
    });
    return out;
  }, [notes, arp, showArpeggio, tuning, fretCount, rootPc, root]);

  const playScale = () => {
    // Ascending one-octave run with correct octave handling, scheduled on the audio clock.
    const audio = getAudioContext();
    const start = audio.currentTime + 0.05;
    let octave = 4;
    let prev = -1;
    const run: number[] = [];
    notes.forEach((n) => {
      if (n.pc <= prev) octave++;
      prev = n.pc;
      run.push(pcOctaveToMidi(n.pc, octave));
    });
    run.push(pcOctaveToMidi(rootPc, octave + 1)); // closing tonic
    run.forEach((midi, i) => playMidi(midi, { when: start + i * 0.32, duration: 0.7 }));
  };

  const changeRoot = (note: string) => {
    setRoot(note);
    setSearchParams({ root: note }, { replace: true });
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof SCALE_TYPES>();
    for (const s of SCALE_TYPES) {
      const label = CATEGORY_LABELS[s.category];
      const list = groups.get(label) ?? [];
      list.push(s);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }, []);

  return (
    <div className="page">
      <p className="eyebrow">Scales, modes & arpeggios</p>
      <h1>Scale library</h1>
      <p className="lead">
        {SCALE_TYPES.length} scales built from interval formulas and mapped across the neck. Root
        notes are marked in red and the root-triad arpeggio can be overlaid in blue.
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '1rem', alignItems: 'start' }}>
        <aside className="card" style={{ position: 'sticky', top: 80 }}>
          <h2 style={{ fontSize: '1.05rem' }}>Scales</h2>
          {grouped.map(([label, scales]) => (
            <div key={label} style={{ marginBottom: '0.8rem' }}>
              <p className="small faint" style={{ margin: '0.4rem 0' }}>{label}</p>
              <div className="row">
                {scales.map((s) => (
                  <Link
                    key={s.id}
                    to={scalePath(s.id, root)}
                    className={`btn btn-sm ${s.id === scaleId ? '' : 'btn-ghost'}`}
                    aria-pressed={s.id === scaleId}
                  >
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <div>
          <section className="card">
            <div className="spread">
              <h2 style={{ margin: 0 }}>{root} {type.name}</h2>
              <span className="pill">{CATEGORY_LABELS[type.category]}</span>
            </div>
            <p className="muted">{type.description}</p>
            <p className="small">Step formula: <code>{type.stepFormula}</code>
              {type.modeOf && <> · mode {type.modeOf.degree} of the {type.modeOf.parent.replace('-', ' ')}</>}
            </p>

            <div className="field">
              <label id="scale-root-label">Root note</label>
              <div role="group" aria-labelledby="scale-root-label" className="row">
                {ROOT_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    className="btn btn-sm"
                    aria-pressed={root === note}
                    onClick={() => changeRoot(note)}
                  >
                    {note}
                  </button>
                ))}
              </div>
            </div>

            <div className="row" style={{ marginBottom: '1rem' }}>
              {notes.map((n) => (
                <span key={n.interval} className={`note-chip ${n.interval === '1' ? 'root' : ''}`} title={n.intervalName}>
                  {n.name}
                </span>
              ))}
            </div>
            <div className="row">
              {isAudioSupported() && (
                <button type="button" className="btn btn-primary btn-sm" onClick={playScale}>▶ Play ascending</button>
              )}
              <button type="button" className="btn btn-sm" aria-pressed={showArpeggio} onClick={() => setShowArpeggio((v) => !v)}>
                {showArpeggio ? 'Arpeggio on' : 'Arpeggio off'}
              </button>
              <select
                className="btn-sm"
                style={{ width: 'auto' }}
                value={fretCount}
                onChange={(e) => setFretCount(Number(e.target.value))}
                aria-label="Frets shown"
              >
                {[12, 15, 22].map((f) => <option key={f} value={f}>{f} frets</option>)}
              </select>
            </div>
            {showArpeggio && (
              <p className="small faint" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                Blue dots are the {root} major triad arpeggio (1–3–5): {arp.slice(0, 3).map((n) => n.name).join(' · ')}
              </p>
            )}
          </section>

          <section className="card" style={{ marginTop: '1rem' }}>
            <Fretboard
              tuning={tuning}
              fretCount={fretCount}
              markers={markers}
              showNoteNames
              ariaLabel={`${root} ${type.name} scale pattern across ${fretCount} frets`}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
