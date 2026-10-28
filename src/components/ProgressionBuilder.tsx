import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import SaveProgressionDialog, { type GradeChoice } from './SaveProgressionDialog';
import ProgressionPatternEditor, { type PatternMode } from './ProgressionPatternEditor';
import { CHORD_TYPES } from '@core/chord-definitions';
import { parseChordInput } from '@core/chordInput';
import type { ChordMatch } from '@core/chord-identifier';
import { buildChord } from '@core/chords';
import { noteToPc, pcToNote, ROOT_NOTES } from '@core/notes';
import { getTuning } from '@core/tunings';
import { isAudioSupported } from '@core/audio';
import { startProgressionPlayback, type ProgressionPlayback } from '@core/progressionAudio';
import { formatPickingPattern, parsePickingPattern, type PlaybackPattern, type StepsPerBeat } from '@core/pickingPattern';
import {
  estimateProgressionDifficulty, progressionId, progressionMidi, searchReferenceShape,
  type ProgressionStep, type SavedProgression,
} from '@core/userProgressions';
import { deleteProgression, getProgressions, LIBRARY_CHANGE_EVENT, saveProgression } from '@core/storage';
import { useLibrarySync } from '@/hooks/LibrarySync';

interface Props {
  active: boolean;
  tuningId: string;
  capo: number;
  selectedFrets: (number | null)[];
  matches: ChordMatch[];
  preferFlats: boolean;
  requestedId: string | null;
  actionSlot: HTMLElement | null;
  pickerSlot: HTMLElement | null;
  onLoadShape: (frets: (number | null)[], tuning: string, capo: number) => void;
}

const displayLevel = (level: string) => level[0].toUpperCase() + level.slice(1);

export default function ProgressionBuilder({ active, tuningId, capo, selectedFrets, matches, preferFlats, requestedId, actionSlot, pickerSlot, onLoadShape }: Props) {
  const [chords, setChords] = useState<ProgressionStep[]>([]);
  const [instrument, setInstrument] = useState<{ tuningId: string; capo: number } | null>(null);
  const [title, setTitle] = useState('My progression');
  const [tempoText, setTempoText] = useState('90');
  const [loop, setLoop] = useState(false);
  const [patternMode, setPatternMode] = useState<PatternMode>('single');
  const [stepsPerBeat, setStepsPerBeat] = useState<StepsPerBeat>(2);
  const [patternText, setPatternText] = useState('5 4 3 2 3 3+1');
  const [gradeChoice, setGradeChoice] = useState<GradeChoice>('auto');
  const [label, setLabel] = useState('');
  const [labelCurrentShape, setLabelCurrentShape] = useState(false);
  const [reference, setReference] = useState<{ frets: (number | null)[]; name: string; tuningId: string; capo: number } | null>(null);
  const [root, setRoot] = useState('C');
  const [typeId, setTypeId] = useState('major');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(getProgressions);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentChord, setCurrentChord] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [messageArea, setMessageArea] = useState<'neck' | 'sequence'>('sequence');
  const notify = useCallback((text: string, area: 'neck' | 'sequence' = 'sequence') => { setMessage(text); setMessageArea(area); }, []);
  const player = useRef<ProgressionPlayback | null>(null);
  const loadedRequest = useRef<string | null>(null);
  const sync = useLibrarySync();
  const bpm = Number(tempoText);
  const validTempo = tempoText.trim() !== '' && Number.isInteger(bpm) && bpm >= 40 && bpm <= 240;
  const estimate = useMemo(() => estimateProgressionDifficulty(chords, instrument?.capo ?? capo, validTempo ? bpm : 90, loop), [chords, instrument, capo, bpm, validTempo, loop]);
  const compatible = !instrument || (instrument.tuningId === tuningId && instrument.capo === capo);
  const patternTuning = getTuning(instrument?.tuningId ?? tuningId);
  const parsedPattern = useMemo(() => parsePickingPattern(patternText, patternTuning), [patternText, patternTuning]);
  const validPattern = patternMode !== 'custom' || parsedPattern.steps !== null;
  const playbackPattern: PlaybackPattern | undefined = patternMode === 'arpeggio' ? { mode: 'arpeggio', stepsPerBeat }
    : patternMode === 'custom' && parsedPattern.steps ? { mode: 'custom', stepsPerBeat, steps: parsedPattern.steps } : undefined;
  const selectedMidi = progressionMidi(selectedFrets, tuningId, capo);
  const distinctNotes = new Set(selectedMidi.filter((midi): midi is number => midi !== null).map((midi) => ((midi % 12) + 12) % 12));
  const match = matches[0];
  const referenceMatches = reference && reference.tuningId === tuningId && reference.capo === capo
    && reference.frets.length === selectedFrets.length && reference.frets.every((fret, index) => fret === selectedFrets[index]);
  const suggestion = referenceMatches ? reference.name : match
    ? buildChord(pcToNote(match.chord.rootPc, preferFlats), match.chord.typeId, pcToNote(match.chord.bassPc, preferFlats)).shortName
    : [...distinctNotes].map((pc) => pcToNote(pc, preferFlats)).join('–');
  const editingIndex = chords.findIndex((chord) => chord.id === editingId);
  // A typed chord is a selection request, not just a label for unrelated frets.
  // A custom name can still explicitly be applied to the current physical shape.
  const chordNeedsLoading = !!label.trim() && !!parseChordInput(label) && !labelCurrentShape;

  const stop = useCallback(() => {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
    setCurrentChord(null);
  }, []);

  useEffect(() => () => { player.current?.stop(); player.current = null; }, []);
  useEffect(() => { if (!active) { stop(); setSaveOpen(false); } }, [active, stop]);
  useEffect(() => {
    const refresh = () => setSaved(getProgressions());
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  const load = useCallback((item: SavedProgression) => {
    stop();
    setChords(item.chords.map((chord) => ({ ...chord, frets: [...chord.frets] })));
    setInstrument({ tuningId: item.tuningId, capo: item.capo });
    setTitle(item.name);
    setTempoText(String(item.bpm));
    setLoop(item.loop);
    setPatternMode(item.pattern?.mode ?? 'single');
    setStepsPerBeat(item.pattern?.stepsPerBeat ?? 2);
    setPatternText(item.pattern?.mode === 'custom' ? formatPickingPattern(item.pattern.steps, getTuning(item.tuningId).strings.length) : '5 4 3 2 3 3+1');
    setGradeChoice(item.difficultyMode === 'auto' ? 'auto' : item.difficulty);
    setSavedId(item.id);
    setEditingId(null);
    setLabel(''); setLabelCurrentShape(false);
    setDirty(false);
    onLoadShape(item.chords[0].frets, item.tuningId, item.capo);
    notify(`Loaded ${item.name}. Select a chord to edit it or add another.`);
  }, [onLoadShape, stop, notify]);

  useEffect(() => {
    if (!requestedId) { loadedRequest.current = null; return; }
    if (loadedRequest.current === requestedId) return;
    const requested = saved.find((item) => item.id === requestedId);
    if (requested) {
      loadedRequest.current = requestedId;
      if (dirty || editingIndex >= 0) notify(`${requested.name} is now available below. Load it when you are ready to replace this unsaved draft.`);
      else load(requested);
    } else if (active) notify('That saved progression is not on this device yet. Sign in and sync, or choose another saved progression.');
  }, [requestedId, saved, load, active, dirty, editingIndex, notify]);

  const discardChanges = () => (!dirty && editingIndex < 0) || window.confirm('Discard unsaved changes to this progression?');
  const newProgression = () => {
    if (!discardChanges()) return;
    stop(); setChords([]); setInstrument(null); setTitle('My progression'); setTempoText('90');
    setLoop(false); setPatternMode('single'); setStepsPerBeat(2); setPatternText('5 4 3 2 3 3+1');
    setGradeChoice('auto'); setLabel(''); setLabelCurrentShape(false); setReference(null); setEditingId(null); setSavedId(null); setDirty(false);
    notify('New progression. Select a chord on the neck, or choose one below.');
  };
  const chooseChord = (nextRoot: string, nextType: string) => {
    setRoot(nextRoot); setTypeId(nextType); setLabelCurrentShape(false);
    setLabel(buildChord(pcToNote(noteToPc(nextRoot), preferFlats), nextType).shortName);
    setReference(null);
  };
  const changeChordName = (value: string) => {
    setLabel(value); setLabelCurrentShape(false); setReference(null);
    const parsed = parseChordInput(value);
    if (parsed) { setRoot(pcToNote(noteToPc(parsed.root))); setTypeId(parsed.typeId); }
  };
  const loadReference = () => {
    const parsed = parseChordInput(label.trim() || suggestion || 'C');
    if (!parsed) { notify('Chord not recognized. Try a name such as C, Am7 or F#7, choose a root and type, or add a shape with your own name.', 'neck'); return; }
    try {
      const { shape, searchTruncated } = searchReferenceShape(parsed.root, parsed.typeId, tuningId, capo, parsed.bass);
      if (!shape) { notify(`${searchTruncated ? 'The search reached its safety limit. ' : ''}No starting shape was found within the current model and settings. Try another chord or select the notes yourself.`, 'neck'); return; }
      onLoadShape(shape.frets, tuningId, capo);
      setReference({ ...shape, tuningId, capo });
      setLabel(''); setLabelCurrentShape(false);
      notify(`${shape.name} is on the neck. ${searchTruncated ? 'The search reached its safety limit; other shapes may exist. ' : ''}Adjust it if you like, then add it to the progression.`, 'neck');
    } catch { notify('Could not load that chord. Try selecting its notes on the neck.', 'neck'); }
  };
  const addOrUpdate = () => {
    if (distinctNotes.size < 2 || !compatible || chordNeedsLoading) return;
    stop();
    const name = label.trim() || suggestion || 'Unnamed chord';
    if (name.length > 100) { notify('Chord names can be at most 100 characters.', 'neck'); return; }
    if (editingIndex >= 0) {
      setChords((current) => current.map((item) => item.id === editingId ? { ...item, name, frets: [...selectedFrets] } : item));
      notify(`Updated ${name}.`, 'neck');
    } else {
      setChords((current) => [...current, { id: progressionId(), name, frets: [...selectedFrets], beats: 4 }]);
      if (!instrument) setInstrument({ tuningId, capo });
      notify(`Added ${name}. Adjust the neck or choose another chord to continue.`, 'neck');
    }
    setEditingId(null); setLabel(''); setLabelCurrentShape(false); setDirty(true);
  };
  const edit = (item: ProgressionStep) => {
    if (!instrument) return;
    stop(); setEditingId(item.id); setLabel(item.name); setLabelCurrentShape(true);
    onLoadShape(item.frets, instrument.tuningId, instrument.capo);
    notify(`Editing ${item.name} on the neck. Update it or cancel editing.`, 'neck');
  };
  const updateChords = (next: ProgressionStep[]) => {
    stop(); setChords(next); setDirty(true);
    if (!next.length) { setInstrument(null); setEditingId(null); }
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = [...chords];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    updateChords(next);
  };
  const save = (rawName: string, grade: GradeChoice): string | null => {
    if (!instrument || !chords.length || !validTempo || editingIndex >= 0) return 'Update or cancel the chord edit before saving.';
    if (!validPattern) return 'Fix the picking pattern before saving.';
    const name = rawName.trim();
    if (!name || name.length > 100) return 'Give the progression a name of up to 100 characters.';
    const item: SavedProgression = {
      id: savedId ?? progressionId(), name, ...instrument, bpm, loop,
      difficulty: grade === 'auto' ? estimate.level : grade,
      difficultyMode: grade === 'auto' ? 'auto' : 'manual', chords,
      ...(playbackPattern ? { pattern: playbackPattern } : {}),
    };
    if (!saveProgression(item)) return 'Could not save this progression on this device. Check browser storage and try again.';
    setSavedId(item.id); setTitle(name); setGradeChoice(grade); setDirty(false);
    notify(sync.session ? 'Saved on this device; account sync will run automatically.' : 'Saved on this device. Sign in to sync it across devices.');
    return null;
  };
  const play = () => {
    if (!instrument || !chords.length || !validTempo || !validPattern || !isAudioSupported()) return;
    stop();
    try {
      const playbackChords = chords.map((item) => ({ midi: progressionMidi(item.frets, instrument.tuningId, instrument.capo), beats: item.beats }));
      const callbacks = {
        onChord: (index: number) => { setCurrentChord(index); notify('Playing progression.'); },
        onEnd: () => { player.current = null; setPlaying(false); setCurrentChord(null); notify('Playback finished.'); },
        onError: () => { player.current = null; setPlaying(false); setCurrentChord(null); notify('Audio could not be started. Please try again.'); },
      };
      player.current = playbackPattern
        ? startProgressionPlayback(playbackChords, bpm, loop, callbacks, playbackPattern)
        : startProgressionPlayback(playbackChords, bpm, loop, callbacks);
      setPlaying(true); notify('Preparing guitar sounds…');
    } catch { notify('Audio could not be started in this browser.'); }
  };

  return (
    <section className="progression-builder" aria-labelledby="progression-heading">
      {active && actionSlot && createPortal(<>
        <button type="button" className="btn btn-primary btn-sm" disabled={distinctNotes.size < 2 || !compatible || chordNeedsLoading} onClick={addOrUpdate}>{editingIndex >= 0 ? `Update chord ${editingIndex + 1}` : 'Add selected chord'}</button>
        {editingIndex >= 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setLabel(''); notify('Editing cancelled.', 'neck'); }}>Cancel edit</button>}
      </>, actionSlot)}
      {active && pickerSlot && createPortal(<div className="progression-add">
        <div className="progression-chord-entry">
          <div className="field"><label htmlFor="progression-chord-label">Chord name</label><input id="progression-chord-label" maxLength={100} placeholder={suggestion || 'C'} value={label || (referenceMatches ? reference?.name ?? '' : '')} onChange={(event) => changeChordName(event.target.value)} aria-describedby="progression-chord-help" /></div>
          <button type="button" className="btn btn-sm" aria-expanded={pickerOpen} aria-controls="progression-picker" onClick={() => setPickerOpen((open) => !open)}>Choose root &amp; type</button>
          <button type="button" className="btn btn-sm" onClick={loadReference}>Show chord on neck</button>
        </div>
        <div id="progression-picker" className="progression-picker" hidden={!pickerOpen}>
          <div className="field"><label htmlFor="progression-root">Chord root</label><select id="progression-root" value={root} onChange={(event) => chooseChord(event.target.value, typeId)}>{ROOT_NOTES.map((note) => <option key={note} value={note}>{pcToNote(noteToPc(note), preferFlats)}</option>)}</select></div>
          <div className="field"><label htmlFor="progression-type">Chord type</label><select id="progression-type" value={typeId} onChange={(event) => chooseChord(root, event.target.value)}>{CHORD_TYPES.map((type) => <option key={type.id} value={type.id}>{type.name} {type.symbols[0] ? `(${type.symbols[0]})` : ''}</option>)}</select></div>
        </div>
        <p id="progression-chord-help" className="small faint">Type a chord or choose a root and type, then show its starting shape; or select notes directly. The exact frets are saved.</p>
        {chordNeedsLoading && <div className="progression-pending"><span className="small muted">Show this chord on the neck before adding it.</span>{distinctNotes.size >= 2 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLabelCurrentShape(true)}>Use this name for current frets instead</button>}</div>}
        {messageArea === 'neck' && <p className="small muted" role="status" aria-live="polite">{message}</p>}
        {!compatible && <div className="progression-setup-warning"><p className="small" role="status">This progression uses {getTuning(instrument!.tuningId).name}{instrument!.capo ? ` with capo ${instrument!.capo}` : ' without a capo'}. Restore that setup to add a chord, or start a new progression.</p><button type="button" className="btn btn-sm" onClick={() => { const chord = chords.find((item) => item.id === editingId) ?? chords[0]; onLoadShape(chord.frets, instrument!.tuningId, instrument!.capo); notify('Progression setup restored.', 'neck'); }}>Restore progression setup</button></div>}
      </div>, pickerSlot)}
      <div className="progression-sequence">
        <div className="progression-heading"><div><h2 id="progression-heading">Chord order</h2><span className="small faint">{chords.length} {chords.length === 1 ? 'chord' : 'chords'}</span></div><button type="button" className="btn btn-sm" onClick={newProgression}>New progression</button></div>
        {chords.length === 0 ? <p className="wb-empty-copy">No chords yet. Add a selected shape to begin.</p> : (
          <ol className="progression-steps">
            {chords.map((chord, index) => (
              <li key={chord.id} className={currentChord === index ? 'is-playing' : ''} aria-current={currentChord === index ? 'step' : undefined}>
                <span className="progression-index">{index + 1}</span>
                <div className="progression-step-name"><strong>{chord.name}</strong><small>{chord.frets.map((fret) => fret === null ? 'x' : fret).join(' ')}</small></div>
                <div className="field progression-beats"><label htmlFor={`beats-${chord.id}`}>Beats<span className="sr-only"> for chord {index + 1}, {chord.name}</span></label><select id={`beats-${chord.id}`} value={chord.beats} onChange={(event) => updateChords(chords.map((item) => item.id === chord.id ? { ...item, beats: Number(event.target.value) } : item))}>{Array.from({ length: 16 }, (_, value) => <option key={value + 1} value={value + 1}>{value + 1}</option>)}</select></div>
                <div className="progression-step-actions">
                  <button type="button" className="btn btn-sm" onClick={() => edit(chord)} aria-label={`Edit chord ${index + 1}, ${chord.name}`}>Edit</button>
                  <button type="button" className="btn btn-sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move chord ${index + 1}, ${chord.name} earlier`}>←</button>
                  <button type="button" className="btn btn-sm" disabled={index === chords.length - 1} onClick={() => move(index, 1)} aria-label={`Move chord ${index + 1}, ${chord.name} later`}>→</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => { if (editingId === chord.id) { setEditingId(null); setLabel(''); } updateChords(chords.filter((item) => item.id !== chord.id)); }} aria-label={`Remove chord ${index + 1}, ${chord.name}`}>Remove</button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ProgressionPatternEditor
        tuning={patternTuning} mode={patternMode} stepsPerBeat={stepsPerBeat} text={patternText}
        error={patternMode === 'custom' ? parsedPattern.error : null}
        onModeChange={(mode) => { stop(); setPatternMode(mode); setDirty(true); }}
        onTimingChange={(value) => { stop(); setStepsPerBeat(value); setDirty(true); }}
        onTextChange={(value) => { stop(); setPatternText(value); setDirty(true); }}
      />
      <div className="progression-settings">
        <div className="field"><label htmlFor="progression-tempo">Tempo (BPM)</label><input id="progression-tempo" type="number" min={40} max={240} step={1} value={tempoText} onChange={(event) => { stop(); setTempoText(event.target.value); setDirty(true); }} aria-describedby="progression-tempo-help" /><small id="progression-tempo-help">40–240 quarter-note beats per minute</small></div>
        <label className="progression-loop"><input type="checkbox" checked={loop} onChange={(event) => { stop(); setLoop(event.target.checked); setDirty(true); }} /> Loop progression</label>
        <div className="progression-play-actions">
          <button type="button" className="btn btn-primary" disabled={!chords.length || !validTempo || !validPattern || !isAudioSupported() || playing || editingIndex >= 0} onClick={play}>Play progression</button>
          <button type="button" className="btn" disabled={!playing} onClick={() => { stop(); notify('Playback stopped.'); }}>Stop</button>
        </div>
      </div>
      <div className="progression-save-row"><button type="button" className="btn btn-primary" disabled={!chords.length || !validTempo || !validPattern || editingIndex >= 0} onClick={() => setSaveOpen(true)}>{savedId ? 'Save changes' : 'Save progression'}</button></div>
      {saveOpen && <SaveProgressionDialog name={title} grade={gradeChoice} estimate={estimate} onSave={save} onClose={() => setSaveOpen(false)} />}
      {editingIndex >= 0 && <p className="small muted">Update or cancel the chord edit before playing or saving.</p>}
      {!isAudioSupported() && <p className="small muted">Playback is unavailable because this browser does not support Web Audio. You can still build and save progressions.</p>}
      {!validTempo && <p className="small" role="alert">Enter a whole-number tempo from 40 to 240 BPM.</p>}
      {messageArea === 'sequence' && <p className="small muted" role="status" aria-live="polite">{message}</p>}

      <section className="progression-saved" aria-labelledby="saved-progressions-heading">
        <div className="progression-heading"><h3 id="saved-progressions-heading">Saved progressions</h3><Link to="/library" className="text-link">Library and account</Link></div>
        {saved.length === 0 ? <p className="small muted">Saved progressions stay on this device. Sign in to sync them across devices.</p> : (
          <ul className="progression-saved-list">
            {saved.map((item) => (
              <li key={item.id}>
                <div><strong>{item.name}</strong><small>{displayLevel(item.difficulty)} · {item.chords.length} {item.chords.length === 1 ? 'chord' : 'chords'} · {item.bpm} BPM</small></div>
                <div className="row"><button type="button" className="btn btn-sm" onClick={() => { if (discardChanges()) load(item); }} aria-label={`Load ${item.name}`}>Load</button><button type="button" className="btn btn-sm btn-ghost" onClick={() => {
                  if (!window.confirm(`Delete “${item.name}” from your library?`)) return;
                  if (!deleteProgression(item.id)) { notify('Could not delete this progression on this device. Check browser storage and try again.'); return; }
                  if (savedId === item.id) { setSavedId(null); setDirty(true); }
                  notify(`Deleted ${item.name}.`);
                }} aria-label={`Delete ${item.name}`}>Delete</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
