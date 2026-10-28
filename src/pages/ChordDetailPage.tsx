import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { buildChord, BuiltChord, chordVoicingConstraints } from '@core/chords';
import { getChordType } from '@core/chord-definitions';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { generateVoicings, Voicing } from '@core/voicing-engine';
import { noteToPc, pcToNote } from '@core/notes';
import { addRecent, getNote, saveNote, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { chordPath, chordKey as makeKey, fretboardChordPath, instrumentFromSearch, triadStudyPath } from '@/lib/urls';
import { isTriadQuality } from '@core/triadRelationships';
import ChordDiagram from '@/components/ChordDiagram';
import PlayButton from '@/components/PlayButton';
import EmptyState from '@/components/EmptyState';
import { useFavorites } from '@/hooks/useFavorites';
import { showToast } from '@/components/Toast';

const FRET_WINDOWS = [5, 9, 14, 18];

function parseBass(value: string | null): number | null {
  if (!value) return null;
  try { return noteToPc(value); } catch { return null; }
}

export default function ChordDetailPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const requestedBassName = searchParams.get('bass');
  const rootName = decodeURIComponent(params.root ?? '');
  const typeId = decodeURIComponent(params.type ?? '');

  let chord: BuiltChord | undefined;
  let invalid = false;
  try {
    chord = buildChord(rootName, typeId);
  } catch {
    invalid = true;
  }

  const [tuningId, setTuningId] = useState(() => instrumentFromSearch(searchParams).tuning);
  const [capo, setCapo] = useState(() => instrumentFromSearch(searchParams).capo);
  const [maxFret, setMaxFret] = useState(14);
  const [maxSpan, setMaxSpan] = useState(4);
  const [allowOpen, setAllowOpen] = useState(true);
  const [allowBarre, setAllowBarre] = useState(true);
  const [bassPc, setBassPc] = useState<number | null>(() => parseBass(requestedBassName));
  const [noteText, setNoteText] = useState('');
  const [noteConflict, setNoteConflict] = useState(false);
  const noteDirty = useRef(false);
  const lastSavedNote = useRef('');
  const { has, toggle } = useFavorites();

  useEffect(() => {
    if (!chord) return;
    addRecent({
      key: makeKey(chord.rootName, chord.typeId),
      rootName: chord.rootName,
      typeId: chord.typeId,
      shortName: chord.shortName,
    });
    const saved = getNote(makeKey(chord.rootName, chord.typeId));
    lastSavedNote.current = saved;
    noteDirty.current = false;
    setNoteConflict(false);
    setNoteText(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootName, typeId]);

  useEffect(() => {
    const instrument = instrumentFromSearch(searchParams);
    setBassPc(parseBass(requestedBassName));
    setTuningId(instrument.tuning);
    setCapo(instrument.capo);
  }, [rootName, typeId, requestedBassName, searchParams]);

  const tuning = useMemo(() => applyCapo(getTuning(tuningId), capo), [tuningId, capo]);
  const key = chord ? makeKey(chord.rootName, chord.typeId) : '';
  useEffect(() => {
    if (!key) return;
    const refresh = () => {
      const saved = getNote(key);
      if (noteDirty.current && saved !== lastSavedNote.current) setNoteConflict(true);
      else if (!noteDirty.current) { lastSavedNote.current = saved; setNoteText(saved); }
    };
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [key]);

  const voicings = useMemo<Voicing[]>(() => {
    if (!chord) return [];
    const constraints = chordVoicingConstraints(chord);
    const tones = bassPc !== null && !chord.pitchClasses.includes(bassPc) ? [...chord.pitchClasses, bassPc] : chord.pitchClasses;
    return generateVoicings(tones, tuning, chord.rootPc, {
      ...constraints,
      // The workbench represents at most 24 physical frets; generated
      // diagrams must remain playable within that same neck after a capo.
      maxFret: Math.min(maxFret, 24 - capo),
      maxSpan,
      allowOpen,
      allowBarre,
      maxMuted: constraints.requiredVoicing ? Math.max(2, tuning.strings.length - constraints.requiredVoicing.length) : 2,
      requiredBass: bassPc ?? undefined,
      maxResults: 30,
    });
  }, [chord, tuning, capo, maxFret, maxSpan, allowOpen, allowBarre, bassPc]);

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
  const preferredBassName = (pc: number) => parseBass(requestedBassName) === pc && requestedBassName
    ? requestedBassName : pcToNote(pc, chord!.rootName.includes('b'));
  const selectedChord = bassPc === null ? chord : buildChord(chord.rootName, chord.typeId, preferredBassName(bassPc));
  const nonChordBass = bassPc !== null && !chord.pitchClasses.includes(bassPc);

  const related = ['major', 'minor', 'dominant-7', 'minor-7', 'major-7', 'sus4']
    .filter((id) => id !== chord.typeId)
    .slice(0, 5)
    .map((id) => buildChord(chord.rootName, id));

  return (
    <div className="page chord-detail-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span>/</span>{' '}
        <Link to="/chords">Chords</Link> <span>/</span>{' '}
        <span>{chord.shortName}</span>
      </nav>

      <header className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="eyebrow">{type.name}</p>
          <h1 style={{ marginBottom: '0.25rem' }}>{chord.shortName}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>{chord.fullName}</p>
          {bassPc !== null && <p className="small muted" style={{ marginTop: '0.35rem', marginBottom: 0 }}>Showing {selectedChord.shortName} voicings with {selectedChord.bassName} in the bass{nonChordBass ? ' (a non-chord bass, not an inversion)' : ''}.</p>}
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
            to={fretboardChordPath(chord.rootName, chord.typeId, bassPc === null ? undefined : selectedChord.bassName, { tuning: tuningId, capo })}
            className="btn"
          >
            Open on fretboard
          </Link>
          {isTriadQuality(chord.typeId) && <Link to={triadStudyPath(chord.rootName, chord.typeId, undefined, { tuning: tuningId, capo })} className="btn">Explore its relationships</Link>}
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
            <span className="pill cool">Bass: {bassPc === null ? 'varies' : selectedChord.bassName}</span>
            <span className="pill">{chord.tones.length} tones</span>
            {type.omittable && <span className="pill scale">Omits allowed: {type.omittable.join(', ')}</span>}
          </div>
          {type.requireOneOf && <p className="small muted">At least one of {type.requireOneOf.join(', ')} must sound in an altered voicing.</p>}
          <h3 style={{ marginTop: '1rem' }}>Related {chord.rootName} chords</h3>
          <div className="row">
            {related.map((r) => (
              <Link key={r.typeId} to={chordPath(r.rootName, r.typeId, undefined, { tuning: tuningId, capo })} className="btn btn-sm">
                {r.shortName}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="card voicing-section" style={{ marginTop: '1rem' }}>
        <div className="spread">
          <h2 style={{ margin: 0 }}>Voicings</h2>
          <span className="small muted">{voicings.length} generated for {tuning.name}</span>
        </div>
        <p className="small muted">
          Calculated by the voicing engine from the formula above — every diagram contains chord tones{nonChordBass ? ' and the selected non-chord bass' : ''} and is fingered for four fretting fingers.
          {type.voicingPattern && ' This name requires the specific ascending note order described above.'}
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
              {Array.from({ length: 8 }, (_, c) => (
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
              <option value="">Any bass (root preferred)</option>
              <optgroup label="Chord-tone bass">
                <option value={chord.rootPc}>Root position ({chord.rootName})</option>
                {chord.tones.filter((t) => t.pc !== chord.rootPc).map((t) => (
                  <option key={t.interval} value={t.pc}>
                    {t.name} ({t.interval}) — {buildChord(chord.rootName, chord.typeId, t.pc).shortName}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Non-chord bass">
                {Array.from({ length: 12 }, (_, pc) => pc).filter((pc) => !chord.pitchClasses.includes(pc)).map((pc) => {
                  const name = preferredBassName(pc);
                  return <option key={pc} value={pc}>{name} (non-chord bass) — {buildChord(chord.rootName, chord.typeId, name).shortName}</option>;
                })}
              </optgroup>
            </select>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: '0.8rem' }}>Finger numbers and playability labels are estimates, not guarantees. Other fingerings may work and some valid shapes may be omitted. {capo > 0 && `Chart fret numbers are relative to the capo at fret ${capo}.`} {capo + maxFret > 24 && 'Results stop at physical fret 24.'}</p>
        <div className="row" style={{ marginBottom: '1.2rem', marginTop: '0.8rem' }}>
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
            Try widening the fret window, allowing open strings or barres, or clearing the bass-note filter.
          </EmptyState>
        ) : (
          <div className="voicing-grid">
            {voicings.slice(0, 16).map((voicing, idx) => {
              const tab = voicing.frets.map((f) => (f === null ? 'x' : String(f))).join(' ');
              const covered = new Set(voicing.pitchClasses);
              const omitted = chord.tones.filter((t) => !covered.has(t.pc));
              const voicingName = buildChord(chord.rootName, chord.typeId, voicing.bassPc === null ? undefined : preferredBassName(voicing.bassPc)).shortName;
              return (
                <div className="voicing-item" key={tab + idx}>
                  <ChordDiagram
                    voicing={voicing}
                    tuning={tuning}
                    name={voicingName}
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
          placeholder="Fingerings, song references, or practice reminders…"
          value={noteText}
          onChange={(e) => { noteDirty.current = true; setNoteText(e.target.value); }}
          aria-label="Personal notes for this chord"
        />
        {noteConflict && <p className="small" role="status">The saved note changed on another device. Your unsaved edits are still here; saving will replace that version.</p>}
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              lastSavedNote.current = noteText.trim() ? noteText : '';
              noteDirty.current = false;
              setNoteConflict(false);
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
