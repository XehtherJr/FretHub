import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrarySync } from '@/hooks/LibrarySync';
import { cloudClient } from '@/lib/cloudLibrary';
import { recordEmailVerification } from '@/lib/accountAuth';

type Result = 'checking' | 'verified' | 'failed';
export default function VerifyEmailPage() {
  const sync = useLibrarySync();
  const [result, setResult] = useState<Result>('checking');
  const callbackError = new URLSearchParams(window.location.search).has('error')
    || new URLSearchParams(window.location.hash.replace(/^#/, '')).has('error');

  useEffect(() => {
    if (!sync.authReady) return;
    if (!cloudClient || !sync.session || callbackError) { setResult('failed'); return; }
    let current = true;
    setResult('checking');
    // Run after the auth callback has returned; Supabase warns against awaiting
    // additional API calls inside an onAuthStateChange callback itself.
    void recordEmailVerification(cloudClient).then(() => { if (current) setResult('verified'); })
      .catch(() => { if (current) setResult('failed'); });
    return () => { current = false; };
  }, [sync.authReady, sync.session?.user.id, sync.session?.access_token, callbackError]);

  return <div className="page account-callback">
    <p className="eyebrow">OPTIONAL ACCOUNT</p><h1>Verify your email</h1>
    {!sync.configured ? <p role="status">Account sync is not configured on this deployment. Your local library still works.</p>
      : !sync.authReady || result === 'checking' ? <p role="status">Checking your email link…</p>
      : result === 'verified' ? <><p role="status">Email access verified for <strong>{sync.session?.user.email}</strong>.</p><p className="muted small">This confirms access to the mailbox at the time of verification; it does not prove exclusive account ownership.</p></>
      : <p role="status">This email link could not be confirmed. It may have expired, already been used, or been opened in a different browser. You can request another link from your account.</p>}
    <Link className="btn" to="/library#account">Return to your account</Link>
  </div>;
}
