import { useMemo, useState } from 'react';
import { buildChord, type BuiltChord } from '@core/chords';
import { strum, isAudioSupported } from '@core/audio';
import { applyCapo, type Tuning } from '@core/tunings';
import { fretPc, generateVoicings } from '@core/voicing-engine';
import { cagedMajorPositions, type CagedForm, type NeckPosition } from '@core/triadRelationships';
import ChordDiagram from './ChordDiagram';

interface Props {
  chord: BuiltChord;
  tuning: Tuning;
  capo: number;
  fretCount: number;
  onShow: (positions: NeckPosition[], label: string) => void;
}

export default function TriadVoicings({ chord, tuning, capo, fretCount, onShow }: Props) {
  const [bassIndex, setBassIndex] = useState(0);
  const [windowId, setWindowId] = useState('all');
  const [shapeIndex, setShapeIndex] = useState(0);
  const capoTuning = useMemo(() => applyCapo(tuning, capo), [tuning, capo]);
  const windows = [
    { id: 'all', label: `Anywhere through fret ${fretCount}`, start: 0, end: fretCount },
    { id: 'low', label: 'Open to fret 4', start: 0, end: 4 },
    { id: 'middle', label: 'Frets 5–8', start: 5, end: 8 },
    { id: 'high', label: 'Frets 9–12', start: 9, end: 12 },
    ...(fretCount >= 15 ? [{ id: 'higher', label: `Frets 13–${fretCount}`, start: 13, end: fretCount }] : []),
  ];
  const range = windows.find((window) => window.id === windowId) ?? windows[0];
  const shapes = useMemo(() => {
    const minFret = range.start === 0 ? 0 : Math.max(1, range.start - capo);
    const maxFret = range.end - capo;
    if (maxFret < minFret) return [];
    const options = { minFret, maxFret, maxSpan: 4, allowOpen: minFret === 0, requiredBass: chord.tones[bassIndex].pc };
    // Lead with fuller, familiar grips when available, then include compact
    // three-string voicings as well. Both lists come from the same engine.
    const fuller = generateVoicings(chord.pitchClasses, capoTuning, chord.rootPc, {
      ...options, maxMuted: Math.max(0, tuning.strings.length - 5), maxResults: 4,
    });
    const compact = generateVoicings(chord.pitchClasses, capoTuning, chord.rootPc, {
      ...options, maxMuted: Math.max(0, tuning.strings.length - 3), maxResults: 12,
    });
    const seen = new Set<string>();
    return [...fuller, ...compact].filter((voicing) => {
      const key = voicing.frets.join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }, [chord, capoTuning, capo, tuning.strings.length, bassIndex, range.start, range.end]);
  const currentIndex = Math.min(shapeIndex, Math.max(0, shapes.length - 1));
  const selected = shapes[currentIndex];

  const showVoicing = () => {
    if (!selected) return;
    const positions = selected.frets.flatMap((relative, stringIndex) => {
      if (relative === null) return [];
      const fret = relative === 0 ? 0 : relative + capo;
      return [{ stringIndex, fret, pc: fretPc(tuning, stringIndex, fret === 0 ? capo : fret), midi: selected.midi[stringIndex]! }];
    });
    onShow(positions, `${chord.shortName}, ${chord.tones[bassIndex].name} in the bass`);
  };
  const showCaged = (form: CagedForm) => {
    const positions = cagedMajorPositions(chord, tuning, capo, form);
    if (positions) onShow(positions, `${chord.shortName}, ${form}-form shape`);
  };

  return <section className="triad-shapes" aria-labelledby="shapes-heading">
    <div className="triad-section-heading"><div><p className="eyebrow">03 / SAME NOTES, DIFFERENT SHAPES</p><h2 id="shapes-heading">Move the chord around</h2></div><p>The chord stays the same when its notes are rearranged. The lowest sounding note determines the inversion.</p></div>
    <div className="triad-shape-layout">
      <div className="triad-shape-controls">
        <label htmlFor="shape-position">Where on the neck?</label>
        <select id="shape-position" value={range.id} onChange={(event) => { setWindowId(event.target.value); setShapeIndex(0); }}>
          {windows.map((window) => <option key={window.id} value={window.id}>{window.label}</option>)}
        </select>
        <p className="triad-control-label" id="bass-choice">Lowest note (bass)</p>
        <div className="triad-bass-buttons" role="group" aria-labelledby="bass-choice">
          {chord.tones.map((tone, index) => <button type="button" key={tone.interval} className="btn btn-sm" aria-pressed={bassIndex === index} onClick={() => { setBassIndex(index); setShapeIndex(0); }}>{['Root', 'Third', 'Fifth'][index]} · {tone.name}</button>)}
        </div>
        <p className="small muted">{bassIndex === 0 ? 'Root in the bass: root position.' : bassIndex === 1 ? 'Third in the bass: first inversion.' : 'Fifth in the bass: second inversion.'} This describes the lowest pitch, not the shape’s position on the neck. Some shapes double notes; pluck the sounded strings when a shape skips strings.</p>
        <p className="small muted">Finger numbers are suggestions, not guarantees of comfort or playability. Other fingerings can work, and some valid shapes may not be shown.</p>
        {selected ? <div className="row"><button type="button" className="btn btn-primary btn-sm" disabled={!isAudioSupported()} onClick={() => strum(selected.midi)}>Hear this voicing</button><button type="button" className="btn btn-sm" onClick={showVoicing}>Show shape on neck ↑</button></div>
          : <p className="small muted" role="status">No voicing was generated in this range with that bass. Try another range or bass note.</p>}
      </div>
      <div className="triad-shape-result">
        {selected && <><ChordDiagram voicing={selected} tuning={capoTuning} name={buildChord(chord.rootName, chord.typeId, selected.bassPc ?? undefined).shortName} rootPc={chord.rootPc} showNotes={false} /><div className="triad-shape-nav"><button type="button" className="btn btn-sm" disabled={currentIndex <= 0} onClick={() => setShapeIndex(currentIndex - 1)} aria-label="Previous voicing">←</button><span>{currentIndex + 1} / {shapes.length}</span><button type="button" className="btn btn-sm" disabled={currentIndex >= shapes.length - 1} onClick={() => setShapeIndex(currentIndex + 1)} aria-label="Next voicing">→</button></div><small>× = skip · O = open{capo ? ` at capo ${capo}; chart frets are relative to it` : ''}. Dots show suggested fingers: 1 index through 4 little finger.</small></>}
      </div>
    </div>
    {chord.typeId === 'major' && tuning.id === 'standard' && <details className="triad-caged">
      <summary>Recognize an open E or A shape?</summary>
      <p>Those familiar open-major shapes can move up the neck, usually with a barre. E and A are two of the five CAGED families—not the only ways to play a chord. The markers show sounding notes, not a fingering prescription.</p>
      <div className="row"><button type="button" className="btn btn-sm" onClick={() => showCaged('E')}>Show E form on neck ↑</button><button type="button" className="btn btn-sm" onClick={() => showCaged('A')}>Show A form on neck ↑</button></div>
      <p className="small faint">These two form examples use standard six-string tuning; generated voicings above work in other tunings too.</p>
    </details>}
  </section>;
}
