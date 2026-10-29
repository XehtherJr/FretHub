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
 * concurrent row writer causes a fresh read and retry. Same-item edits still
 * use device timestamps, so one version can win over another. The caller's
 * guard prevents applying one account's response after sign-out.
 */
export async function syncLibrary(client: SupabaseClient, userId: string, isCurrent = () => true): Promise<{ dirty: boolean }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readError } = await client.from('user_libraries')
      .select('data, revision').eq('user_id', userId).maybeSingle();
    if (readError) throw readError;
    if (!isCurrent()) return { dirty: false };
    if (row && (!row.data || typeof row.data !== 'object' || ![1, 2, 3].includes(row.data.version))) {
      throw new Error('This library was saved in an unsupported format. It was not changed.');
    }
    const remote = row ? normalizeSnapshot(row.data) : emptySnapshot();
    // Normalization is useful for displaying old local data, but must never
    // silently drop unrecognized cloud data before writing a merged snapshot.
    // Compare whole records, not just counts: entry metadata can be lost too.
    if (row) {
      const fields = ['version', 'favorites', 'notes', 'lessons', 'progressions'];
      if (Object.keys(row.data).some((field) => !fields.includes(field))) {
        throw new Error('This library contains unsupported library data. It was not changed.');
      }
      for (const part of ['favorites', 'notes', 'lessons', 'progressions'] as const) {
        const records: unknown = row.data[part];
        // v1 did not have progressions; missing older collections contain no data.
        if (records === undefined && (part !== 'progressions' || row.data.version === 1)) continue;
        if (!records || typeof records !== 'object' || Array.isArray(records) || canonicalJson(records) !== canonicalJson(remote[part])) {
          const label = part === 'progressions' ? 'progression' : part;
          throw new Error(`This library contains unsupported ${label} data. It was not changed.`);
        }
      }
    }
    const merged = mergeLibrarySnapshots(remote, getLibrarySnapshot());
    if (!row || row.data.version !== 3 || canonical(merged) !== canonical(remote)) {
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
