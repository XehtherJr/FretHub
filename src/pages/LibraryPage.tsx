import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, getRecents, getNotes, RecentChord } from '@core/storage';
import { buildChord } from '@core/chords';
import { chordPath } from '@/lib/urls';
import EmptyState from '@/components/EmptyState';

interface FavoriteEntry {
  rootName: string;
  typeId: string;
}

function parseKey(key: string): FavoriteEntry | null {
  const [rootName, typeId] = key.split('|');
  if (!rootName || !typeId) return null;
  return { rootName, typeId };
}

export default function LibraryPage() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('frethub:toast', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('frethub:toast', refresh);
    };
  }, []);

  const favorites = getFavorites().map(parseKey).filter((x): x is FavoriteEntry => x !== null);
  const recents: RecentChord[] = getRecents();
  const notes = getNotes();
  const noteEntries = Object.keys(notes).map(parseKey).filter((x): x is FavoriteEntry => x !== null);
  void tick;

  return (
    <div className="page">
      <p className="eyebrow">Your library</p>
      <h1>Saved on this device</h1>
      <p className="lead">
        Favorites, recently viewed chords and personal notes live in your browser’s local storage —
        they work offline and require no account. Clearing site data removes them.
      </p>

      <section>
        <h2 className="section-title">Favorites ({favorites.length})</h2>
        {favorites.length === 0 ? (
          <EmptyState
            icon="★"
            title="No favorites yet"
            action={<Link to="/chords" className="btn btn-primary">Browse chords</Link>}
          >
            Open any chord and press “Save” to pin it here for quick practice.
          </EmptyState>
        ) : (
          <div className="grid grid-3">
            {favorites.map(({ rootName, typeId }) => {
              const chord = buildChord(rootName, typeId);
              return (
                <Link key={`${rootName}-${typeId}`} to={chordPath(rootName, typeId)} className="card feature-card">
                  <h3 style={{ marginBottom: '0.3rem' }}>{chord.shortName}</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    {chord.fullName} · {chord.tones.map((t) => t.name).join(' ')}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Recently viewed</h2>
        {recents.length === 0 ? (
          <p className="muted">Chords you open will appear here.</p>
        ) : (
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Chord</th><th>Family</th><th>Last viewed</th></tr>
              </thead>
              <tbody>
                {recents.slice(0, 10).map((r) => {
                  const chord = buildChord(r.rootName, r.typeId);
                  return (
                    <tr key={r.key}>
                      <td><Link to={chordPath(r.rootName, r.typeId)}><strong>{r.shortName}</strong></Link></td>
                      <td className="muted">{chord.typeName}</td>
                      <td className="faint small">{new Date(r.viewedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Chords with notes ({noteEntries.length})</h2>
        {noteEntries.length === 0 ? (
          <p className="muted">Use the notes box on any chord page to jot down practice reminders.</p>
        ) : (
          <div className="grid grid-2">
            {noteEntries.map(({ rootName, typeId }) => {
              const chord = buildChord(rootName, typeId);
              return (
                <Link key={`${rootName}-${typeId}`} to={chordPath(rootName, typeId)} className="card feature-card">
                  <h3 style={{ marginBottom: '0.3rem' }}>{chord.shortName}</h3>
                  <p className="small muted" style={{ marginBottom: 0 }}>
                    {notes[`${rootName}|${typeId}`].slice(0, 140)}
                    {notes[`${rootName}|${typeId}`].length > 140 ? '…' : ''}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
