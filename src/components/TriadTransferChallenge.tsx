import { useEffect, useMemo, useState } from 'react';
import type { BuiltChord } from '@core/chords';
import { intervalSemitones } from '@core/intervals';
import { fretToMidi, pcToNote } from '@core/notes';
import { getCompletedLessons, LIBRARY_CHANGE_EVENT, markLessonComplete } from '@core/storage';
import { thirdFretFromRoot, thirdTransferPlan } from '@core/triadRelationships';
import { fretPc } from '@core/voicing-engine';
import { isAudioSupported, playMidi } from '@core/audio';
import type { Tuning } from '@core/tunings';
import Fretboard, { type FretMarkerData } from './Fretboard';

/** Stored in the existing synced challenge collection, separate from the lesson check. */
export const TRIAD_TRANSFER_ID = 'triad-transfer-v1';

type Guide = 'off' | 'root' | 'third';
interface Props { chord: BuiltChord; tuning: Tuning; capo: number; fretCount: number }

export default function TriadTransferChallenge({ chord, tuning, capo, fretCount }: Props) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [correct, setCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [guide, setGuide] = useState<Guide>('off');
  const [rootFret, setRootFret] = useState<number | null>(null);
  const [rootHint, setRootHint] = useState(false);
  const [saved, setSaved] = useState(() => getCompletedLessons().includes(TRIAD_TRANSFER_ID));
  useEffect(() => {
    const refresh = () => setSaved(getCompletedLessons().includes(TRIAD_TRANSFER_ID));
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  const plan = useMemo(() => thirdTransferPlan(chord, tuning, capo, fretCount), [chord, tuning, capo, fretCount]);
  const activeChord = step === 1 ? chord : plan?.transferChord ?? chord;
  const task = step === 1 ? plan?.first : plan?.second;
  const distance = intervalSemitones(activeChord.tones[1].interval);
  const exerciseFrets = plan?.fretCount ?? fretCount;
  const stringNumber = task ? tuning.strings.length - task.stringIndex : 0;
  const openPc = task ? fretPc(tuning, task.stringIndex, capo) : 0;
  const openName = pcToNote(openPc, activeChord.rootName.includes('b'));
  const usualRootNames = [pcToNote(activeChord.rootPc), pcToNote(activeChord.rootPc, true)];
  const rootAlias = usualRootNames.includes(activeChord.rootName) ? null : usualRootNames[0];
  const markedFret = guide === 'root' && rootHint ? task?.rootFret : guide === 'third' ? rootFret : null;
  const markers: FretMarkerData[] = task && markedFret != null
    ? [{ stringIndex: task.stringIndex, fret: markedFret, label: 'R', variant: 'root', description: `${activeChord.rootName}, root` }]
    : [];
  const fretLabel = (fret: number) => fret === 0 ? (capo ? `open at capo fret ${capo}` : 'open') : `fret ${fret}`;

  const resetGuide = () => { setGuide('off'); setRootFret(null); setRootHint(false); };
  const answer = (stringIndex: number, fret: number, pc: number) => {
    if (!task || correct) return;
    const physical = fret === 0 ? capo : fret;
    const string = tuning.strings[stringIndex];
    if (isAudioSupported()) playMidi(fretToMidi(string.pc, string.octave, physical));
    if (stringIndex !== task.stringIndex) {
      setFeedback(`That is string ${tuning.strings.length - stringIndex}, ${fretLabel(fret)}. Try string ${stringNumber}.`);
      return;
    }

    if (guide === 'root') {
      if (pc !== activeChord.rootPc) {
        setFeedback(`That position sounds ${pcToNote(pc, activeChord.rootName.includes('b'))}. Find the root ${activeChord.rootName} on string ${stringNumber}; use the note cycle or show one root below.`);
        return;
      }
      const target = thirdFretFromRoot(fret, capo, exerciseFrets, distance);
      if (target === null || target < task.minimumFret) {
        setFeedback(`That is a ${activeChord.rootName}, but this exercise needs room to count ${distance} frets upward and land at fret ${task.minimumFret} or higher. Try another ${activeChord.rootName} on this string.`);
        return;
      }
      setRootFret(fret);
      setRootHint(false);
      setGuide('third');
      setFeedback(`Yes — ${activeChord.rootName} is the root at ${fretLabel(fret)}. Keep that R in view and count ${distance} frets to the right on the same string.`);
      return;
    }

    if (guide === 'third' && rootFret !== null) {
      const expected = thirdFretFromRoot(rootFret, capo, exerciseFrets, distance);
      if (fret !== expected) {
        const moved = physical - (rootFret === 0 ? capo : rootFret);
        setFeedback(moved <= 0
          ? `Start at the R and move right, toward higher fret numbers. Count ${distance} frets on the same string.`
          : `That is ${moved} ${moved === 1 ? 'fret' : 'frets'} above the root. Count ${distance} frets to find this third; try again.`);
        return;
      }
    } else if (task.minimumFret > 0 && fret < task.minimumFret) {
      setFeedback(`That is ${fretLabel(fret)}. For this exercise, try string ${stringNumber} at fret ${task.minimumFret} or higher.`);
      return;
    }
    if (pc !== task.third.pc) {
      setFeedback(`That position sounds ${pcToNote(pc, activeChord.rootName.includes('b'))}. The third is ${distance} semitones above ${activeChord.rootName}; try another fret on this string.`);
      return;
    }
    setCorrect(true);
    setFeedback(`Yes — ${task.third.name} is the ${task.third.intervalName} of ${activeChord.rootName}, ${distance} semitones above the root. The same relationship works in every register.`);
    if (step === 2) { markLessonComplete(TRIAD_TRANSFER_ID); setSaved(true); }
  };

  return <section className="triad-practice" aria-labelledby="transfer-heading">
    <div className="triad-section-heading"><div><p className="eyebrow">04 / TAKE IT WITH YOU</p><h2 id="transfer-heading">Find the third yourself</h2></div><p>Find a third without highlighted answers, then repeat in a new key and on another string. Optional guidance starts from a root you can locate.</p></div>
    {!started ? <div className="triad-practice-start"><button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>Start the two-key challenge</button><span>{saved ? 'You have completed this application challenge; try it again.' : 'Two short steps · no microphone needed'}</span></div> : task ? <>
      <div className="triad-task-head"><div><span className="triad-task-step">STEP {step} OF 2 · {step === 1 ? 'APPLY' : 'TRANSFER'}</span><h3>Find the third of {activeChord.fullName}</h3><p>Choose <strong>string {stringNumber}</strong>{task.minimumFret ? <> at <strong>fret {task.minimumFret} or higher</strong></> : ' at any playable fret'}. You can count {distance} frets up from {activeChord.rootName} on one string.</p>{exerciseFrets > fretCount && <p>This exercise shows through fret {exerciseFrets} so both root-to-third paths have enough room.</p>}</div><button type="button" className="btn btn-sm" onClick={() => { setStarted(false); setStep(1); setCorrect(false); setFeedback(''); resetGuide(); }}>Close challenge</button></div>
      {!correct && <div className="triad-task-guide">
        {guide === 'off' ? <button type="button" className="btn btn-sm" onClick={() => { setGuide('root'); setFeedback(''); }}>Guide me: find the root first</button> : <>
          <p><strong>{guide === 'root' ? `First find the root ${activeChord.rootName}.` : `Now find its third.`}</strong> String 1 is the thinnest (bottom line); string {tuning.strings.length} is at the top. The numbers below the neck are physical frets. “Open” is at the left{capo ? ` and sounds at capo fret ${capo}` : ''}.</p>
          {guide === 'root' && <><p>Open string {stringNumber} sounds {openName}{capo ? ` at capo fret ${capo}; the next fret is ${capo + 1}` : ''}. Each fret to the right is one step in this repeating cycle: C · C#/Db · D · D#/Eb · E · F · F#/Gb · G · G#/Ab · A · A#/Bb · B · C. E–F and B–C are adjacent.</p>{rootAlias && <p>{activeChord.rootName} sounds the same as {rootAlias} here; the spelling shows its musical role.</p>}<p>Choose a {activeChord.rootName} on string {stringNumber} with room to count {distance} frets upward. The third itself stays hidden.</p><button type="button" className="btn btn-sm" aria-pressed={rootHint} onClick={() => setRootHint((value) => !value)}>{rootHint ? 'Hide root hint' : 'Show one root'}</button></>}
          {guide === 'third' && <p>From the R at {fretLabel(rootFret!)}, count {distance} frets to the right on string {stringNumber}, then select that position. One fret is one semitone.</p>}
          <button type="button" className="btn btn-sm" onClick={() => { resetGuide(); setFeedback(''); }}>Try without guide</button>
        </>}
      </div>}
      <Fretboard tuning={tuning} capo={capo} fretCount={exerciseFrets} markers={markers} interactive interaction="play" showNoteNames={false} showMarkerLabels onToggle={answer} ariaLabel={`Challenge fretboard: find the third of ${activeChord.fullName}`} />
      <p className="small faint">Use arrow keys to move between positions and Enter or Space to choose. Open means at the capo when one is fitted.</p>
      {feedback && <p className={`triad-task-feedback ${correct || feedback.startsWith('Yes') ? 'correct' : ''}`} role="status">{feedback}</p>}
      {correct && step === 1 && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setStep(2); setCorrect(false); setFeedback(''); resetGuide(); }}>Try another key →</button>}
      {correct && step === 2 && <div className="triad-task-finish"><p>Two keys explored. This is saved as an application challenge—not a claim of mastery.</p><button type="button" className="btn btn-sm" onClick={() => { setStep(1); setCorrect(false); setFeedback(''); resetGuide(); }}>Try again</button></div>}
    </> : <p className="muted">No root-to-third path fits these settings. Try more frets or a different tuning or capo.</p>}
  </section>;
}
