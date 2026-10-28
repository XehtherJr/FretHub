import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { buildChord, BuiltChord, chordVoicingConstraints } from '@core/chords';
import { getChordType } from '@core/chord-definitions';
import { TUNINGS, getTuning, applyCapo } from '@core/tunings';
import { estimateVoicingDifficulty, searchVoicings } from '@core/voicing-engine';
import { noteToPc, pcToNote } from '@core/notes';
import { addRecent, getNote, saveNote, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { chordPath, chordKey as makeKey, fretboardChordPath, instrumentFromSearch, triadStudyPath } from '@/lib/urls';
import { isTriadQuality } from '@core/triadRelationships';
import ChordDiagram from '@/components/ChordDiagram';
import PlayButton from '@/components/PlayButton';
import EmptyState from '@/components/EmptyState';
import { useFavorites } from '@/hooks/useFavorites';
import { showToast } from '@/components/Toast';

const FRET_WINDOWS = Array.from({ length: 24 }, (_, index) => index + 1);
const MIN_FRETS = [0, ...FRET_WINDOWS];
const VOICINGS_PER_PAGE = 16;

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

  const chord = useMemo<BuiltChord | undefined>(() => {
    try { return buildChord(rootName, typeId); } catch { return undefined; }
  }, [rootName, typeId]);

  const [tuningId, setTuningId] = useState(() => instrumentFromSearch(searchParams).tuning);
  const [capo, setCapo] = useState(() => instrumentFromSearch(searchParams).capo);
  const [minFret, setMinFret] = useState(0);
  const [maxFret, setMaxFret] = useState(14);
  const [maxSpan, setMaxSpan] = useState(4);
  const [maxMuted, setMaxMuted] = useState<number | null>(null);
  const [allowOpen, setAllowOpen] = useState(true);
  const [allowBarre, setAllowBarre] = useState(true);
  const [sortBy, setSortBy] = useState<'position' | 'score'>('position');
  const [visibleVoicings, setVisibleVoicings] = useState(VOICINGS_PER_PAGE);
  const [voicingPage, setVoicingPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
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
  useEffect(() => { setMaxMuted(null); }, [tuningId]);
  useEffect(() => {
    setMaxFret((current) => Math.min(current, 24 - capo));
    setMinFret((current) => current > 24 - capo ? 0 : current);
  }, [capo]);
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

  const search = useMemo(() => {
    if (!chord) return { voicings: [], totalFound: 0, searchTruncated: false, resultLimitReached: false };
    const constraints = chordVoicingConstraints(chord);
    const tones = bassPc !== null && !chord.pitchClasses.includes(bassPc) ? [...chord.pitchClasses, bassPc] : chord.pitchClasses;
    return searchVoicings(tones, tuning, chord.rootPc, {
      ...constraints,
      // The workbench represents at most 24 physical frets; generated
      // diagrams must remain playable within that same neck after a capo.
      minFret,
      maxFret: Math.min(maxFret, 24 - capo),
      maxSpan,
      allowOpen,
      allowBarre,
      maxMuted: maxMuted ?? (constraints.requiredVoicing ? Math.max(2, tuning.strings.length - constraints.requiredVoicing.length) : 2),
      requiredBass: bassPc ?? undefined,
      sortBy,
      // Search already constructs and sorts the found shapes. Rendering is
      // paged, so there is no need to discard results at an arbitrary cap.
      maxResults: Number.MAX_SAFE_INTEGER,
    });
  }, [chord, tuning, capo, minFret, maxFret, maxSpan, maxMuted, allowOpen, allowBarre, bassPc, sortBy]);
  const voicings = search.voicings;
  const totalPages = Math.max(1, Math.ceil(voicings.length / VOICINGS_PER_PAGE));
  const currentPage = Math.min(voicingPage, totalPages);
  const firstVisible = (currentPage - 1) * VOICINGS_PER_PAGE;
  const lastVisible = Math.min(firstVisible + visibleVoicings, voicings.length);
  const lastVisiblePage = Math.max(1, Math.ceil(lastVisible / VOICINGS_PER_PAGE));
  const goToPage = (page: number) => {
    const next = Math.max(1, Math.min(totalPages, page));
    setVoicingPage(next);
    setVisibleVoicings(VOICINGS_PER_PAGE);
    setPageInput(String(next));
  };

  useEffect(() => { setVisibleVoicings(VOICINGS_PER_PAGE); setVoicingPage(1); setPageInput('1'); }, [rootName, typeId, tuningId, capo, minFret, maxFret, maxSpan, maxMuted, allowOpen, allowBarre, bassPc, sortBy]);

  if (!chord) {
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
            {type.requireOneOf ? 'Interval options' : 'Interval formula'}: <code>{chord.formula.join('  ')}</code>
          </p>
        </section>

        <section className="card">
          <h2>Theory</h2>
          <p className="muted">{type.description}</p>
          <div className="row">
            <span className="pill tone">Root: {chord.rootName}</span>
            <span className="pill cool">Bass: {bassPc === null ? 'varies' : selectedChord.bassName}</span>
            <span className="pill">{type.requireOneOf ? `${chord.tones.length - type.requireOneOf.length} core · ${type.requireOneOf.length} alteration options` : `${chord.tones.length} tones`}</span>
            {type.omittable && <span className="pill scale">Omits allowed: {type.omittable.join(', ')}</span>}
          </div>
          {type.requireOneOf && <p className="small muted">At least one of {type.requireOneOf.join(', ')} must sound in an altered voicing. These are alternatives, not a requirement to play every alteration together.</p>}
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
          <span className="small muted" aria-live="polite">Showing {voicings.length ? `${firstVisible + 1}–${lastVisible}` : '0'} of {search.searchTruncated ? 'at least ' : ''}{search.totalFound} found for {tuning.name}</span>
        </div>
        <p className="small muted">
          Calculated from the formula above. Diagrams use its chord tones{nonChordBass ? ' and the selected non-chord bass' : ''}; any omitted optional notes are labeled. Fingering uses an estimated four-finger limit.
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
            <select id="capo" value={capo} onChange={(event) => setCapo(Number(event.target.value))}>
              {Array.from({ length: 8 }, (_, c) => (
                <option key={c} value={c}>{c === 0 ? 'None' : `Fret ${c}`}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="minfret">Lowest fretted position</label>
            <select id="minfret" value={minFret} onChange={(event) => setMinFret(Number(event.target.value))}>
              {MIN_FRETS.map((fret) => <option key={fret} value={fret} disabled={fret > maxFret}>{fret === 0 ? 'Any position' : `From fret ${fret}`}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="maxfret">Fret window</label>
            <select id="maxfret" value={maxFret} onChange={(event) => { const next = Number(event.target.value); setMaxFret(next); if (minFret > next) setMinFret(0); }}>
              {FRET_WINDOWS.map((f) => <option key={f} value={f} disabled={f > 24 - capo}>Up to fret {f}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="span">Max stretch</label>
            <select id="span" value={maxSpan} onChange={(e) => setMaxSpan(Number(e.target.value))}>
              {[3, 4, 5].map((s) => <option key={s} value={s}>{s} frets</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="max-muted">Maximum muted strings</label>
            <select id="max-muted" value={maxMuted ?? ''} onChange={(event) => setMaxMuted(event.target.value === '' ? null : Number(event.target.value))}>
              <option value="">Default ({type.voicingPattern ? Math.max(2, tuning.strings.length - type.voicingPattern.length) : 2})</option>
              {Array.from({ length: tuning.strings.length - 1 }, (_, count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="voicing-sort">Sort voicings</label>
            <select id="voicing-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'position' | 'score')}>
              <option value="position">Lowest fret position first</option>
              <option value="score">Estimated ease first</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="bass">Bass note</label>
            <select
              id="bass"
              value={bassPc ?? ''}
              onChange={(e) => setBassPc(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Any bass</option>
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

        <p className="small muted" style={{ marginTop: '0.8rem' }}>Finger numbers and playability labels are estimates, not guarantees. The model allows up to two barres and no fretting thumb; other shapes or fingerings may work. Stretch is the difference between the highest and lowest fretted numbers. Open strings remain eligible when enabled, even with a higher starting fret. {capo > 0 && `Chart fret numbers are relative to the capo at fret ${capo}.`} The highest fret choice stops at physical fret 24.</p>
        <details className="voicing-method small">
          <summary>How are results and difficulty estimated?</summary>
          <p>Lowest position sorts by the lowest fretted note, ignoring open strings. Estimated ease uses an uncalibrated preference for smaller spans, fewer fingers and barres, fewer interior skipped strings, and familiar low-position open shapes. It is not a measurement of your hand, instrument or technique.</p>
          <p>Completeness and root bass break ties; a different bass does not make a shape physically harder. Grades use similar rough factors. Try other fingerings and pick or damp skipped strings as needed.</p>
        </details>
        {search.searchTruncated && <p className="small" role="status">The search reached its safety limit and is incomplete. Narrow the starting and ending frets, stretch, or muted-string limit to explore more reliably.</p>}
        {search.resultLimitReached && <p className="small muted">The result limit was reached; not all found shapes are displayed.</p>}
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
            icon="–"
            title={search.searchTruncated ? 'No voicings found before the search limit' : 'No voicings found within these constraints'}
            action={search.searchTruncated
              ? <button className="btn" onClick={() => { setMinFret(5); setMaxFret(9); setMaxSpan(4); setMaxMuted(null); }}>Search frets 5–9</button>
              : <button className="btn" onClick={() => { setMinFret(0); setMaxFret(18); setMaxSpan(5); setMaxMuted(null); setAllowOpen(true); setAllowBarre(true); setBassPc(null); }}>Relax the constraints</button>}
          >
            {search.searchTruncated ? 'Narrow the search before assuming there are no other shapes.' : 'Try widening the fret window, allowing open strings or barres, or clearing the bass-note filter.'}
          </EmptyState>
        ) : (
          <div className="voicing-grid">
            {voicings.slice(firstVisible, lastVisible).map((voicing, idx) => {
              const estimate = estimateVoicingDifficulty(voicing);
              const tab = voicing.frets.map((f) => (f === null ? 'x' : String(f))).join(' ');
              const covered = new Set(voicing.pitchClasses);
              const omitted = chord.tones.filter((t) => !covered.has(t.pc) && !type.requireOneOf?.includes(t.interval));
              const alterations = chord.tones.filter((t) => covered.has(t.pc) && type.requireOneOf?.includes(t.interval));
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
                    <span className={`pill ${voicing.playability}`} title={`Estimated from: ${estimate.reasons.join(', ')}`} aria-label={`Estimated ${voicing.playability}: ${estimate.reasons.join(', ')}`}>{voicing.playability}</span>
                    {voicing.barre && <span className="pill cool">{voicing.barres && voicing.barres.length > 1 ? '2 barres' : 'barre'}</span>}
                    {alterations.length > 0 && <span className="pill scale" title={`Altered tones present: ${alterations.map((tone) => tone.name).join(', ')}`}>with {alterations.map((tone) => tone.interval).join(',')}</span>}
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
        {voicings.length > VOICINGS_PER_PAGE && <nav className="voicing-pagination" aria-label="Voicing pages">
          <div className="row">
            <button type="button" className="btn btn-sm" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>Previous page</button>
            <span className="small" aria-live="polite">Page {currentPage}{lastVisiblePage > currentPage ? `–${lastVisiblePage}` : ''} of {totalPages}</span>
            <button type="button" className="btn btn-sm" disabled={lastVisiblePage >= totalPages} onClick={() => goToPage(lastVisiblePage + 1)}>Next page</button>
          </div>
          <form className="row" onSubmit={(event) => { event.preventDefault(); const page = Number(pageInput); if (Number.isInteger(page) && page >= 1 && page <= totalPages) goToPage(page); }}>
            <label htmlFor="voicing-page" className="small">Go to page</label>
            <input id="voicing-page" type="number" min="1" max={totalPages} step="1" required value={pageInput} onChange={(event) => setPageInput(event.target.value)} />
            <button type="submit" className="btn btn-sm">Go</button>
          </form>
          <div className="row">
            {lastVisible < voicings.length && visibleVoicings < VOICINGS_PER_PAGE * 4 && <button type="button" className="btn btn-sm" onClick={() => setVisibleVoicings((count) => count + VOICINGS_PER_PAGE)}>Show more voicings</button>}
            {visibleVoicings > VOICINGS_PER_PAGE && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVisibleVoicings(VOICINGS_PER_PAGE)}>Show fewer voicings</button>}
          </div>
        </nav>}
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
