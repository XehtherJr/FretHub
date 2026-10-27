import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHORD_TYPES, CHORD_CATEGORIES, ChordCategory } from '@core/chord-definitions';
import { buildChord, chordSearchNames } from '@core/chords';
import { ROOT_NOTES } from '@core/notes';
import { chordPath } from '@/lib/urls';
import EmptyState from '@/components/EmptyState';

export default function ChordsPage() {
  const [root, setRoot] = useState<string>('C');
  const [category, setCategory] = useState<ChordCategory | 'all'>('all');
  const [text, setText] = useState('');

  const types = useMemo(
    () => CHORD_TYPES.filter((t) => category === 'all' || t.category === category),
    [category],
  );

  const chords = useMemo(() => {
    const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return types
      .map((type) => buildChord(root, type.id))
      .filter((chord) => {
        if (!tokens.length) return true;
        const haystack = [
          chord.shortName.toLowerCase(),
          chord.fullName.toLowerCase(),
          chord.typeName.toLowerCase(),
          ...chordSearchNames(chord),
        ].join(' § ');
        return tokens.every((t) => haystack.includes(t));
      });
  }, [root, types, text]);

  return (
    <div className="page">
      <p className="eyebrow">Chord encyclopedia</p>
      <h1>{root} chords</h1>
      <p className="lead">
        {CHORD_TYPES.length} chord formulas × 12 roots = {12 * CHORD_TYPES.length} fully calculated
        entries. Every chord below is generated from its interval formula — select a root and family
        to explore, then open any entry for voicings, fingering, theory and audio.
      </p>

      <div className="card">
        <div className="field">
          <label id="root-label">Root note</label>
          <div role="group" aria-labelledby="root-label" className="row">
            {ROOT_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                className="btn btn-sm"
                aria-pressed={root === note}
                onClick={() => setRoot(note)}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label id="cat-label">Family</label>
          <div role="group" aria-labelledby="cat-label" className="row">
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              All families
            </button>
            {CHORD_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn btn-sm"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="chord-filter">Filter by name, symbol, notes or formula</label>
          <input
            id="chord-filter"
            type="search"
            placeholder="e.g. maj7, 1 b3 5 b7, or C E G B"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>

      <h2 className="section-title">
        {chords.length} chord{chords.length === 1 ? '' : 's'}
        {category !== 'all' && <> · {CHORD_CATEGORIES.find((c) => c.id === category)?.label}</>}
      </h2>

      {chords.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No chords match that filter"
          action={<button className="btn" onClick={() => setText('')}>Clear the text filter</button>}
        >
          Try a symbol like <code>m7b5</code>, a formula like <code>1 3 5 b7</code>, or note names.
        </EmptyState>
      ) : (
        <div className="grid grid-3">
          {chords.map((chord) => (
            <Link
              key={chord.typeId}
              to={chordPath(chord.rootName, chord.typeId)}
              className="card feature-card"
            >
              <div className="spread">
                <h3 style={{ margin: 0 }}>{chord.shortName}</h3>
                <span className="pill">{chord.typeName}</span>
              </div>
              <p className="small muted" style={{ margin: '0.5rem 0' }}>
                Formula <code>{chord.formula.join(' ')}</code>
              </p>
              <div className="row" aria-label={`Notes in ${chord.shortName}`}>
                {chord.tones.map((tone) => (
                  <span key={tone.interval} className={`note-chip ${tone.interval === '1' ? 'root' : ''}`}>
                    {tone.name}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
