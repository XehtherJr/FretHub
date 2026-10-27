import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Fretboard, { FretMarkerData, markerKey } from '@/components/Fretboard';
import Icon from '@/components/Icon';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { fretPc, generateVoicings } from '@core/voicing-engine';
import { pcToNote, ROOT_NOTES, noteToPc, fretToMidi } from '@core/notes';
import { identifyChord, describeMatch } from '@core/chord-identifier';
import { buildChord } from '@core/chords';
import { buildScale, buildArpeggio, scaleTriadIntervals, SCALE_TYPES } from '@core/scales';
import { playMidi, strum, isAudioSupported } from '@core/audio';
import { chordPath, scalePath, triadStudyPath } from '@/lib/urls';
import { qualityForTriadIntervals } from '@core/triadRelationships';

interface SelectedNote { fret: number; pc: number; }

export default function FretboardPage() {
  const [searchParams] = useSearchParams();
  const [tuningId, setTuningId] = useState('standard');
  const [capo, setCapo] = useState(0);
  const [fretCount, setFretCount] = useState(12);
  const [preferFlats, setPreferFlats] = useState(false);
  const [mode, setMode] = useState<'build' | 'scale'>('build');
  const [soundOnClick, setSoundOnClick] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [selected, setSelected] = useState<Map<number, SelectedNote>>(new Map());
  const [lastAudition, setLastAudition] = useState<{ stringIndex: number; fret: number; pc: number } | null>(null);
  const [scaleRoot, setScaleRoot] = useState('C');
  const [scaleId, setScaleId] = useState('major');
  const [showArpeggio, setShowArpeggio] = useState(false);

  const tuning = getTuning(tuningId);
  const audioAvailable = isAudioSupported();
  // The board uses physical frets. Only the open-string position is shifted by the capo.
  const soundingFret = (fret: number) => fret === 0 ? capo : fret;
  const midiAt = (stringIndex: number, fret: number) => {
    const string = tuning.strings[stringIndex];
    return fretToMidi(string.pc, string.octave, soundingFret(fret));
  };

  // Voicings generated against a capoed tuning use fret numbers relative to the
  // capo. Translate them back to physical fret positions for the instrument.
  useEffect(() => {
    const chordParam = searchParams.get('chord');
    if (!chordParam) return;
    const [root, typeId] = chordParam.split('|');
    try {
      const chord = buildChord(root, typeId);
      const capoTuning = applyCapo(tuning, capo);
      const [voicing] = generateVoicings(chord.pitchClasses, capoTuning, chord.rootPc, { maxResults: 1 });
      if (voicing) {
        const next = new Map<number, SelectedNote>();
        let highestFret = 0;
        voicing.frets.forEach((relativeFret, i) => {
          if (relativeFret === null) return;
          const physicalFret = relativeFret === 0 ? 0 : relativeFret + capo;
          highestFret = Math.max(highestFret, physicalFret);
          next.set(i, { fret: physicalFret, pc: fretPc(tuning, i, physicalFret === 0 ? capo : physicalFret) });
        });
        setFretCount((current) => [12, 15, 22, 24].find((count) => count >= Math.max(current, highestFret)) ?? 24);
        setSelected(next);
        setMode('build');
      }
    } catch {
      // Ignore a malformed deep link rather than breaking the workbench.
    }
    // The query is a one-time request; changing tuning/capo subsequently clears the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectedPcs = [...selected.values()].map((note) => note.pc);
  const bass = [...selected.entries()]
    .map(([stringIndex, note]) => ({ midi: midiAt(stringIndex, note.fret), pc: note.pc }))
    .sort((a, b) => a.midi - b.midi)[0];
  const matches = useMemo(
    () => mode === 'build' ? identifyChord(selectedPcs, bass?.pc) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, selectedPcs.join(','), bass?.pc],
  );
  const scaleNotes = useMemo(() => buildScale(scaleRoot, scaleId), [scaleRoot, scaleId]);
  const triadIntervals = useMemo(() => scaleTriadIntervals(scaleId), [scaleId]);
  const scaleType = SCALE_TYPES.find((scale) => scale.id === scaleId)!;
  const displayScaleRoot = pcToNote(noteToPc(scaleRoot), preferFlats);

  const scaleMarkers = useMemo<FretMarkerData[]>(() => {
    if (mode !== 'scale') return [];
    const pcSet = new Set(scaleNotes.map((note) => note.pc));
    const rootPc = noteToPc(scaleRoot);
    const arpPcs = new Set(showArpeggio ? buildArpeggio(scaleRoot, triadIntervals).map((note) => note.pc) : []);
    const markers: FretMarkerData[] = [];
    tuning.strings.forEach((_, stringIndex) => {
      for (let fret = 0; fret <= fretCount; fret++) {
        if (fret > 0 && fret <= capo) continue;
        const pc = fretPc(tuning, stringIndex, fret === 0 ? capo : fret);
        if (pcSet.has(pc)) markers.push({
          stringIndex,
          fret,
          variant: pc === rootPc ? 'root' : arpPcs.has(pc) ? 'cool' : 'scale',
          label: pcToNote(pc, preferFlats),
        });
      }
    });
    return markers;
  }, [mode, scaleRoot, scaleNotes, showArpeggio, triadIntervals, tuning, capo, fretCount, preferFlats]);

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
    if (mode === 'build') {
      setSelected((previous) => {
        const next = new Map(previous);
        const current = next.get(stringIndex);
        if (current && current.fret === fret) next.delete(stringIndex);
        else next.set(stringIndex, { fret, pc });
        return next;
      });
    } else {
      setLastAudition({ stringIndex, fret, pc });
    }
    if (soundOnClick && audioAvailable) playMidi(midiAt(stringIndex, fret));
  };

  const playSelection = () => {
    if (!audioAvailable) return;
    strum(tuning.strings.map((_, i) => {
      const note = selected.get(i);
      return note ? midiAt(i, note.fret) : null;
    }));
  };
  const clearBoard = () => setSelected(new Map());
  const changeFretCount = (count: number) => {
    setFretCount(count);
    setSelected((previous) => new Map([...previous].filter(([, note]) => note.fret <= count)));
    setLastAudition(null);
  };
  const selectedKeys = useMemo(() => new Set([...selected].map(([stringIndex, note]) => markerKey(stringIndex, note.fret))), [selected]);

  return (
    <div className="page workbench-page">
      <header className="workbench-heading">
        <div>
          <p className="eyebrow">Your instrument, understood</p>
          <h1>Fretboard workbench</h1>
          <p className="workbench-intro">Find the sound in your head, one note at a time.</p>
        </div>
        <div className="workbench-heading-meta"><span className="status-dot" /> INTERACTIVE GUITAR NECK</div>
      </header>

      <div className="workbench">
        <div className="wb-mode-bar">
          <div className="wb-tabs" role="tablist" aria-label="Fretboard mode" onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = mode === 'build' ? 'scale' : 'build';
            setMode(next);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next === 'build' ? 0 : 1]?.focus();
          }}>
            <button type="button" role="tab" aria-controls="workbench-neck" aria-selected={mode === 'build'} tabIndex={mode === 'build' ? 0 : -1} onClick={() => setMode('build')}>Identify a chord</button>
            <button type="button" role="tab" aria-controls="workbench-neck" aria-selected={mode === 'scale'} tabIndex={mode === 'scale' ? 0 : -1} onClick={() => setMode('scale')}>Explore scales</button>
          </div>
          <span className="wb-mode-hint">{mode === 'build' ? 'BUILD BY NOTE' : 'MAP THE NECK'}</span>
        </div>

        <div className="wb-controls">
          <div className="wb-control wb-tuning">
            <label htmlFor="tuning">Tuning</label>
            <select id="tuning" value={tuningId} onChange={(event) => { setTuningId(event.target.value); clearBoard(); setLastAudition(null); }}>
              {TUNINGS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="wb-control wb-capo-control">
            <label htmlFor="capo">Capo</label>
            <select id="capo" value={capo} onChange={(event) => { setCapo(Number(event.target.value)); clearBoard(); setLastAudition(null); }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => <option key={item} value={item}>{item === 0 ? 'None' : `Fret ${item}`}</option>)}
            </select>
          </div>
          <div className="wb-control wb-frets-control">
            <label htmlFor="frets">Frets</label>
            <select id="frets" value={fretCount} onChange={(event) => changeFretCount(Number(event.target.value))}>
              {[12, 15, 22, 24].map((item) => <option key={item} value={item}>{item} frets</option>)}
            </select>
          </div>
          <div className="wb-control-actions">
            <button type="button" className="wb-utility" aria-pressed={soundOnClick && audioAvailable} disabled={!audioAvailable} onClick={() => setSoundOnClick((value) => !value)}>
              <Icon name={soundOnClick && audioAvailable ? 'sound' : 'mute'} />
              {audioAvailable ? `Sound ${soundOnClick ? 'on' : 'off'}` : 'Audio unavailable'}
            </button>
            <button type="button" className="wb-utility" aria-expanded={showOptions} onClick={() => setShowOptions((value) => !value)}>
              <Icon name="sliders" /> Options
            </button>
          </div>
        </div>

        {showOptions && (
          <div className="wb-extra-controls">
            <div className="wb-control">
              <label htmlFor="accidentals">Note spelling</label>
              <select id="accidentals" value={preferFlats ? 'flat' : 'sharp'} onChange={(event) => setPreferFlats(event.target.value === 'flat')}>
                <option value="sharp">Sharps (C#)</option><option value="flat">Flats (Db)</option>
              </select>
            </div>
            <p>Note names throughout the neck use this spelling.</p>
          </div>
        )}

        {mode === 'scale' && (
          <div className="wb-scale-controls">
            <div className="wb-control wb-scale-root">
              <label htmlFor="scale-root">Root</label>
              <select id="scale-root" value={scaleRoot} onChange={(event) => setScaleRoot(event.target.value)}>
                {ROOT_NOTES.map((note) => <option key={note} value={note}>{pcToNote(noteToPc(note), preferFlats)}</option>)}
              </select>
            </div>
            <div className="wb-control wb-scale-type">
              <label htmlFor="scale-type">Scale / mode</label>
              <select id="scale-type" value={scaleId} onChange={(event) => { setScaleId(event.target.value); setLastAudition(null); }}>
                {SCALE_TYPES.map((scale) => <option key={scale.id} value={scale.id}>{scale.name}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-sm" aria-pressed={showArpeggio} onClick={() => setShowArpeggio((value) => !value)}>
              Root triad {showArpeggio ? 'on' : 'off'}
            </button>
          </div>
        )}

        <div className="wb-neck-area" id="workbench-neck" role="tabpanel" aria-label={mode === 'build' ? 'Identify a chord' : 'Explore scales'}>
          <div className="wb-neck-header">
            <div><span className="wb-section-kicker">THE NECK</span><span className="wb-neck-description">{tuning.name.split(' (')[0]} tuning <span> / </span> {tuning.strings.length} strings{capo ? ` / capo ${capo}` : ''}</span></div>
            <div className="wb-legend" aria-label="Fretboard legend">
              <span><i className="legend-dot root" />{mode === 'build' ? 'Possible root' : 'Root'}</span>
              <span><i className="legend-dot tone" />{mode === 'build' ? 'Selected note' : 'Scale tone'}</span>
              {mode === 'scale' && showArpeggio && <span><i className="legend-dot triad" />Triad</span>}
            </div>
          </div>
          <Fretboard
            tuning={tuning}
            capo={capo}
            fretCount={fretCount}
            interactive
            interaction={mode === 'scale' ? 'play' : 'select'}
            markers={mode === 'scale' ? scaleMarkers : buildMarkers}
            selectedKeys={mode === 'build' ? selectedKeys : undefined}
            onToggle={toggleNote}
            preferFlats={preferFlats}
            ariaLabel={mode === 'scale' ? `Fretboard showing ${displayScaleRoot} ${scaleType.name}` : 'Interactive guitar fretboard — select notes to identify chords'}
          />
          <div className="wb-neck-footer">
            <p>{mode === 'build' ? 'Select one note per string. Select it again to remove it.' : 'Select any position to inspect or hear its note.'} <span>Use arrow keys to move; scroll to see higher frets.</span></p>
            {mode === 'build' && <div className="wb-board-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearBoard} disabled={selected.size === 0}>Clear</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={playSelection} disabled={selected.size === 0 || !audioAvailable}><Icon name="play" /> Strum selection</button>
            </div>}
          </div>
        </div>
      </div>

      {mode === 'build' ? (
        <div className="wb-results">
          <section className="wb-selection" aria-live="polite">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">YOUR VOICING</p><h2>Selection</h2></div><span>{selected.size} / {tuning.strings.length} strings</span></div>
            {selected.size === 0 ? <p className="wb-empty-copy">Your selected notes will appear here.</p> : (
              <div className="wb-selected-list">
                {[...selected.entries()].sort(([a], [b]) => a - b).map(([stringIndex, note]) => (
                  <div key={stringIndex} className="wb-selected-item">
                    <span className={`note-chip ${matches[0]?.chord.rootPc === note.pc ? 'root' : ''}`}>{pcToNote(note.pc, preferFlats)}</span>
                    <span>String {tuning.strings.length - stringIndex}<small>{note.fret === 0 ? 'Open' : `Fret ${note.fret}`}</small></span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="wb-identification" aria-live="polite">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">CHORD FINDER</p><h2>Identification</h2></div><span>{matches.length > 0 ? `${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'}` : 'LISTEN · DISCOVER'}</span></div>
            {selected.size === 0 ? (
              <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">♪</span><div><h3>Start with a note</h3><p>Select at least two strings to identify a chord.</p></div></div>
            ) : selected.size < 2 ? (
              <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">+</span><div><h3>Add another note</h3><p>Select a note on another string to find a match.</p></div></div>
            ) : matches.length === 0 ? (
              <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">–</span><div><h3>No chord match yet</h3><p>Try adding or removing a note to explore another sound.</p></div></div>
            ) : (
              <div className="wb-match-list">
                {matches.slice(0, 8).map((match) => {
                  const rootName = pcToNote(match.chord.rootPc, preferFlats);
                  const bassName = pcToNote(match.chord.bassPc, preferFlats);
                  const built = buildChord(rootName, match.chord.typeId, bassName);
                  // The engine defaults natural roots to sharps; the workbench's
                  // explicit spelling preference also applies to their tones and bass.
                  const chord = {
                    ...built,
                    bassName,
                    shortName: `${rootName}${built.symbol}${built.isInversion ? `/${bassName}` : ''}`,
                    tones: built.tones.map((tone) => ({ ...tone, name: pcToNote(tone.pc, preferFlats) })),
                  };
                  return (
                    <Link className="wb-match" key={`${match.chord.rootPc}-${match.chord.typeId}`} to={chordPath(chord.rootName, chord.typeId)} title={describeMatch({ ...match, chord }, preferFlats)}>
                      <strong>{chord.shortName}</strong>
                      <span className="wb-match-detail">{chord.typeName}<small>{chord.tones.map((tone) => tone.name).join('  ·  ')}</small></span>
                      <span className="wb-match-strength">{match.strength === 'exact' ? 'Exact' : 'Partial'}</span><Icon name="arrow" />
                    </Link>
                  );
                })}
                <p className="wb-match-note">Partial matches may omit optional chord tones. Results are ranked using the lowest sounding note.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="wb-results wb-scale-results">
          <section className="wb-selection">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">INTERVALS</p><h2>Scale tones</h2></div></div>
            <div className="wb-scale-notes">{scaleNotes.map((note) => <div key={note.interval}><span className={`note-chip ${note.interval === '1' ? 'root' : ''}`}>{pcToNote(note.pc, preferFlats)}</span><small>{note.interval}</small></div>)}</div>
            {showArpeggio && <p className="wb-match-note">Outlined notes form the root triad: {triadIntervals.join(' · ')}.</p>}
          </section>
          <section className="wb-identification">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">SCALE STUDY</p><h2>{displayScaleRoot} {scaleType.name}</h2></div><span>{scaleType.stepFormula}</span></div>
            <p className="wb-empty-copy">{scaleType.description}</p>
            {lastAudition && <p className="wb-match-note">Last note: {pcToNote(lastAudition.pc, preferFlats)} · string {tuning.strings.length - lastAudition.stringIndex} · {lastAudition.fret === 0 ? 'open' : `fret ${lastAudition.fret}`}</p>}
            <div className="row"><Link className="text-link" to={scalePath(scaleId, displayScaleRoot)}>Open in scale library <Icon name="arrow" /></Link>{qualityForTriadIntervals(triadIntervals) && <Link className="text-link" to={triadStudyPath(displayScaleRoot, qualityForTriadIntervals(triadIntervals), scaleId, { tuning: tuningId, capo, frets: fretCount })}>Study its root triad <Icon name="arrow" /></Link>}</div>
          </section>
        </div>
      )}
    </div>
  );
}
