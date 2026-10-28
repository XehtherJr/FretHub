import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLibrarySync } from '@/hooks/LibrarySync';

export default function AccountRecoveryPage() {
  const sync = useLibrarySync();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const callbackError = new URLSearchParams(window.location.search).has('error')
    || new URLSearchParams(window.location.hash.replace(/^#/, '')).has('error');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) { setMessage('Use a password of at least eight characters.'); return; }
    if (password !== confirmation) { setMessage('The passwords do not match.'); return; }
    setBusy(true); setMessage('');
    try {
      const error = await sync.updatePassword(password);
      if (error) setMessage(error);
      else { setPassword(''); setConfirmation(''); setComplete(true); }
    } catch { setMessage('Could not update your password. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return <div className="page account-callback">
    <p className="eyebrow">OPTIONAL ACCOUNT</p><h1>Reset your password</h1>
    {!sync.configured ? <p role="status">Account sync is not configured on this deployment. Your local library still works.</p>
      : !sync.authReady ? <p role="status">Checking your reset link…</p>
      : complete ? <><p role="status">Your password has been updated.</p><Link className="btn btn-primary" to="/library#account">Return to your account</Link></>
      : callbackError || !sync.session || !sync.recoverySession ? <>
        <p role="status">This reset link could not be used. It may have expired, already been used, or been opened in a different browser.</p>
        <Link className="btn" to="/library#account">Request another reset link</Link>
      </> : <>
        <p className="muted">Choose a new password for <strong>{sync.session.user.email}</strong>.</p>
        <form className="account-callback-form" onSubmit={submit}>
          <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
          {message && <p role="alert" className="small">{message}</p>}
        </form>
      </>}
  </div>;
}
