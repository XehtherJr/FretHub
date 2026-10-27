import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHORD_TYPES, CHORD_CATEGORIES, ChordCategory } from '@core/chord-definitions';
import { buildChord, chordSearchNames } from '@core/chords';
import { ROOT_NOTES } from '@core/notes';
import { chordPath } from '@/lib/urls';
import EmptyState from '@/components/EmptyState';
import Icon from '@/components/Icon';

export default function ChordsPage() {
  const [root, setRoot] = useState<string>('C');
  const [category, setCategory] = useState<ChordCategory | 'all'>('all');
  const [text, setText] = useState('');
  const types = useMemo(() => CHORD_TYPES.filter((type) => category === 'all' || type.category === category), [category]);
  const chords = useMemo(() => {
    const tokens = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return types.map((type) => buildChord(root, type.id)).filter((chord) => {
      if (!tokens.length) return true;
      const haystack = [chord.shortName.toLowerCase(), chord.fullName.toLowerCase(), chord.typeName.toLowerCase(), ...chordSearchNames(chord)].join(' § ');
      return tokens.every((token) => haystack.includes(token));
    });
  }, [root, types, text]);

  return (
    <div className="page chords-page">
      <p className="eyebrow">The chord encyclopedia</p>
      <h1>{root} chords</h1>
      <p className="lead">From simple triads to altered dominants. Choose a root and find a sound worth exploring.</p>
      <div className="catalogue-shortcuts">
        <span>Looking for a particular sound?</span>
        <button type="button" className="text-link" onClick={() => { setCategory('all'); setText('augmented'); }}>
          Explore augmented chords <Icon name="arrow" />
        </button>
      </div>

      <div className="chord-browser-controls">
        <div className="field chord-root-field">
          <label id="root-label">Root note</label>
          <div role="group" aria-labelledby="root-label" className="row root-picker">
            {ROOT_NOTES.map((note) => <button key={note} type="button" className="btn btn-sm" aria-pressed={root === note} onClick={() => setRoot(note)}>{note}</button>)}
          </div>
        </div>
        <div className="catalogue-filters">
          <div className="field">
            <label htmlFor="chord-family">Chord family</label>
            <select id="chord-family" value={category} onChange={(event) => setCategory(event.target.value as ChordCategory | 'all')}>
              <option value="all">All families</option>
              {CHORD_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          <div className="field catalogue-search">
            <label htmlFor="chord-filter">Filter by name, notes or formula</label>
            <input id="chord-filter" type="search" placeholder="Try augmented, maj7, or C E G" value={text} onChange={(event) => setText(event.target.value)} />
          </div>
        </div>
      </div>

      <div className="catalogue-heading">
        <h2>{chords.length} chord{chords.length === 1 ? '' : 's'}{category !== 'all' && <> · {CHORD_CATEGORIES.find((item) => item.id === category)?.label}</>}</h2>
        <span>SELECT A CHORD TO EXPLORE VOICINGS</span>
      </div>
      {chords.length === 0 ? (
        <EmptyState icon="⌕" title="No chords match that filter" action={<button className="btn" onClick={() => setText('')}>Clear the text filter</button>}>
          Try a symbol like <code>m7b5</code>, a formula like <code>1 3 5 b7</code>, or note names.
        </EmptyState>
      ) : (
        <div className="chord-catalogue">
          {chords.map((chord) => (
            <Link key={chord.typeId} to={chordPath(chord.rootName, chord.typeId)} className="catalogue-item">
              <div className="catalogue-item-title"><h3>{chord.shortName}</h3><span>{chord.typeName}</span><Icon name="arrow" /></div>
              <p>FORMULA <span>{chord.formula.join('  ')}</span></p>
              <div className="row catalogue-tones" aria-label={`Notes in ${chord.shortName}`}>
                {chord.tones.map((tone) => <span key={tone.interval} className={`note-chip ${tone.interval === '1' ? 'root' : ''}`}>{tone.name}</span>)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
