import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Fretboard, { FretMarkerData } from '@/components/Fretboard';
import ChordDiagram from '@/components/ChordDiagram';
import EmptyState from '@/components/EmptyState';
import { buildChord, BuiltChord } from '@core/chords';
import { CHORD_TYPES } from '@core/chord-definitions';
import { getTuning } from '@core/tunings';
import { generateVoicings, fretPc } from '@core/voicing-engine';
import { ROOT_NOTES, pcToNote, midiToFreq, normalizePc } from '@core/notes';
import { playClick, isAudioSupported, getAudioContext } from '@core/audio';
import { getQuizProgress, recordQuizAnswer } from '@core/storage';
import { chordPath } from '@/lib/urls';

type Tab = 'chord-quiz' | 'note-quiz' | 'metronome' | 'tuner';

const QUIZ_TYPES = [
  'major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4', 'power',
  'dominant-7', 'major-7', 'minor-7', 'half-diminished',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

interface ChordQuestion {
  chord: BuiltChord;
  choices: string[];
}

function makeChordQuestion(): ChordQuestion {
  const typeId = pick(QUIZ_TYPES);
  const root = pick(ROOT_NOTES);
  const chord = buildChord(root, typeId);
  const correct = chord.shortName;

  const distractors = new Set<string>([correct]);
  // Same root, different quality.
  const sameRoot = CHORD_TYPES.filter((t) => QUIZ_TYPES.includes(t.id) && t.id !== typeId);
  while (distractors.size < 4) {
    const t = pick(sameRoot);
    distractors.add(buildChord(root, t.id).shortName);
  }
  // Sometimes swap one distractor for the same quality on a nearby root.
  if (Math.random() < 0.5) {
    const otherRoot = pick(ROOT_NOTES.filter((n) => n !== root));
    const alt = buildChord(otherRoot, typeId).shortName;
    if (!distractors.has(alt)) {
      const arr = [...distractors];
      arr[arr.length - 1] = alt;
      distractors.clear();
      arr.forEach((d) => distractors.add(d));
    }
  }
  const choices = [...distractors].sort(() => Math.random() - 0.5);
  return { chord, choices };
}

// ------------------------------------------------------------- chord quiz
function ChordQuiz({ onAnswered }: { onAnswered: (correct: boolean, streak: number) => void }) {
  const tuning = getTuning('standard');
  const [question, setQuestion] = useState<ChordQuestion>(() => makeChordQuestion());
  const [picked, setPicked] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [round, setRound] = useState(0);

  const voicing = useMemo(() => {
    const [first] = generateVoicings(question.chord.pitchClasses, tuning, question.chord.rootPc, {
      maxResults: 1,
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
              ? '✅ Correct.'
              : `❌ Not quite — that was ${question.chord.shortName} (${question.chord.tones.map((t) => t.name).join(' · ')}).`}
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
            ? <span>✅ Correct — {targetName} sits at fret {result.pickedFret} on the {stringLabel} string.</span>
            : <span>❌ The red dots show where {targetName} occurs on the {stringLabel} string.</span>}
          <button type="button" className="btn btn-primary btn-sm" onClick={next}>Next note →</button>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- metronome
function Metronome() {
  const [bpm, setBpm] = useState(90);
  const [beats, setBeats] = useState(4);
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const timer = useRef<number | null>(null);
  const beatRef = useRef(0);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setRunning(false);
    setCurrentBeat(0);
    beatRef.current = 0;
  };

  const start = () => {
    if (!isAudioSupported()) return;
    getAudioContext();
    setRunning(true);
    playClick(true);
    beatRef.current = 1 % beats;
    setCurrentBeat(beatRef.current);
    timer.current = window.setInterval(() => {
      const beat = beatRef.current;
      playClick(beat === 0);
      beatRef.current = (beat + 1) % beats;
      setCurrentBeat(beatRef.current);
    }, Math.round(60000 / bpm));
  };

  useEffect(() => {
    // Restart with new tempo/time signature while playing.
    if (running) {
      stop();
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, beats]);

  return (
    <div className="card">
      <h2>Metronome</h2>
      <p className="small muted">Synthesized clicks — beat one is accented. Tempo changes apply immediately while running.</p>
      <div className="form-row">
        <div className="field">
          <label htmlFor="bpm">Tempo: {bpm} BPM</label>
          <input
            id="bpm"
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="timesig">Beats per bar</label>
          <select id="timesig" value={beats} onChange={(e) => setBeats(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b}/4</option>)}
          </select>
        </div>
        <div className="field">
          <label>&nbsp;</label>
          <button type="button" className={`btn ${running ? 'btn-danger' : 'btn-primary'}`} onClick={running ? stop : start}>
            {running ? '■ Stop' : '▶ Start'}
          </button>
        </div>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }} aria-hidden="true">
        {Array.from({ length: beats }).map((_, i) => (
          <span
            key={i}
            className="note-chip"
            style={running && currentBeat === i ? {
              background: 'var(--brass)', color: '#241708', transform: 'scale(1.15)',
            } : undefined}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tuner
interface TunerReading {
  freq: number;
  pc: number;
  cents: number;
}

/** Autocorrelation pitch detection (Rabener / common Web Audio technique). */
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.015) return -1; // too quiet

  let r1 = 0;
  let r2 = size - 1;
  while (r1 < size / 2 && Math.abs(buf[r1]) < 0.05) r1++;
  while (r2 > 0 && Math.abs(buf[r2]) < 0.05) r2--;
  const trimmed = buf.slice(r1, r2);
  size = trimmed.length;
  const c = new Array(size).fill(0);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size - i; j++) c[i] += trimmed[j] * trimmed[j + i];
  }
  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < size; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return -1;
  let T0 = maxPos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
}

function Tuner() {
  const [status, setStatus] = useState<'idle' | 'listening' | 'denied' | 'unsupported'>('idle');
  const [reading, setReading] = useState<TunerReading | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioRef.current?.close();
    audioRef.current = null;
    streamRef.current = null;
    setStatus('idle');
    setReading(null);
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audio = new AudioContext();
      audioRef.current = audio;
      const source = audio.createMediaStreamSource(stream);
      const analyser = audio.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      setStatus('listening');

      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        const freq = autoCorrelate(buffer, audio.sampleRate);
        if (freq > 0) {
          const midi = Math.round(69 + 12 * Math.log2(freq / 440));
          const expected = midiToFreq(midi);
          const cents = Math.round(1200 * Math.log2(freq / expected));
          setReading({ freq, pc: normalizePc(midi), cents });
        } else {
          setReading(null);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setStatus('denied');
    }
  };

  useEffect(() => stop, []);

  return (
    <div className="card">
      <h2>Chromatic tuner</h2>
      <p className="small muted">
        Uses your microphone and autocorrelation pitch detection — all processing stays on this
        device. Allow microphone access when prompted, then play a note.
      </p>

      {status === 'unsupported' && (
        <EmptyState icon="🚫" title="Microphone access unavailable">
          This browser does not expose the Web Audio microphone API. Use a dedicated tuner or try
          another browser.
        </EmptyState>
      )}
      {status === 'denied' && (
        <EmptyState icon="🔒" title="Microphone permission denied">
          Enable microphone access for this site in your browser settings, then try again.
        </EmptyState>
      )}

      <div className="row">
        {status !== 'listening' ? (
          <button type="button" className="btn btn-primary" onClick={start} disabled={status === 'unsupported'}>
            🎙 Start tuner
          </button>
        ) : (
          <button type="button" className="btn btn-danger" onClick={stop}>■ Stop tuner</button>
        )}
      </div>

      {status === 'listening' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0 0.5rem' }}>
          <div style={{ fontSize: '3.2rem', fontFamily: 'var(--font-display)', color: 'var(--cream)' }}>
            {reading ? pcToNote(reading.pc) : '—'}
          </div>
          <p className="mono small faint" style={{ marginBottom: '0.8rem' }}>
            {reading ? `${reading.freq.toFixed(1)} Hz · ${reading.cents > 0 ? '+' : ''}${reading.cents} cents` : 'waiting for a clear pitch…'}
          </p>
          <div
            role="meter"
            aria-valuenow={reading?.cents ?? 0}
            aria-valuemin={-50}
            aria-valuemax={50}
            aria-label="Tuning meter in cents"
            style={{
              height: 14,
              borderRadius: 999,
              background: 'var(--bg-panel-2)',
              border: '1px solid var(--line)',
              position: 'relative',
              maxWidth: 420,
              margin: '0 auto',
            }}
          >
            <span style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 2, background: 'var(--text-faint)' }} />
            {reading && (
              <span
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: `calc(50% + ${Math.max(-50, Math.min(50, reading.cents)) * 0.9}px)`,
                  transform: 'translate(-50%, -50%)',
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: Math.abs(reading.cents) <= 5 ? 'var(--scale)' : 'var(--root)',
                }}
              />
            )}
          </div>
          <p className="small faint" style={{ marginTop: '0.6rem' }}>
            Green within ±5 cents is in tune. Reference: A4 = 440 Hz.
          </p>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- page
export default function PracticePage() {
  const [tab, setTab] = useState<Tab>('chord-quiz');
  const [progress, setProgress] = useState(() => getQuizProgress());

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chord-quiz', label: 'Chord ID quiz' },
    { id: 'note-quiz', label: 'Note finder' },
    { id: 'metronome', label: 'Metronome' },
    { id: 'tuner', label: 'Tuner' },
  ];

  const answered = (correct: boolean, streak: number) => {
    setProgress(recordQuizAnswer(correct, streak));
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
