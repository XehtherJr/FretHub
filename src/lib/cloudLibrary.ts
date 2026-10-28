import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyLibrarySnapshot, canonicalJson, emptySnapshot, getLibrarySnapshot, mergeLibrarySnapshots, normalizeSnapshot, type LibrarySnapshot } from '@core/storage';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Only public project URL/publishable key belong in browser configuration. */
export const cloudClient: SupabaseClient | null = (() => {
  if (!url || !key) return null;
  try { return createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true } }); }
  catch { return null; }
})();

function canonical(snapshot: LibrarySnapshot): string { return canonicalJson(snapshot); }

/**
 * Merge local edits with the cloud row using revision-checked updates. A
 * concurrent writer causes a fresh read and retry, not a silent overwrite.
 * The caller's guard prevents applying one account's response after sign-out.
 */
export async function syncLibrary(client: SupabaseClient, userId: string, isCurrent = () => true): Promise<{ dirty: boolean }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readError } = await client.from('user_libraries')
      .select('data, revision').eq('user_id', userId).maybeSingle();
    if (readError) throw readError;
    if (!isCurrent()) return { dirty: false };
    if (row && (!row.data || typeof row.data !== 'object' || ![1, 2].includes(row.data.version))) {
      throw new Error('This library was saved in an unsupported format. It was not changed.');
    }
    const remote = row ? normalizeSnapshot(row.data) : emptySnapshot();
    // Never replace a v2 cloud row after silently discarding an unfamiliar or
    // damaged progression. A newer app or a repair may still recover it.
    if (row?.data.version === 2) {
      const progressions: unknown = row.data.progressions;
      if (!progressions || typeof progressions !== 'object' || Array.isArray(progressions)
        || Object.keys(progressions).length !== Object.keys(remote.progressions).length) {
        throw new Error('This library contains unsupported progression data. It was not changed.');
      }
    }
    const merged = mergeLibrarySnapshots(remote, getLibrarySnapshot());
    if (!row || row.data.version !== 2 || canonical(merged) !== canonical(remote)) {
      if (!isCurrent()) return { dirty: false };
      if (!row) {
        const { error } = await client.from('user_libraries').insert({ user_id: userId, data: merged, revision: 1 });
        if (error?.code === '23505') continue;
        if (error) throw error;
      } else {
        const { data: updated, error } = await client.from('user_libraries')
          .update({ data: merged, revision: row.revision + 1, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('revision', row.revision).select('revision').maybeSingle();
        if (error) throw error;
        if (!updated) continue;
      }
    }
    if (!isCurrent()) return { dirty: false };
    // Keep edits made while the network request was in flight, and send them
    // on the next pass rather than overwriting them with the older response.
    const latest = mergeLibrarySnapshots(merged, getLibrarySnapshot());
    if (!applyLibrarySnapshot(latest)) throw new Error('Could not save the synced library on this device. Check browser storage and try again.');
    return { dirty: canonical(latest) !== canonical(merged) };
  }
  throw new Error('Your library changed on another device. Please try syncing again.');
}
