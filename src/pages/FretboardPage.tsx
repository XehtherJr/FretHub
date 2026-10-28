import { useMemo, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Fretboard, { FretMarkerData, markerKey } from '@/components/Fretboard';
import Icon from '@/components/Icon';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { fretPc, generateVoicings } from '@core/voicing-engine';
import { pcToNote, ROOT_NOTES, noteToPc, fretToMidi } from '@core/notes';
import { identifyChord, describeMatch } from '@core/chord-identifier';
import { buildChord, chordVoicingConstraints } from '@core/chords';
import { buildScale, buildArpeggio, scaleTriadIntervals, SCALE_TYPES } from '@core/scales';
import { playMidi, playSequence, strum, isAudioSupported } from '@core/audio';
import { chordPath, instrumentFromSearch, scalePath, triadStudyPath } from '@/lib/urls';
import { qualityForTriadIntervals } from '@core/triadRelationships';

interface SelectedNote { fret: number; pc: number; }

/** Prefer to explain awkward double-accidental spellings with an enharmonic alternative. */
function spellingCost(names: string[]): number {
  return names.reduce((total, name) => {
    const accidentals = name.slice(1).length;
    return total + accidentals + Math.max(0, accidentals - 1) * 2 + (/^(B#|E#|Cb|Fb)$/.test(name) ? 1 : 0);
  }, 0);
}

export default function FretboardPage() {
  const [searchParams] = useSearchParams();
  const [tuningId, setTuningId] = useState(() => instrumentFromSearch(searchParams).tuning);
  const [capo, setCapo] = useState(() => instrumentFromSearch(searchParams).capo);
  const [fretCount, setFretCount] = useState(12);
  const [preferFlats, setPreferFlats] = useState(false);
  const [mode, setMode] = useState<'build' | 'scale'>('build');
  const [soundOnClick, setSoundOnClick] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [selected, setSelected] = useState<Map<number, SelectedNote>>(new Map());
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [assumedRoot, setAssumedRoot] = useState<number | null>(null);
  const [expandedMatchKey, setExpandedMatchKey] = useState<string | null>(null);
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
    const instrument = instrumentFromSearch(searchParams);
    const requestedTuning = getTuning(instrument.tuning);
    setTuningId(instrument.tuning);
    setCapo(instrument.capo);
    setSelected(new Map());
    setLoadMessage(null);
    const chordParam = searchParams.get('chord');
    if (!chordParam) return;
    const [root, typeId] = chordParam.split('|');
    try {
      const chord = buildChord(root, typeId);
      const bassParam = searchParams.get('bass');
      const requestedBass = bassParam ? noteToPc(bassParam) : undefined;
      const capoTuning = applyCapo(requestedTuning, instrument.capo);
      const constraints = chordVoicingConstraints(chord);
      const tones = requestedBass !== undefined && !chord.pitchClasses.includes(requestedBass)
        ? [...chord.pitchClasses, requestedBass] : chord.pitchClasses;
      const options = {
        ...constraints,
        requiredBass: requestedBass,
        maxFret: Math.min(14, 24 - instrument.capo),
        maxMuted: constraints.requiredVoicing ? Math.max(2, requestedTuning.strings.length - constraints.requiredVoicing.length) : 2,
        maxResults: 1,
      };
      // Prefer a complete diagram, but allow declared omissions when there
      // are more chord tones than the guitar can conveniently play.
      const complete = generateVoicings(tones, capoTuning, chord.rootPc, { ...options, allowedOmissions: [] });
      const [voicing] = complete.length ? complete : generateVoicings(tones, capoTuning, chord.rootPc, options);
      if (voicing) {
        const next = new Map<number, SelectedNote>();
        let highestFret = 0;
        voicing.frets.forEach((relativeFret, i) => {
          if (relativeFret === null) return;
          const physicalFret = relativeFret === 0 ? 0 : relativeFret + instrument.capo;
          highestFret = Math.max(highestFret, physicalFret);
          next.set(i, { fret: physicalFret, pc: fretPc(requestedTuning, i, physicalFret === 0 ? instrument.capo : physicalFret) });
        });
        setFretCount((current) => [12, 15, 22, 24].find((count) => count >= Math.max(current, highestFret)) ?? 24);
        setSelected(next);
        setMode('build');
      } else {
        setLoadMessage('No playable reference voicing was found for this chord, bass, tuning and capo. Try changing the instrument settings or select notes yourself.');
      }
    } catch {
      setLoadMessage('This chord link could not be understood. Try selecting notes yourself or opening a chord from the library.');
    }
    // Interpret the query on navigation; changing the controls subsequently clears the board.
  }, [searchParams]);

  const soundingNotes = [...selected.entries()].map(([stringIndex, note]) => ({ midi: midiAt(stringIndex, note.fret), pc: note.pc }));
  const selectedPcs = soundingNotes.map((note) => note.pc);
  const selectedMidis = soundingNotes.map((note) => note.midi);
  const bass = [...soundingNotes].sort((a, b) => a.midi - b.midi)[0];
  const matches = useMemo(
    () => mode === 'build' ? identifyChord(selectedPcs, bass?.pc, { assumedRoot: assumedRoot ?? undefined, midis: selectedMidis }) : [],
    // The MIDI values matter for voicing-specific names, even if the pitch classes stay the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, selectedPcs.join(','), selectedMidis.join(','), bass?.pc, assumedRoot],
  );
  const matchKey = `${selectedMidis.join(',')}|${assumedRoot ?? ''}`;
  const showAllMatches = expandedMatchKey === matchKey;
  const displayScaleRoot = pcToNote(noteToPc(scaleRoot), preferFlats);
  const scaleNotes = useMemo(() => buildScale(displayScaleRoot, scaleId), [displayScaleRoot, scaleId]);
  const triadIntervals = useMemo(() => scaleTriadIntervals(scaleId), [scaleId]);
  const scaleType = SCALE_TYPES.find((scale) => scale.id === scaleId)!;

  const scaleMarkers = useMemo<FretMarkerData[]>(() => {
    if (mode !== 'scale') return [];
    const notesByPc = new Map(scaleNotes.map((note) => [note.pc, note]));
    const rootPc = noteToPc(scaleRoot);
    const arpPcs = new Set(showArpeggio ? buildArpeggio(scaleRoot, triadIntervals).map((note) => note.pc) : []);
    const markers: FretMarkerData[] = [];
    tuning.strings.forEach((_, stringIndex) => {
      for (let fret = 0; fret <= fretCount; fret++) {
        if (fret > 0 && fret <= capo) continue;
        const pc = fretPc(tuning, stringIndex, fret === 0 ? capo : fret);
        const note = notesByPc.get(pc);
        if (note) markers.push({
          stringIndex,
          fret,
          variant: pc === rootPc ? 'root' : arpPcs.has(pc) ? 'cool' : 'scale',
          label: note.name,
          description: `${note.intervalName} of ${displayScaleRoot}`,
        });
      }
    });
    return markers;
  }, [mode, scaleRoot, displayScaleRoot, scaleNotes, showArpeggio, triadIntervals, tuning, capo, fretCount]);

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
    setLoadMessage(null);
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

  const selectedMidi = () => tuning.strings.map((_, i) => {
    const note = selected.get(i);
    return note ? midiAt(i, note.fret) : null;
  });
  const playSelection = () => {
    if (audioAvailable) strum(selectedMidi());
  };
  const arpeggiateSelection = () => {
    if (audioAvailable) playSequence(selectedMidi().filter((midi): midi is number => midi !== null), 0.35, 1.4);
  };
  const clearBoard = () => { setSelected(new Map()); setLoadMessage(null); };
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
            <p>{mode === 'build' ? 'Select one note per string. Select it again to remove it. Arpeggiate plays selected strings one by one.' : 'Select any position to inspect or hear its note.'} <span>Use arrow keys to move; scroll to see higher frets.</span></p>
            {mode === 'build' && <div className="wb-board-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearBoard} disabled={selected.size === 0}>Clear</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={playSelection} disabled={selected.size === 0 || !audioAvailable}><Icon name="play" /> Strum selection</button>
              <button type="button" className="btn btn-sm" onClick={arpeggiateSelection} disabled={selected.size === 0 || !audioAvailable} title={`Play selected strings one at a time, from string ${tuning.strings.length} toward string 1`}><Icon name="play" /> Arpeggiate selection</button>
            </div>}
          </div>
        </div>
      </div>

      {mode === 'build' ? (
        <div className="wb-results">
          <section className="wb-selection" aria-live="polite">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">YOUR VOICING</p><h2>Selection</h2></div><span>{selected.size} / {tuning.strings.length} strings</span></div>
            {loadMessage && <p className="wb-empty-copy">{loadMessage}</p>}
            {selected.size === 0 && !loadMessage && <p className="wb-empty-copy">Your selected notes will appear here.</p>}
            {selected.size > 0 && (
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
          <section className="wb-identification">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">CHORD FINDER</p><h2>Identification</h2></div><span aria-live="polite">{matches.length > 0 ? `${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'}` : selected.size >= 2 ? 'No matches yet' : 'LISTEN · DISCOVER'}</span></div>
            <div className="wb-root-hint field">
              <label htmlFor="identify-root">Root hint (optional)</label>
              <select id="identify-root" value={assumedRoot ?? ''} aria-describedby="identify-root-help" onChange={(event) => setAssumedRoot(event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">Any played root</option>
                {ROOT_NOTES.map((note) => <option key={note} value={noteToPc(note)}>{pcToNote(noteToPc(note), preferFlats)}</option>)}
              </select>
              <p id="identify-root-help">Choose a root to explore that interpretation, including rootless voicings. A root that is not played will be marked as assumed.</p>
            </div>
            <div>
            {selected.size === 0 ? (
                <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">♪</span><div><h3>Start with a note</h3><p>Select at least two different notes to identify a chord.</p></div></div>
              ) : selected.size < 2 ? (
                <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">+</span><div><h3>Add another note</h3><p>Select a different note on another string to find a match.</p></div></div>
              ) : new Set(selectedPcs).size < 2 ? (
                <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">+</span><div><h3>One note, possibly in different octaves</h3><p>Add a different note to find a chord.</p></div></div>
              ) : matches.length === 0 ? (
                <div className="wb-result-empty"><span className="wb-empty-symbol" aria-hidden="true">–</span><div><h3>No chord match yet</h3><p>{assumedRoot === null ? 'Try adding or removing a note, or choose a root hint.' : 'Try another root hint or add or remove a note.'}</p></div></div>
              ) : (
                <div className="wb-match-list" id="identified-chords">
                  {(showAllMatches ? matches : matches.slice(0, 8)).map((match) => {
                    const rootName = pcToNote(match.chord.rootPc, preferFlats);
                    // Chord-tone basses keep the interval spelling; a non-chord
                    // bass follows the player's sharp/flat display preference.
                    const chord = buildChord(rootName, match.chord.typeId, pcToNote(match.chord.bassPc, preferFlats));
                    const alternateRoot = pcToNote(chord.rootPc, !preferFlats);
                    const alternate = alternateRoot !== rootName ? buildChord(alternateRoot, chord.typeId, pcToNote(chord.bassPc, !preferFlats)) : null;
                    const showAlternate = alternate && spellingCost(chord.tones.map((tone) => tone.name)) >= spellingCost(alternate.tones.map((tone) => tone.name)) + 2;
                    const omitted = chord.tones.filter((tone) => match.missingPcs.includes(tone.pc) && (!match.rootAssumed || tone.pc !== chord.rootPc));
                    const bassName = chord.bassName;
                    return (
                      <Link className="wb-match" key={`${match.chord.rootPc}-${match.chord.typeId}`} to={chordPath(chord.rootName, chord.typeId, bassName, { tuning: tuningId, capo })} title={describeMatch({ ...match, chord }, preferFlats)}>
                        <strong>{chord.shortName}</strong>
                        <span className="wb-match-detail">{chord.typeName}<small>Chord tones: {chord.tones.map((tone) => tone.name).join(' · ')}</small>
                          {showAlternate && <small>Also spelled {alternate!.shortName}</small>}
                          {match.rootAssumed && <small>Root {chord.rootName} assumed, not played</small>}
                          {omitted.length > 0 && <small>Not played: {omitted.map((tone) => `${tone.name} (${tone.interval})`).join(', ')}</small>}
                          {match.strength === 'slash' && <small>{chord.bassName} is a non-chord bass</small>}
                        </span>
                        <span className="wb-match-strength">{match.strength === 'exact' ? 'Exact' : match.strength === 'partial' ? 'Partial' : 'Slash bass'}</span><Icon name="arrow" />
                      </Link>
                    );
                  })}
                  {matches.length > 8 && <button type="button" className="btn btn-sm wb-show-matches" aria-expanded={showAllMatches} aria-controls="identified-chords" onClick={() => setExpandedMatchKey(showAllMatches ? null : matchKey)}>{showAllMatches ? 'Show fewer matches' : `Show all ${matches.length} matches`}</button>}
                  <p className="wb-match-note">Exact matches use the same pitch classes; partial matches name missing tones. Slash bass means the bass is outside the chord. Results use the lowest sounding note, but context determines the intended name. Links retain bass, tuning and capo but open a reference whose voicings may differ from this selection. A D# on the neck may be spelled Eb in a C minor chord.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="wb-results wb-scale-results">
          <section className="wb-selection">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">INTERVALS</p><h2>Scale tones</h2></div></div>
            <div className="wb-scale-notes">{scaleNotes.map((note) => <div key={note.interval}><span className={`note-chip ${note.interval === '1' ? 'root' : ''}`}>{note.name}</span><small>{note.interval}</small></div>)}</div>
            {showArpeggio && <p className="wb-match-note">Outlined notes form the root triad: {triadIntervals.join(' · ')}.</p>}
          </section>
          <section className="wb-identification">
            <div className="wb-result-heading"><div><p className="wb-section-kicker">SCALE STUDY</p><h2>{displayScaleRoot} {scaleType.name}</h2></div><span>{scaleType.stepFormula}</span></div>
            <p className="wb-empty-copy">{scaleType.description}</p>
            {lastAudition && <p className="wb-match-note">Last note: {scaleNotes.find((note) => note.pc === lastAudition.pc)?.name ?? pcToNote(lastAudition.pc, preferFlats)} · string {tuning.strings.length - lastAudition.stringIndex} · {lastAudition.fret === 0 ? 'open' : `fret ${lastAudition.fret}`}</p>}
            <div className="row"><Link className="text-link" to={scalePath(scaleId, displayScaleRoot)}>Open in scale library <Icon name="arrow" /></Link>{qualityForTriadIntervals(triadIntervals) && <Link className="text-link" to={triadStudyPath(displayScaleRoot, qualityForTriadIntervals(triadIntervals), scaleId, { tuning: tuningId, capo, frets: fretCount })}>Study its root triad <Icon name="arrow" /></Link>}</div>
          </section>
        </div>
      )}
    </div>
  );
}
