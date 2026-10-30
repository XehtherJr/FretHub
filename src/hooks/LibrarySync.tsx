import { LIBRARY_FENCE_KEY } from '@core/libraryLock';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getLibraryOwner, getTabLibraryOwner, LIBRARY_CHANGE_EVENT, LIBRARY_JOURNAL_KEY, recoverLibrary, setLibraryAuthenticationPending, switchLibraryOwner } from '@core/storage';
import { cloudClient, syncLibrary } from '@/lib/cloudLibrary';
import { hasAuthMethod, accountCallbackUrl } from '@/lib/accountAuth';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface LibrarySyncValue {
  configured: boolean;
  authReady: boolean;
  session: Session | null;
  recoverySession: boolean;
  status: SyncStatus;
  message: string;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  sendSignInLink: (email: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  sendVerificationLink: () => Promise<string | null>;
  signOut: () => Promise<string | null>;
  syncNow: () => void;
}
const guest: LibrarySyncValue = {
  configured: false, authReady: true, session: null, recoverySession: false, status: 'idle', message: '',
  signIn: async () => 'Account sync is not configured on this deployment.',
  signUp: async () => 'Account sync is not configured on this deployment.',
  sendSignInLink: async () => 'Account sync is not configured on this deployment.',
  sendPasswordReset: async () => 'Account sync is not configured on this deployment.',
  updatePassword: async () => 'Account sync is not configured on this deployment.',
  sendVerificationLink: async () => 'Account sync is not configured on this deployment.',
  signOut: async () => null, syncNow: () => {},
};
const LibrarySyncContext = createContext<LibrarySyncValue>(guest);
export const useLibrarySync = () => useContext(LibrarySyncContext);

export function LibrarySyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloudClient);
  const [recoveryUser, setRecoveryUser] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  // Bind this tab before children can read or edit a different account's data.
  getTabLibraryOwner();
  const userId = useRef<string | null>(null);
  const authGeneration = useRef(0);
  const active = useRef(true);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const timer = useRef<number | null>(null);
  const runRef = useRef<() => void>(() => {});

  const schedule = useCallback((delay = 900) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; runRef.current(); }, delay);
  }, []);

  const run = useCallback(async () => {
    const client = cloudClient;
    const id = userId.current;
    if (!client || !id || !active.current) return;
    if (getLibraryOwner() !== id) {
      setStatus('error');
      setMessage('The local library changed in another tab. Refresh or sign in again before syncing.');
      return;
    }
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    setStatus('syncing');
    setMessage('');
    try {
      const result = await syncLibrary(client, id, () => active.current && userId.current === id && getLibraryOwner() === id);
      if (active.current && userId.current === id && getLibraryOwner() === id) {
        setStatus('synced');
        if (result.dirty) pending.current = true;
      }
    } catch (error) {
      if (active.current && userId.current === id && getLibraryOwner() === id) {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Could not sync. Your changes are still on this device.');
      }
    } finally {
      inFlight.current = false;
      if (pending.current && active.current && userId.current) { pending.current = false; schedule(300); }
    }
  }, [schedule]);
  runRef.current = () => { void run(); };

  useEffect(() => {
    active.current = true;
    void recoverLibrary().then((ok) => {
      if (!ok && active.current) { setStatus('error'); setMessage('Could not recover local storage safely. Preserve your local data and check browser storage before trying again.'); }
    });
    const client = cloudClient;
    if (!client) return () => { active.current = false; authGeneration.current++; };
    const receive = (event: string, next: Session | null) => {
      if (!active.current) return;
      const generation = ++authGeneration.current;
      const nextId = next?.user.id ?? null;
      // Invalidate in-flight sync immediately; ownership changes under the lock.
      if (nextId !== userId.current) setRecoveryUser(null);
      userId.current = null;
      if (event === 'PASSWORD_RECOVERY') setRecoveryUser(nextId);
      if (event === 'SIGNED_OUT') setRecoveryUser(null);
      setSession(next);
      setAuthReady(!nextId);
      setMessage('');
      if (!nextId) { setLibraryAuthenticationPending(false); setStatus('idle'); return; }
      setLibraryAuthenticationPending(true);
      void switchLibraryOwner(nextId, () => active.current && authGeneration.current === generation).then((ok) => {
        if (!active.current || authGeneration.current !== generation) return;
        setAuthReady(true);
        if (!ok) {
          setStatus('error');
          setMessage('Could not safely switch libraries on this device. Your data was not intentionally removed. Check browser storage or refresh all tabs and try again.');
          return;
        }
        setLibraryAuthenticationPending(false);
        userId.current = nextId;
        setStatus('idle');
        schedule(0);
      });
    };
    // Supabase emits INITIAL_SESSION as well as subsequent auth changes.
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => receive(event, next));
    const onChange = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source !== 'sync' && userId.current) schedule();
    };
    const onResume = () => { if (userId.current && document.visibilityState !== 'hidden') schedule(0); };
    // Fences and journals change even for no-op syncs; treating those internal
    // markers as edits would make tabs continuously trigger each other's sync.
    const onStorage = (event: StorageEvent) => { if (event.key !== LIBRARY_FENCE_KEY && event.key !== LIBRARY_JOURNAL_KEY) onResume(); };
    window.addEventListener(LIBRARY_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      active.current = false;
      authGeneration.current++;
      userId.current = null;
      subscription.unsubscribe();
      if (timer.current !== null) window.clearTimeout(timer.current);
      window.removeEventListener(LIBRARY_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [schedule]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!cloudClient) return 'Account sync is not configured on this deployment.';
    const { error } = await cloudClient.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  }, []);
  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!cloudClient) return 'Account sync is not configured on this deployment.';
    const { data, error } = await cloudClient.auth.signUp({ email: email.trim(), password });
    if (error) return error.message;
    return data.session ? null : 'The account was created but could not sign in immediately. Check the project’s email-confirmation setting.';
  }, []);
  // Preserve the earlier optional email-link sign-in for existing accounts.
  const sendSignInLink = useCallback(async (email: string): Promise<string | null> => {
    if (!cloudClient) return 'Account sync is not configured on this deployment.';
    const { error } = await cloudClient.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: accountCallbackUrl('library') } });
    return error?.message ?? null;
  }, []);
  const sendPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    if (!cloudClient) return 'Account sync is not configured on this deployment.';
    const { error } = await cloudClient.auth.resetPasswordForEmail(email.trim(), { redirectTo: accountCallbackUrl('account/reset') });
    // Keep the same response for unknown addresses and rejected/rate-limited requests.
    // A genuine transport or server failure can still be reported without enumeration.
    return error && (!error.status || error.status >= 500) ? 'Could not connect. Please try again later.' : null;
  }, []);
  const recoverySession = !!session && (recoveryUser === session.user.id || hasAuthMethod(session.access_token, 'recovery'));
  const updatePassword = useCallback(async (password: string): Promise<string | null> => {
    if (!cloudClient || !session || !recoverySession) return 'Open a password reset link in the browser where you requested it.';
    const { error } = await cloudClient.auth.updateUser({ password });
    return error?.message ?? null;
  }, [session, recoverySession]);
  const sendVerificationLink = useCallback(async (): Promise<string | null> => {
    if (!cloudClient || !session?.user.email) return 'Sign in with an email address first.';
    const { error } = await cloudClient.auth.signInWithOtp({
      email: session.user.email, options: { shouldCreateUser: false, emailRedirectTo: accountCallbackUrl('account/verify') },
    });
    return error?.message ?? null;
  }, [session]);
  const signOut = useCallback(async (): Promise<string | null> => {
    if (!cloudClient) return null;
    const { error } = await cloudClient.auth.signOut();
    return error?.message ?? null;
  }, []);

  return <LibrarySyncContext.Provider value={{ configured: !!cloudClient, authReady, session, recoverySession, status, message, signIn, signUp, sendSignInLink, sendPasswordReset, updatePassword, sendVerificationLink, signOut, syncNow: () => schedule(0) }}>{children}</LibrarySyncContext.Provider>;
}
