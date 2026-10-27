import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, getRecents, getNotes, RecentChord, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { useLibrarySync } from '@/hooks/LibrarySync';
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
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const sync = useLibrarySync();

  const requestLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const error = await sync.signIn(email);
      setAuthMessage(error ?? 'Check your email and open the link in this same browser. You can keep using FretHub while you wait.');
    } catch {
      setAuthMessage('Could not send a link. Please check your connection and try again.');
    } finally { setAuthBusy(false); }
  };

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('frethub:toast', refresh);
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('frethub:toast', refresh);
      window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
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
      <h1>Your library, your way</h1>
      <p className="lead">
        Save chords and notes without an account. They stay in this browser unless you choose to sync them.
        Clearing site data removes this device’s local copy.
      </p>

      <section className="library-account" aria-label="Optional account and sync">
        <div>
          <p className="eyebrow">OPTIONAL · NO PASSWORD</p>
          <h2>{sync.session ? 'Your library is connected' : 'Take your library with you'}</h2>
          <p>Sign in with an email link to sync favorites, chord notes and lesson challenges across devices.
            Browsing, practice and saving on this device never require an account.</p>
          <p className="small faint">This device’s saved items merge into the account. Recently viewed chords and practice quiz totals stay on this device.</p>
        </div>
        <div className="library-account-action">
          {!sync.configured ? (
            <p className="small muted" role="status">Account sync is not configured on this deployment. Your local library works as usual.</p>
          ) : sync.session ? (
            <>
              <p className="small">Signed in as <strong>{sync.session.user.email}</strong></p>
              <p className="small muted" role="status">{sync.status === 'syncing' ? 'Syncing…' : sync.status === 'synced' ? 'Library synced.' : sync.status === 'error' ? (sync.message || 'Sync unavailable. Your local changes are safe.') : 'Ready to sync.'}</p>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={sync.syncNow}>Sync now</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { void sync.signOut().then((error) => { if (error) setAuthMessage(error); }); }}>Sign out</button>
              </div>
              <p className="small faint">Signing out leaves a copy on this device.</p>
            </>
          ) : (
            <form onSubmit={requestLink}>
              <label htmlFor="sync-email">Email address</label>
              <div className="library-email-row"><input id="sync-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><button type="submit" className="btn btn-primary" disabled={authBusy}>{authBusy ? 'Sending…' : 'Email me a sign-in link'}</button></div>
            </form>
          )}
          {authMessage && <p className="small muted" role="status">{authMessage}</p>}
        </div>
      </section>

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
