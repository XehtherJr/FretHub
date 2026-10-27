import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildChord, BuiltChord } from '@core/chords';
import { getChordType } from '@core/chord-definitions';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { generateVoicings, Voicing } from '@core/voicing-engine';
import { intervalSemitones } from '@core/intervals';
import { addRecent, getNote, saveNote } from '@core/storage';
import { chordPath, chordKey as makeKey } from '@/lib/urls';
import ChordDiagram from '@/components/ChordDiagram';
import PlayButton from '@/components/PlayButton';
import EmptyState from '@/components/EmptyState';
import { useFavorites } from '@/hooks/useFavorites';
import { showToast } from '@/components/Toast';

const FRET_WINDOWS = [5, 9, 14, 18];

export default function ChordDetailPage() {
  const params = useParams();
  const rootName = decodeURIComponent(params.root ?? '');
  const typeId = decodeURIComponent(params.type ?? '');

  let chord: BuiltChord | undefined;
  let invalid = false;
  try {
    chord = buildChord(rootName, typeId);
  } catch {
    invalid = true;
  }

  const [tuningId, setTuningId] = useState('standard');
  const [capo, setCapo] = useState(0);
  const [maxFret, setMaxFret] = useState(14);
  const [maxSpan, setMaxSpan] = useState(4);
  const [allowOpen, setAllowOpen] = useState(true);
  const [allowBarre, setAllowBarre] = useState(true);
  const [bassPc, setBassPc] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const { has, toggle } = useFavorites();

  useEffect(() => {
    if (!chord) return;
    addRecent({
      key: makeKey(chord.rootName, chord.typeId),
      rootName: chord.rootName,
      typeId: chord.typeId,
      shortName: chord.shortName,
    });
    setNoteText(getNote(makeKey(chord.rootName, chord.typeId)));
    setBassPc(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootName, typeId]);

  const tuning = useMemo(() => applyCapo(getTuning(tuningId), capo), [tuningId, capo]);
  const key = chord ? makeKey(chord.rootName, chord.typeId) : '';

  const voicings = useMemo<Voicing[]>(() => {
    if (!chord) return [];
    const type = getChordType(chord.typeId);
    const omissions = (type.omittable ?? []).map((sym) =>
      (chord.rootPc + intervalSemitones(sym)) % 12,
    );
    return generateVoicings(chord.pitchClasses, tuning, chord.rootPc, {
      maxFret,
      maxSpan,
      allowOpen,
      allowBarre,
      allowedOmissions: omissions,
      requiredBass: bassPc ?? undefined,
      maxResults: 30,
    });
  }, [chord, tuning, maxFret, maxSpan, allowOpen, allowBarre, bassPc]);

  if (invalid || !chord) {
    return (
      <div className="page page-narrow">
        <EmptyState
          icon="🎼"
          title="Unknown chord"
          action={<Link to="/chords" className="btn btn-primary">Back to the encyclopedia</Link>}
        >
          We could not build “{rootName} {typeId}”. Chords are defined by root plus a formula type
          such as <code>major</code>, <code>minor-7</code> or <code>dominant-alt</code>.
        </EmptyState>
      </div>
    );
  }

  const type = getChordType(chord.typeId);
  const favorite = has(key);

  const related = ['major', 'minor', 'dominant-7', 'minor-7', 'major-7', 'sus4']
    .filter((id) => id !== chord.typeId)
    .slice(0, 5)
    .map((id) => buildChord(chord.rootPc, id));

  return (
    <div className="page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span>/</span>{' '}
        <Link to="/chords">Chords</Link> <span>/</span>{' '}
        <span>{chord.shortName}</span>
      </nav>

      <header className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow">{type.name}</p>
          <h1 style={{ marginBottom: '0.25rem' }}>{chord.shortName}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {chord.fullName}
            {chord.isInversion && <> · inversion with {chord.bassName} in the bass</>}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className={`btn ${favorite ? '' : 'btn-ghost'}`}
            aria-pressed={favorite}
            onClick={() => {
              const nowFav = toggle(key);
              showToast(nowFav ? `Saved ${chord.shortName} to your library` : `Removed ${chord.shortName} from favorites`);
            }}
          >
            {favorite ? '★ Saved' : '☆ Save'}
          </button>
          <Link
            to={`/fretboard?chord=${encodeURIComponent(`${chord.rootName}|${chord.typeId}`)}`}
            className="btn"
          >
            Open on fretboard
          </Link>
        </div>
      </header>

      <div className="grid grid-2" style={{ marginTop: '1.2rem' }}>
        <section className="card">
          <h2>Notes & intervals</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Note</th><th>Interval</th><th>Name</th></tr>
              </thead>
              <tbody>
                {chord.tones.map((tone) => (
                  <tr key={tone.interval}>
                    <td><strong className={tone.interval === '1' ? '' : ''}>{tone.name}</strong></td>
                    <td><code>{tone.interval}</code></td>
                    <td className="muted">{tone.intervalName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginTop: '0.8rem', marginBottom: 0 }}>
            Interval formula: <code>{chord.formula.join('  ')}</code>
          </p>
        </section>

        <section className="card">
          <h2>Theory</h2>
          <p className="muted">{type.description}</p>
          <div className="row">
            <span className="pill tone">Root: {chord.rootName}</span>
            <span className="pill cool">Bass: {chord.bassName}</span>
            <span className="pill">{chord.tones.length} tones</span>
            {type.omittable && <span className="pill scale">Omits allowed: {type.omittable.join(', ')}</span>}
          </div>
          <h3 style={{ marginTop: '1rem' }}>Related {chord.rootName} chords</h3>
          <div className="row">
            {related.map((r) => (
              <Link key={r.typeId} to={chordPath(r.rootName, r.typeId)} className="btn btn-sm">
                {r.shortName}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="spread">
          <h2 style={{ margin: 0 }}>Voicings</h2>
          <span className="small muted">{voicings.length} generated for {tuning.name}</span>
        </div>
        <p className="small muted">
          Calculated by the voicing engine from the formula above — every diagram contains only
          chord tones and is fingered for four fretting fingers.
        </p>

        <div className="form-row" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label htmlFor="tuning">Tuning</label>
            <select id="tuning" value={tuningId} onChange={(e) => setTuningId(e.target.value)}>
              {TUNINGS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="capo">Capo</label>
            <select id="capo" value={capo} onChange={(e) => setCapo(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                <option key={c} value={c}>{c === 0 ? 'None' : `Fret ${c}`}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="maxfret">Fret window</label>
            <select id="maxfret" value={maxFret} onChange={(e) => setMaxFret(Number(e.target.value))}>
              {FRET_WINDOWS.map((f) => <option key={f} value={f}>Up to fret {f}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="span">Max stretch</label>
            <select id="span" value={maxSpan} onChange={(e) => setMaxSpan(Number(e.target.value))}>
              {[3, 4, 5].map((s) => <option key={s} value={s}>{s} frets</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bass">Bass note</label>
            <select
              id="bass"
              value={bassPc ?? ''}
              onChange={(e) => setBassPc(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Root position ({chord.rootName})</option>
              {chord.tones.filter((t) => t.pc !== chord.rootPc).map((t) => (
                <option key={t.interval} value={t.pc}>
                  {t.name} ({t.interval}) — {chord.shortName}/{t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginBottom: '1.2rem' }}>
          <button type="button" className="btn btn-sm" aria-pressed={allowOpen} onClick={() => setAllowOpen((v) => !v)}>
            Open strings {allowOpen ? 'on' : 'off'}
          </button>
          <button type="button" className="btn btn-sm" aria-pressed={allowBarre} onClick={() => setAllowBarre((v) => !v)}>
            Barre chords {allowBarre ? 'on' : 'off'}
          </button>
        </div>

        {voicings.length === 0 ? (
          <EmptyState
            icon="🤔"
            title="No playable voicings found with these constraints"
            action={<button className="btn" onClick={() => { setMaxFret(18); setMaxSpan(5); setAllowOpen(true); setAllowBarre(true); setBassPc(null); }}>
              Relax the constraints
            </button>}
          >
            Try widening the fret window, allowing open strings or barres, or clearing the bass-note inversion.
          </EmptyState>
        ) : (
          <div className="grid grid-4">
            {voicings.slice(0, 16).map((voicing, idx) => {
              const tab = voicing.frets.map((f) => (f === null ? 'x' : String(f))).join('');
              const covered = new Set(voicing.pitchClasses);
              const omitted = chord.tones.filter((t) => !covered.has(t.pc));
              return (
                <div className="card" key={tab + idx} style={{ textAlign: 'center', padding: '0.9rem' }}>
                  <ChordDiagram
                    voicing={voicing}
                    tuning={tuning}
                    name={chord.shortName}
                    rootPc={chord.rootPc}
                    showNotes={false}
                    compact
                  />
                  <p className="mono small" style={{ margin: '0.3rem 0' }}>{tab}</p>
                  <div className="row" style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <span className={`pill ${voicing.playability}`}>{voicing.playability}</span>
                    {voicing.barre && <span className="pill cool">barre</span>}
                    {omitted.length > 0 && (
                      <span className="pill scale" title={`Omits ${omitted.map((o) => o.name).join(', ')}`}>
                        no {omitted.map((o) => o.interval).join(',')}
                      </span>
                    )}
                  </div>
                  <PlayButton midi={voicing.midi} small label="Strum" />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Your notes on {chord.shortName}</h2>
        <textarea
          rows={3}
          placeholder="Fingerings that work for you, song references, practice reminders… (stored on this device)"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          aria-label="Personal notes for this chord"
        />
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              saveNote(key, noteText);
              showToast('Note saved');
            }}
          >
            Save note
          </button>
          <Link to="/scales" className="btn btn-sm btn-ghost">Practice matching scales →</Link>
        </div>
      </section>
    </div>
  );
}
