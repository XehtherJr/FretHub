import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LIBRARY_CHANGE_EVENT } from '@core/storage';
import { cloudClient, syncLibrary } from '@/lib/cloudLibrary';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
interface LibrarySyncValue {
  configured: boolean;
  session: Session | null;
  status: SyncStatus;
  message: string;
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<string | null>;
  syncNow: () => void;
}
const guest: LibrarySyncValue = {
  configured: false, session: null, status: 'idle', message: '',
  signIn: async () => 'Account sync is not configured on this deployment.',
  signOut: async () => null, syncNow: () => {},
};
const LibrarySyncContext = createContext<LibrarySyncValue>(guest);
export const useLibrarySync = () => useContext(LibrarySyncContext);

export function LibrarySyncProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const userId = useRef<string | null>(null);
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
    if (inFlight.current) { pending.current = true; return; }
    inFlight.current = true;
    setStatus('syncing');
    setMessage('');
    try {
      const result = await syncLibrary(client, id, () => active.current && userId.current === id);
      if (active.current && userId.current === id) {
        setStatus('synced');
        if (result.dirty) pending.current = true;
      }
    } catch (error) {
      if (active.current && userId.current === id) {
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
    const client = cloudClient;
    if (!client) return () => { active.current = false; };
    const receive = (next: Session | null) => {
      if (!active.current) return;
      userId.current = next?.user.id ?? null;
      setSession(next);
      setStatus('idle');
      if (next) schedule(0);
    };
    // Supabase emits INITIAL_SESSION as well as subsequent auth changes.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => receive(next));
    const onChange = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source !== 'sync' && userId.current) schedule();
    };
    const onResume = () => { if (userId.current && document.visibilityState !== 'hidden') schedule(0); };
    window.addEventListener(LIBRARY_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      active.current = false;
      userId.current = null;
      subscription.unsubscribe();
      if (timer.current !== null) window.clearTimeout(timer.current);
      window.removeEventListener(LIBRARY_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [schedule]);

  const signIn = useCallback(async (email: string): Promise<string | null> => {
    if (!cloudClient) return 'Account sync is not configured on this deployment.';
    const redirect = new URL(`${import.meta.env.BASE_URL}library`, window.location.origin).toString();
    const { error } = await cloudClient.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect } });
    return error?.message ?? null;
  }, []);
  const signOut = useCallback(async (): Promise<string | null> => {
    if (!cloudClient) return null;
    const { error } = await cloudClient.auth.signOut();
    return error?.message ?? null;
  }, []);

  return <LibrarySyncContext.Provider value={{ configured: !!cloudClient, session, status, message, signIn, signOut, syncNow: () => schedule(0) }}>{children}</LibrarySyncContext.Provider>;
}
