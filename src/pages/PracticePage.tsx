import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Fretboard, { FretMarkerData } from '@/components/Fretboard';
import ChordDiagram from '@/components/ChordDiagram';
import Tuner from '@/components/Tuner';
import Metronome from '@/components/Metronome';
import { makeChordQuestion, type ChordQuestion } from '@core/chordQuiz';
import { getTuning } from '@core/tunings';
import { generateVoicings, fretPc } from '@core/voicing-engine';
import { pcToNote } from '@core/notes';
import { getQuizProgress, recordQuizAnswer } from '@core/storage';
import { chordPath } from '@/lib/urls';

type Tab = 'chord-quiz' | 'note-quiz' | 'metronome' | 'tuner';

// ------------------------------------------------------------- chord quiz
function ChordQuiz({ onAnswered }: { onAnswered: (correct: boolean, streak: number) => void }) {
  const tuning = getTuning('standard');
  const [question, setQuestion] = useState<ChordQuestion>(() => makeChordQuestion());
  const [picked, setPicked] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(0);

  const voicing = useMemo(() => {
    const [first] = generateVoicings(question.chord.pitchClasses, tuning, question.chord.rootPc, {
      requiredBass: question.chord.rootPc, maxResults: 1,
    });
    return first;
  }, [question, tuning]);

  const answer = (choice: string) => {
    if (picked) return;
    setPicked(choice);
    const correct = choice === question.chord.shortName;
    const nextStreak = correct ? streak + 1 : 0;
    setStreak(nextStreak);
    onAnswered(correct, nextStreak);
  };

  const next = () => {
    setQuestion(makeChordQuestion());
    setPicked(null);
    setRound((r) => r + 1);
  };

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Identify this chord</h2>
        <span className="pill">Streak: {streak} · Round {round + 1}</span>
      </div>
      <p className="small muted">Study the diagram, the fret positions and fingering, then choose the chord name.</p>

      <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
        {voicing && <ChordDiagram voicing={voicing} tuning={tuning} showNotes={false} />}
      </div>

      <div className="grid grid-2">
        {question.choices.map((choice) => {
          const isCorrect = choice === question.chord.shortName;
          const isPicked = picked === choice;
          let cls = 'btn';
          if (picked) {
            if (isCorrect) cls += ' btn-primary';
            else if (isPicked) cls += ' btn-danger';
          }
          return (
            <button
              key={choice}
              type="button"
              className={cls}
              onClick={() => answer(choice)}
              disabled={!!picked}
              aria-label={`Answer ${choice}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {picked && (
        <div style={{ marginTop: '1rem' }} className="stack">
          <p className={picked === question.chord.shortName ? '' : 'small'} style={{ marginBottom: 0 }}>
            {picked === question.chord.shortName
              ? 'Correct.'
              : `Not quite — that was ${question.chord.shortName} (${question.chord.tones.map((t) => t.name).join(' · ')}).`}
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>Next chord →</button>
            <Link className="btn btn-sm btn-ghost" to={chordPath(question.chord.rootName, question.chord.typeId)}>
              Open {question.chord.shortName} in the encyclopedia
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- note quiz
interface NoteQuestion {
  stringIndex: number;
  targetPc: number;
}

function NoteQuiz({ onAnswered }: { onAnswered: (correct: boolean, streak: number) => void }) {
  const tuning = getTuning('standard');
  const [question, setQuestion] = useState<NoteQuestion>(() => ({
    stringIndex: Math.floor(Math.random() * 6),
    targetPc: Math.floor(Math.random() * 12),
  }));
  const [result, setResult] = useState<{ ok: boolean; pickedFret: number } | null>(null);
  const [streak, setStreak] = useState(0);

  const targetName = pcToNote(question.targetPc);
  const stringLabel = tuning.strings[question.stringIndex].label;

  const correctMarkers: FretMarkerData[] = useMemo(() => {
    const out: FretMarkerData[] = [];
    for (let fret = 0; fret <= 12; fret++) {
      if (fretPc(tuning, question.stringIndex, fret) === question.targetPc) {
        out.push({ stringIndex: question.stringIndex, fret, variant: 'root', label: targetName });
      }
    }
    return out;
  }, [question, tuning, targetName]);

  const handleToggle = (stringIndex: number, fret: number, pc: number) => {
    if (result) return;
    const ok = stringIndex === question.stringIndex && pc === question.targetPc;
    setResult({ ok, pickedFret: fret });
    const nextStreak = ok ? streak + 1 : 0;
    setStreak(nextStreak);
    onAnswered(ok, nextStreak);
  };

  const next = () => {
    setQuestion({ stringIndex: Math.floor(Math.random() * 6), targetPc: Math.floor(Math.random() * 12) });
    setResult(null);
  };

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Find <span style={{ color: 'var(--brass-bright)' }}>{targetName}</span> on the {stringLabel} string</h2>
        <span className="pill">Streak: {streak}</span>
      </div>
      <p className="small muted">Click the correct position anywhere on that string (there may be more than one octave).</p>

      <Fretboard
        tuning={tuning}
        fretCount={12}
        interactive={!result}
        onToggle={handleToggle}
        markers={result ? correctMarkers : []}
        showNoteNames={false}
        ariaLabel={`Fretboard for note-finding quiz: locate ${targetName}`}
      />

      {result && (
        <div className="row" style={{ marginTop: '1rem' }}>
          {result.ok
            ? <span>Correct — {targetName} sits at fret {result.pickedFret} on the {stringLabel} string.</span>
            : <span>The highlighted dots show where {targetName} occurs on the {stringLabel} string.</span>}
          <button type="button" className="btn btn-primary btn-sm" onClick={next}>Next note →</button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- page
export default function PracticePage() {
  const [tab, setTab] = useState<Tab>('chord-quiz');
  const [progress, setProgress] = useState(() => getQuizProgress());
  const [progressError, setProgressError] = useState(false);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chord-quiz', label: 'Chord ID quiz' },
    { id: 'note-quiz', label: 'Note finder' },
    { id: 'metronome', label: 'Metronome' },
    { id: 'tuner', label: 'Tuner' },
  ];

  const answered = (correct: boolean, streak: number) => {
    void recordQuizAnswer(correct, streak).then((saved) => { if (saved) { setProgress(saved); setProgressError(false); } else setProgressError(true); });
  };

  const accuracy = progress.answered
    ? Math.round((progress.correct / progress.answered) * 100)
    : null;

  return (
    <div className="page page-narrow">
      <p className="eyebrow">Practice</p>
      <h1>Train your fingers and ears</h1>
      <p className="lead">
        Quiz scores and streaks are stored on this device — no account needed.
        {progress.answered > 0 && (
          <> {' '}Lifetime: <strong>{progress.correct}/{progress.answered}</strong> correct
          {accuracy !== null && <> ({accuracy}%)</>}, best streak {progress.bestStreak}.</>
        )}
      </p>
      {progressError && <p role="alert" className="small">This answer could not be saved on this device. Your existing practice totals were not intentionally changed; check browser storage.</p>}

      <div className="row" role="tablist" aria-label="Practice tools" style={{ marginBottom: '1rem' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            type="button"
            className="btn btn-sm"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'chord-quiz' && <ChordQuiz key="chord" onAnswered={answered} />}
      {tab === 'note-quiz' && <NoteQuiz key="note" onAnswered={answered} />}
      {tab === 'metronome' && <Metronome />}
      {tab === 'tuner' && <Tuner />}
    </div>
  );
}
