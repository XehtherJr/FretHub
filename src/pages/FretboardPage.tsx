import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Fretboard, { FretMarkerData, markerKey } from '@/components/Fretboard';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
import { pcToNote, ROOT_NOTES, noteToPc } from '@core/notes';
import { identifyChord, describeMatch } from '@core/chord-identifier';
import { buildChord } from '@core/chords';
import { generateVoicings } from '@core/voicing-engine';
import { buildScale, buildArpeggio, SCALE_TYPES } from '@core/scales';
import { playMidi, strum, isAudioSupported } from '@core/audio';
import { fretToMidi } from '@core/notes';
import EmptyState from '@/components/EmptyState';
import { chordPath } from '@/lib/urls';

interface SelectedNote { fret: number; pc: number; }

export default function FretboardPage() {
  const [searchParams] = useSearchParams();
  const [tuningId, setTuningId] = useState('standard');
  const [capo, setCapo] = useState(0);
  const [fretCount, setFretCount] = useState(12);
  const [preferFlats, setPreferFlats] = useState(false);
  const [mode, setMode] = useState<'build' | 'scale'>('build');
  const [soundOnClick, setSoundOnClick] = useState(true);
  const [selected, setSelected] = useState<Map<number, SelectedNote>>(new Map());

  // Scale-overlay state
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleId, setScaleId] = useState('major');
  const [showArpeggio, setShowArpeggio] = useState(false);

  const baseTuning = getTuning(tuningId);
  const tuning = useMemo(() => applyCapo(baseTuning, capo), [baseTuning, capo]);

  // Deep-link support: /fretboard?chord=C|major preloads the top generated voicing.
  useEffect(() => {
    const chordParam = searchParams.get('chord');
    if (!chordParam) return;
    const [root, typeId] = chordParam.split('|');
    try {
      const chord = buildChord(root, typeId);
      const [voicing] = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxResults: 1 });
      if (voicing) {
        const next = new Map<number, SelectedNote>();
        voicing.frets.forEach((fret, i) => {
          if (fret !== null && fret > 0) next.set(i, { fret, pc: fretPc(tuning, i, fret) });
          if (fret === 0) next.set(i, { fret: 0, pc: fretPc(tuning, i, 0) });
        });
        setSelected(next);
        setMode('build');
      }
    } catch {
      /* malformed deep link — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectedPcs = [...selected.values()].map((n) => n.pc);
  const bassStringIndex = [...selected.keys()].sort((a, b) => a - b)[0];
  const bassPc = bassStringIndex !== undefined ? selected.get(bassStringIndex)?.pc : undefined;
  const matches = useMemo(
    () => (mode === 'build' ? identifyChord(selectedPcs, bassPc) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, selectedPcs.join(','), bassPc],
  );

  const scaleMarkers = useMemo<FretMarkerData[]>(() => {
    if (mode !== 'scale') return [];
    const notes = buildScale(scaleRoot, scaleId);
    const pcSet = new Map(notes.map((n) => [n.pc, n.interval]));
    const rootPc = noteToPc(scaleRoot);
    const arpPcs = new Set(
      showArpeggio ? buildArpeggio(scaleRoot, ['1', '3', '5']).map((n) => n.pc) : [],
    );
    const markers: FretMarkerData[] = [];
    tuning.strings.forEach((_, stringIndex) => {
      for (let fret = 0; fret <= fretCount; fret++) {
        const pc = fretPc(tuning, stringIndex, fret);
        if (pcSet.has(pc)) {
          const isRoot = pc === rootPc;
          const isArp = arpPcs.has(pc);
          markers.push({
            stringIndex,
            fret,
            variant: isRoot ? 'root' : isArp ? 'cool' : 'scale',
            label: pcToNote(pc, preferFlats),
          });
        }
      }
    });
    return markers;
  }, [mode, scaleRoot, scaleId, showArpeggio, tuning, fretCount, preferFlats]);

  const buildMarkers = useMemo<FretMarkerData[]>(() => {
    if (mode !== 'build') return [];
    const topRoot = matches[0]?.chord.rootPc;
    return [...selected.entries()].map(([stringIndex, note]) => ({
      stringIndex,
      fret: note.fret,
      variant: topRoot !== undefined && note.pc === topRoot ? 'root' : 'tone',
      label: pcToNote(note.pc, preferFlats),
    }));
  }, [mode, selected, matches, preferFlats]);

  const toggleNote = (stringIndex: number, fret: number, pc: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(stringIndex);
      if (current && current.fret === fret) next.delete(stringIndex);
      else next.set(stringIndex, { fret, pc });
      return next;
    });
    if (soundOnClick && isAudioSupported()) {
      const s = tuning.strings[stringIndex];
      playMidi(fretToMidi(s.pc, s.octave, fret));
    }
  };

  const playSelection = () => {
    const midi = tuning.strings.map((_, i) => {
      const note = selected.get(i);
      if (!note) return null;
      const s = tuning.strings[i];
      return fretToMidi(s.pc, s.octave, note.fret);
    });
    strum(midi);
  };

  const clearBoard = () => setSelected(new Map());

  const selectedKeys = useMemo(() => {
    const keys = new Set<string>();
    selected.forEach((note, stringIndex) => keys.add(markerKey(stringIndex, note.fret)));
    return keys;
  }, [selected]);

  return (
    <div className="page">
      <p className="eyebrow">Interactive fretboard</p>
      <h1>Fretboard workbench</h1>
      <p className="lead">
        Click any string position to place a note and build chords by ear — the identifier names
        every chord your notes fit. Switch to scale mode to map scales, modes and arpeggios across
        the whole neck.
      </p>

      <div className="card">
        <div className="form-row">
          <div className="field">
            <label htmlFor="tuning">Tuning</label>
            <select id="tuning" value={tuningId} onChange={(e) => { setTuningId(e.target.value); clearBoard(); }}>
              {TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="capo">Capo</label>
            <select id="capo" value={capo} onChange={(e) => { setCapo(Number(e.target.value)); clearBoard(); }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                <option key={c} value={c}>{c === 0 ? 'None' : `Fret ${c}`}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="frets">Frets shown</label>
            <select id="frets" value={fretCount} onChange={(e) => setFretCount(Number(e.target.value))}>
              {[12, 15, 22, 24].map((f) => <option key={f} value={f}>{f} frets</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mode">Mode</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as 'build' | 'scale')}>
              <option value="build">Build & identify</option>
              <option value="scale">Scale overlay</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="accidentals">Accidentals</label>
            <select id="accidentals" value={preferFlats ? 'flat' : 'sharp'} onChange={(e) => setPreferFlats(e.target.value === 'flat')}>
              <option value="sharp">Sharps (C#)</option>
              <option value="flat">Flats (Db)</option>
            </select>
          </div>
        </div>

        {mode === 'scale' && (
          <div className="form-row" style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label htmlFor="scale-root">Scale root</label>
              <select id="scale-root" value={scaleRoot} onChange={(e) => setScaleRoot(e.target.value)}>
                {ROOT_NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="scale-type">Scale / mode</label>
              <select id="scale-type" value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
                {SCALE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Arpeggio overlay</label>
              <button
                type="button"
                className="btn"
                aria-pressed={showArpeggio}
                onClick={() => setShowArpeggio((v) => !v)}
              >
                {showArpeggio ? 'Root triad on' : 'Root triad off'}
              </button>
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: '0.75rem' }}>
          {mode === 'build' && (
            <>
              <button type="button" className="btn btn-primary btn-sm" onClick={playSelection} disabled={selected.size === 0}>
                ▶ Strum selection
              </button>
              <button type="button" className="btn btn-sm" onClick={clearBoard} disabled={selected.size === 0}>
                Clear board
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-pressed={soundOnClick}
            onClick={() => setSoundOnClick((v) => !v)}
          >
            {soundOnClick ? '🔊 Sound on click' : '🔇 Click muted'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <Fretboard
          tuning={tuning}
          capo={capo}
          fretCount={fretCount}
          interactive={mode === 'build'}
          markers={mode === 'scale' ? scaleMarkers : buildMarkers}
          selectedKeys={mode === 'build' ? selectedKeys : new Set()}
          onToggle={toggleNote}
          preferFlats={preferFlats}
          ariaLabel={mode === 'scale' ? `Fretboard showing ${scaleRoot} ${scaleId}` : 'Interactive guitar fretboard — select notes to identify chords'}
        />
        <p className="small faint" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          {tuning.name}{capo > 0 ? ` · capo on fret ${capo}` : ''} · {tuning.strings.length} strings ·
          every cell is keyboard focusable: Tab to a position, Enter or Space to toggle.
        </p>
      </div>

      {mode === 'build' && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Identification</h2>
          {selected.size === 0 ? (
            <EmptyState icon="🎵" title="No notes selected yet">
              Click at least two notes on the fretboard above. Every chord formula whose tones fit
              your selection will appear here — exact matches first.
            </EmptyState>
          ) : selected.size < 2 ? (
            <EmptyState icon="🎵" title="Add one more note">
              A single pitch isn’t enough to identify a chord — select notes on at least two strings.
            </EmptyState>
          ) : matches.length === 0 ? (
            <EmptyState icon="🤷" title="No standard chord matches">
              The notes {selectedPcs.map((pc) => pcToNote(pc, preferFlats)).join(', ')} don’t map to a
              supported formula. Try adding or removing a note — power chords need just root and fifth.
            </EmptyState>
          ) : (
            <div className="grid grid-2">
              {matches.slice(0, 8).map((match) => (
                <div className="card" key={`${match.chord.rootName}-${match.chord.typeId}`}>
                  <div className="spread">
                    <h3 style={{ margin: 0 }}>
                      <Link to={chordPath(match.chord.rootName, match.chord.typeId)}>
                        {match.chord.shortName}
                      </Link>
                    </h3>
                    <span className={`pill ${match.strength === 'exact' ? 'tone' : 'scale'}`}>
                      {match.strength === 'exact' ? 'exact match' : 'partial match'}
                    </span>
                  </div>
                  <p className="small muted" style={{ margin: '0.4rem 0' }}>{describeMatch(match)}</p>
                  <div className="row">
                    {match.chord.tones.map((t) => (
                      <span key={t.interval} className={`note-chip ${t.interval === '1' ? 'root' : ''}`}>{t.name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {mode === 'scale' && (
        <section className="card" style={{ marginTop: '1.5rem' }}>
          <h2>{scaleRoot} {SCALE_TYPES.find((s) => s.id === scaleId)?.name}</h2>
          <p className="muted">{SCALE_TYPES.find((s) => s.id === scaleId)?.description}</p>
          <p className="small">
            Step formula: <code>{SCALE_TYPES.find((s) => s.id === scaleId)?.stepFormula}</code>
          </p>
          <div className="row">
            {buildScale(scaleRoot, scaleId).map((n) => (
              <span key={n.interval} className={`note-chip ${n.interval === '1' ? 'root' : ''}`} title={n.intervalName}>
                {n.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
