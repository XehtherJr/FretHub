import { useEffect, useMemo, useState } from 'react';
import { buildChord, type BuiltChord } from '@core/chords';
import { intervalSemitones } from '@core/intervals';
import { fretToMidi, pcToNote, transposePc } from '@core/notes';
import { getCompletedLessons, LIBRARY_CHANGE_EVENT, markLessonComplete } from '@core/storage';
import { thirdTask } from '@core/triadRelationships';
import { isAudioSupported, playMidi } from '@core/audio';
import type { Tuning } from '@core/tunings';
import Fretboard from './Fretboard';

/** Stored in the existing synced challenge collection, separate from the lesson check. */
export const TRIAD_TRANSFER_ID = 'triad-transfer-v1';

interface Props { chord: BuiltChord; tuning: Tuning; capo: number; fretCount: number }

export default function TriadTransferChallenge({ chord, tuning, capo, fretCount }: Props) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [correct, setCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saved, setSaved] = useState(() => getCompletedLessons().includes(TRIAD_TRANSFER_ID));
  useEffect(() => {
    const refresh = () => setSaved(getCompletedLessons().includes(TRIAD_TRANSFER_ID));
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  // A fourth above is a different key. The role and interval stay the same.
  const transferRoot = pcToNote(transposePc(chord.rootPc, 5), chord.rootName.includes('b'));
  const transferChord = useMemo(() => buildChord(transferRoot, chord.typeId), [transferRoot, chord.typeId]);
  const firstTask = useMemo(() => thirdTask(chord, tuning, capo, fretCount), [chord, tuning, capo, fretCount]);
  const transferTask = useMemo(() => thirdTask(transferChord, tuning, capo, fretCount, firstTask?.stringIndex), [transferChord, tuning, capo, fretCount, firstTask]);
  const activeChord = step === 1 ? chord : transferChord;
  const task = step === 1 ? firstTask : transferTask;
  const distance = intervalSemitones(activeChord.tones[1].interval);

  const answer = (stringIndex: number, fret: number, pc: number) => {
    if (!task || correct) return;
    const physical = fret === 0 ? capo : fret;
    const string = tuning.strings[stringIndex];
    if (isAudioSupported()) playMidi(fretToMidi(string.pc, string.octave, physical));
    const stringNumber = tuning.strings.length - task.stringIndex;
    if (stringIndex !== task.stringIndex || (task.minimumFret > 0 && fret < task.minimumFret)) {
      setFeedback(`That is string ${tuning.strings.length - stringIndex}, ${fret === 0 ? 'open' : `fret ${fret}`}. Try string ${stringNumber}${task.minimumFret ? ` at fret ${task.minimumFret} or higher` : ''}.`);
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
    <div className="triad-section-heading"><div><p className="eyebrow">04 / TAKE IT WITH YOU</p><h2 id="transfer-heading">Find the third yourself</h2></div><p>A short application challenge: first in this chord, then in another key and position. The note markers disappear so you can test the relationship.</p></div>
    {!started ? <div className="triad-practice-start"><button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>Start the two-key challenge</button><span>{saved ? 'You have completed this application challenge; try it again.' : 'Two short steps · no microphone needed'}</span></div> : task ? <>
      <div className="triad-task-head"><div><span className="triad-task-step">STEP {step} OF 2 · {step === 1 ? 'APPLY' : 'TRANSFER'}</span><h3>Find the third of {activeChord.fullName}</h3><p>Choose <strong>string {tuning.strings.length - task.stringIndex}</strong>{task.minimumFret ? <> at <strong>fret {task.minimumFret} or higher</strong></> : ' at any playable fret'}. You can count {distance} frets up from {activeChord.rootName} on one string.</p></div><button type="button" className="btn btn-sm" onClick={() => { setStarted(false); setStep(1); setCorrect(false); setFeedback(''); }}>Close challenge</button></div>
      <Fretboard tuning={tuning} capo={capo} fretCount={fretCount} interactive interaction="play" showNoteNames={false} onToggle={answer} ariaLabel={`Challenge fretboard: find the third of ${activeChord.fullName}`} />
      <p className="small faint">Use arrow keys to move between positions and Enter or Space to choose. Fret numbers are physical; open means at the capo when one is fitted.</p>
      {feedback && <p className={`triad-task-feedback ${correct ? 'correct' : ''}`} role="status">{feedback}</p>}
      {correct && step === 1 && <button type="button" className="btn btn-primary btn-sm" onClick={() => { setStep(2); setCorrect(false); setFeedback(''); }}>Try another key →</button>}
      {correct && step === 2 && <div className="triad-task-finish"><p>Two keys explored. This is saved as an application challenge—not a claim of mastery.</p><button type="button" className="btn btn-sm" onClick={() => { setStep(1); setCorrect(false); setFeedback(''); }}>Try again</button></div>}
    </> : <p className="muted">No target is available with these settings. Try a different tuning or capo.</p>}
  </section>;
}
