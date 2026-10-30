import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getFavorites, getRecents, getNotes, getProgressions, libraryReadIssue, RecentChord, LIBRARY_CHANGE_EVENT } from '@core/storage';
import { useLibrarySync } from '@/hooks/LibrarySync';
import { buildChord, type BuiltChord } from '@core/chords';
import { chordPath } from '@/lib/urls';
import { cloudClient } from '@/lib/cloudLibrary';
import { readEmailVerification, type EmailVerification } from '@/lib/accountAuth';
import EmptyState from '@/components/EmptyState';

interface FavoriteEntry {
  rootName: string;
  typeId: string;
  chord: BuiltChord;
}

function parseKey(key: string): FavoriteEntry | null {
  const parts = key.split('|');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [rootName, typeId] = parts;
  try { return { rootName, typeId, chord: buildChord(rootName, typeId) }; }
  catch { return null; }
}

export default function LibraryPage() {
  const [tick, setTick] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up' | 'email-link' | 'reset'>('sign-in');
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [verification, setVerification] = useState<EmailVerification | 'loading' | 'unavailable'>('loading');
  const [verificationTick, setVerificationTick] = useState(0);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const sync = useLibrarySync();

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const error = authMode === 'reset' ? await sync.sendPasswordReset(email)
        : authMode === 'email-link' ? await sync.sendSignInLink(email)
        : authMode === 'sign-in' ? await sync.signIn(email, password) : await sync.signUp(email, password);
      if (error) setAuthMessage(error);
      else if (authMode === 'reset') setAuthMessage('If this address can receive a reset link, check your email and open it in this same browser. Check spam or try again later.');
      else if (authMode === 'email-link') setAuthMessage('Check your email and open the link in this same browser. You can keep using FretHub while you wait.');
      else setPassword('');
    } catch {
      setAuthMessage('Could not connect. Please check your connection and try again.');
    } finally { setAuthBusy(false); }
  };

  const requestVerification = async () => {
    setVerificationBusy(true); setVerificationMessage('');
    try {
      const error = await sync.sendVerificationLink();
      setVerificationMessage(error || 'Check your email for a sign-in link and open it in this same browser to verify access. Email delivery must be configured for this deployment.');
    } catch { setVerificationMessage('Could not send the link. Please check your connection and try again.'); }
    finally { setVerificationBusy(false); }
  };

  const signOut = async () => {
    try {
      const error = await sync.signOut();
      if (error) setAuthMessage(error);
      else { setAuthMode('sign-in'); setAuthMessage(''); setPassword(''); }
    } catch {
      setAuthMessage('Could not sign out. Check your connection and try again.');
    }
  };

  useEffect(() => {
    let current = true;
    setVerificationMessage('');
    if (!cloudClient || !sync.session?.user.id) { setVerification('loading'); return () => { current = false; }; }
    setVerification('loading');
    void readEmailVerification(cloudClient).then((result) => { if (current) setVerification(result); })
      .catch(() => { if (current) setVerification('unavailable'); });
    return () => { current = false; };
  }, [sync.session?.user.id, sync.session?.user.email, verificationTick]);

  useEffect(() => {
    const refreshVerification = () => setVerificationTick((value) => value + 1);
    window.addEventListener('focus', refreshVerification);
    return () => window.removeEventListener('focus', refreshVerification);
  }, []);

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

  const rawFavorites = getFavorites();
  const favorites = rawFavorites.map(parseKey).filter((x): x is FavoriteEntry => x !== null);
  const rawRecents = getRecents();
  const recents: { recent: RecentChord; entry: FavoriteEntry }[] = rawRecents.flatMap((recent) => {
    const entry = parseKey(`${recent.rootName}|${recent.typeId}`);
    return entry ? [{ recent, entry }] : [];
  });
  const notes = getNotes();
  const progressions = getProgressions();
  const noteKeys = Object.keys(notes);
  const noteEntries = noteKeys.map(parseKey).filter((x): x is FavoriteEntry => x !== null);
  const hiddenChords = rawFavorites.length - favorites.length + rawRecents.length - recents.length + noteKeys.length - noteEntries.length;
  const issue = libraryReadIssue();
  void tick;

  return (
    <div className="page">
      <p className="eyebrow">Your library</p>
      <h1>Your library, your way</h1>
      <p className="lead">
        Save chords and notes without an account. They stay in this browser unless you choose to sync them.
        Clearing site data removes this device’s local copy.
      </p>
      {issue && <p role="alert">{issue}</p>}
      {hiddenChords > 0 && <p role="status">Some saved chord records could not be displayed by this version. They remain on this device and have not been deleted.</p>}

      <section id="account" className="library-account" aria-label="Optional account and sync">
        <div>
          <p className="eyebrow">OPTIONAL ACCOUNT</p>
          <h2>{sync.session ? 'Your library is connected' : 'Take your library with you'}</h2>
          <p>Use an email and password to sync favorites, chord notes, progressions and lesson challenges across devices.
            Browsing, practice and saving on this device never require an account.</p>
          <p className="small faint">This device’s guest items merge into the first account used here. Recently viewed chords and practice quiz totals stay on this device.</p>
        </div>
        <div className="library-account-action">
          {!sync.configured ? (
            <p className="small muted" role="status">Account sync is not configured on this deployment. Set the public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the hosting environment and rebuild; your local library still works without an account.</p>
          ) : !sync.authReady ? (
            <p className="small muted" role="status">Checking your account…</p>
          ) : sync.session ? (
            <>
              <p className="small">Signed in as <strong>{sync.session.user.email}</strong></p>
              <p className="small muted" role="status">{sync.status === 'syncing' ? 'Syncing…' : sync.status === 'synced' ? 'Library synced.' : sync.status === 'error' ? (sync.message || 'Sync unavailable. Your local changes are safe.') : 'Ready to sync.'}</p>
              <div className="library-verification">
                {verification === 'loading' ? <p className="small muted">Checking email verification…</p>
                  : verification === 'unavailable' ? <p className="small muted">Email verification is unavailable on this deployment. You can still use and sync your library.</p>
                  : verification.verified ? <p className="small"><strong>Email access verified</strong></p>
                  : <><p className="small muted">Email not verified. Verification is optional and confirms access to this mailbox at the time of verification.</p>
                    <button type="button" className="btn btn-sm" disabled={verificationBusy || !sync.session.user.email} onClick={() => { void requestVerification(); }}>{verificationBusy ? 'Sending…' : 'Verify email (optional)'}</button></>}
                {verificationMessage && <p className="small muted" role="status">{verificationMessage}</p>}
              </div>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={sync.syncNow}>Sync now</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { void signOut(); }}>Sign out</button>
              </div>
              <p className="small faint">Signing out leaves a copy on this device.</p>
            </>
          ) : (
            <form onSubmit={submitAccount} className="library-auth-form">
              <div className="library-auth-switch" aria-label="Account action">
                <button type="button" className="btn btn-sm" aria-pressed={authMode !== 'sign-up'} onClick={() => { setAuthMode('sign-in'); setAuthMessage(''); }}>Sign in</button>
                <button type="button" className="btn btn-sm" aria-pressed={authMode === 'sign-up'} onClick={() => { setAuthMode('sign-up'); setAuthMessage(''); }}>Create account</button>
              </div>
              <div className="field"><label htmlFor="sync-email">Email address</label><input id="sync-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
              {(authMode === 'sign-in' || authMode === 'sign-up') && <div className="field"><label htmlFor="sync-password">Password</label><input id="sync-password" type="password" autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'} minLength={authMode === 'sign-up' ? 8 : 6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>}
              <button type="submit" className="btn btn-primary" disabled={authBusy}>{authBusy ? 'Connecting…' : authMode === 'reset' ? 'Send reset link' : authMode === 'email-link' ? 'Email me a sign-in link' : authMode === 'sign-in' ? 'Sign in to sync' : 'Create account and sync'}</button>
              {authMode === 'sign-up' && <p className="small faint">No email verification is required to sign up. Use a unique password of at least eight characters; you can verify your email later if you wish.</p>}
              {authMode === 'sign-in' && <><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAuthMode('reset'); setAuthMessage(''); setPassword(''); }}>Forgot password?</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAuthMode('email-link'); setAuthMessage(''); setPassword(''); }}>Use an email link instead</button></>}
              {(authMode === 'email-link' || authMode === 'reset') && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAuthMode('sign-in'); setAuthMessage(''); }}>Use a password instead</button>}
              {authMode === 'email-link' && <p className="small faint">Optional email-link sign-in requires email delivery and opens in this same browser. Password signup and sign-in do not require a verification email.</p>}
              {authMode === 'reset' && <p className="small faint">Password reset requires email delivery. Open the link in the same browser where you request it.</p>}
            </form>
          )}
          {authMessage && <p className="small muted" role="status">{authMessage}</p>}
        </div>
      </section>

      <section>
        <h2 className="section-title">Saved progressions ({progressions.length})</h2>
        {progressions.length === 0 ? (
          <p className="muted">Build and save a sequence in the <Link to="/fretboard?mode=progression">fretboard progression builder</Link>.</p>
        ) : (
          <div className="grid grid-3">
            {progressions.map((progression) => (
              <Link key={progression.id} to={`/fretboard?progression=${encodeURIComponent(progression.id)}`} className="card feature-card">
                <h3 style={{ marginBottom: '0.3rem' }}>{progression.name}</h3>
                <p className="small muted" style={{ marginBottom: 0 }}>{progression.difficulty} · {progression.chords.length} {progression.chords.length === 1 ? 'chord' : 'chords'} · {progression.bpm} BPM</p>
              </Link>
            ))}
          </div>
        )}
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
            {favorites.map(({ rootName, typeId, chord }) => {
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
                {recents.slice(0, 10).map(({ recent: r, entry: { chord } }) => {
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
            {noteEntries.map(({ rootName, typeId, chord }) => {
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
