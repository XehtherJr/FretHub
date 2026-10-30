/**
 * Local-first library storage. All features work without an account. Optional
 * sync exchanges a versioned snapshot with per-item timestamps and tombstones
 * so a removal on one device is not resurrected on another.
 */
import { validProgression, type SavedProgression } from './userProgressions';
import { withLibraryLock } from './libraryLock';
import { buildChord } from './chords';

const PREFIX = 'frethub:';
export const LIBRARY_CHANGE_EVENT = 'frethub:library-change';

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export const LIBRARY_JOURNAL_KEY = `${PREFIX}library-transaction`;
const JOURNAL_KEY = LIBRARY_JOURNAL_KEY;
const JOURNALED_KEYS = new Set(['sync-meta', 'favorites', 'notes', 'lessons-complete', 'progressions', 'library-owner', 'recents', 'quiz-progress'].map((key) => PREFIX + key));
const ACCOUNT_BACKUP_PREFIX = PREFIX + 'account-library:';

/** Recover the previous values after an interrupted multi-key write. Only call under the lock. */
function recoverPendingWrite(): boolean {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw === null) return true;
    const journal: unknown = JSON.parse(raw);
    if (!journal || typeof journal !== 'object' || Array.isArray(journal)) return false;
    const record = journal as Record<string, unknown>;
    if (record.version !== 1 || !Array.isArray(record.previous) || Object.keys(record).some((key) => key !== 'version' && key !== 'previous')) return false;
    const previous: unknown[] = record.previous;
    // Only roll back the keys this client can journal. Unknown fields, keys,
    // and duplicate entries may belong to another format and must be retained.
    if (!previous.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string'
      && (JOURNALED_KEYS.has(entry[0]) || (entry[0].startsWith(ACCOUNT_BACKUP_PREFIX) && entry[0].length > ACCOUNT_BACKUP_PREFIX.length))
      && (entry[1] === null || typeof entry[1] === 'string'))) return false;
    if (new Set(previous.map((entry) => (entry as [string, string | null])[0])).size !== previous.length) return false;
    for (const [key, old] of [...previous].reverse() as [string, string | null][]) {
      if (localStorage.getItem(key) === old) continue;
      if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old);
    }
    localStorage.removeItem(JOURNAL_KEY);
    return true;
  } catch { return false; }
}

/** A write-ahead rollback journal preserves the original values even if rollback fails. */
function writeMany(entries: [string, unknown][]): boolean {
  if (typeof localStorage === 'undefined') return false;
  let journalWritten = false;
  try {
    const previous = entries.map(([key]) => [PREFIX + key, localStorage.getItem(PREFIX + key)] as [string, string | null]);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify({ version: 1, previous }));
    journalWritten = true;
    for (const [key, value] of entries) localStorage.setItem(PREFIX + key, JSON.stringify(value));
    localStorage.removeItem(JOURNAL_KEY);
    return true;
  } catch {
    if (journalWritten) recoverPendingWrite(); // If this fails, leave the journal intact and fail closed.
    return false;
  }
}

let tabOwner: string | undefined;
let ownerTransitions = 0;
let authenticationPending = false;
/** Reset between isolated tests; in the browser each tab has its own module instance. */
export function resetLibraryTabForTests(): void { tabOwner = undefined; ownerTransitions = 0; authenticationPending = false; }
function boundOwner(): string { return tabOwner ??= getLibraryOwner(); }
function hasPendingWrite(): boolean {
  try { return typeof localStorage === 'undefined' || localStorage.getItem(JOURNAL_KEY) !== null; } catch { return true; }
}
function canReadLibrary(): boolean { return !authenticationPending && ownerTransitions === 0 && !hasPendingWrite() && boundOwner() === getLibraryOwner(); }
/** The owner a draft may safely target, or null while this tab is blocked. */
export function getTabLibraryOwner(): string | null { return canReadLibrary() ? boundOwner() : null; }
/** Do not replace an already-rendered view with a temporary half-written one. */
export function isLibraryWriteInProgress(): boolean { return tabOwner !== undefined && !authenticationPending && ownerTransitions === 0 && hasPendingWrite(); }

/** While an auth change is pending or failed, never expose the previous owner's data. */
export function setLibraryAuthenticationPending(pending: boolean): void {
  authenticationPending = pending;
  notify('sync');
}
const CHANGED_LIBRARY = 'The local library changed in another tab. Refresh or sign in again before saving or syncing.';
const UNSUPPORTED_LIBRARY = 'This device contains unsupported or damaged library data. It was not changed; use a compatible version or restore a backup.';

/** A synchronous read is only a UI view; all mutations and sync reads are checked under the lock. */
export function libraryReadIssue(): string | null {
  if (authenticationPending || ownerTransitions || hasPendingWrite()) return 'The local library is unavailable while the account is changing or needs recovery. Refresh or sign out and try again.';
  if (boundOwner() !== getLibraryOwner()) return CHANGED_LIBRARY;
  return localDataSupported() ? null : UNSUPPORTED_LIBRARY;
}

/** Recover an interrupted write on startup (including for a guest). */
export async function recoverLibrary(): Promise<boolean> {
  try {
    const recovered = await withLibraryLock(() => recoverPendingWrite());
    if (recovered) notify('sync');
    return recovered;
  } catch { return false; }
}

async function mutate<T>(failure: T, action: () => T, draftOwner?: string): Promise<T> {
  // A tab with no prior owner must not bind to a half-written owner. An
  // already-bound tab can wait for the lock and recover/recheck inside it.
  if (tabOwner === undefined && hasPendingWrite()) return failure;
  const expected = boundOwner(); // Bind before waiting, not after another tab switches accounts.
  if (draftOwner !== undefined && draftOwner !== expected) return failure;
  try {
    return await withLibraryLock(() => {
      // A live writer clears its journal before releasing the lock. A journal
      // still present here needs explicit/startup recovery, not a new edit.
      if (hasPendingWrite() || authenticationPending || ownerTransitions || boundOwner() !== expected || getLibraryOwner() !== expected || !localDataSupported()) return failure;
      return action();
    });
  } catch { return failure; }
}

function notify(source: 'local' | 'sync' = 'local'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_CHANGE_EVENT, { detail: { source } }));
}

export interface VersionedValue<T> { value: T; modified: number }
export interface LibrarySnapshot {
  // Version 3 prevents older clients from silently dropping picking patterns.
  version: 3;
  favorites: Record<string, VersionedValue<boolean>>;
  notes: Record<string, VersionedValue<string>>;
  lessons: Record<string, VersionedValue<boolean>>;
  progressions: Record<string, VersionedValue<SavedProgression | null>>;
}

type SnapshotPart = 'favorites' | 'notes' | 'lessons';
let lastModified = 0;
function nextStamp(previous = 0): number {
  lastModified = Math.max(Date.now(), lastModified + 1, previous + 1);
  return lastModified;
}
function stampedMetadata(part: SnapshotPart, key: string, value: boolean | string): LibrarySnapshot {
  const meta = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  const modified = nextStamp(meta[part]?.[key]?.modified);
  // The union is safe here: callers select the value type matching `part`.
  (meta[part] as Record<string, VersionedValue<boolean | string>>)[key] = { value, modified };
  return meta;
}
function validLibraryKey(key: string): boolean {
  return !!key && key.length <= 180 && key !== '__proto__' && key !== 'constructor';
}
function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function emptySnapshot(): LibrarySnapshot {
  return { version: 3, favorites: {}, notes: {}, lessons: {}, progressions: {} };
}

/** JSONB may return object properties in a different order than localStorage. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  }) ?? '';
}

/** Validate remote JSON before it can affect local state. */
export function normalizeSnapshot(input: unknown): LibrarySnapshot {
  const result = emptySnapshot();
  if (!input || typeof input !== 'object' || ![1, 2, 3].includes((input as { version?: number }).version ?? 0)) return result;
  const source = input as Record<string, unknown>;
  for (const part of ['favorites', 'notes', 'lessons'] as const) {
    const records = source[part];
    if (!records || typeof records !== 'object' || Array.isArray(records)) continue;
    for (const [key, entry] of Object.entries(records)) {
      if (!key || key.length > 180 || key === '__proto__' || key === 'constructor' || !entry || typeof entry !== 'object') continue;
      const { value, modified } = entry as { value?: unknown; modified?: unknown };
      const validValue = part === 'notes' ? typeof value === 'string' && value.length <= 50000 : typeof value === 'boolean';
      if (validValue && typeof modified === 'number' && Number.isFinite(modified) && modified >= 0) {
        (result[part] as Record<string, VersionedValue<boolean | string>>)[key] = { value: value as boolean | string, modified };
      }
    }
  }
  const progressions = source.progressions;
  if (progressions && typeof progressions === 'object' && !Array.isArray(progressions)) {
    for (const [key, entry] of Object.entries(progressions)) {
      if (!key || key.length > 180 || key === '__proto__' || key === 'constructor' || !entry || typeof entry !== 'object') continue;
      const { value, modified } = entry as { value?: unknown; modified?: unknown };
      if ((value === null || validProgression(value, key)) && typeof modified === 'number' && Number.isFinite(modified) && modified >= 0) {
        result.progressions[key] = { value: value as SavedProgression | null, modified };
      }
    }
  }
  return result;
}

/** Reject any snapshot that normalization would lose, including future fields and tombstones. */
export function snapshotIsSupported(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const source = input as Record<string, unknown>;
  if (![1, 2, 3].includes(source.version as number) || Object.keys(source).some((key) => !['version', 'favorites', 'notes', 'lessons', 'progressions'].includes(key))) return false;
  const normalized = normalizeSnapshot(source);
  for (const part of ['favorites', 'notes', 'lessons', 'progressions'] as const) {
    const records = source[part];
    if (records === undefined && (part !== 'progressions' || source.version === 1)) continue;
    if (!records || typeof records !== 'object' || Array.isArray(records) || canonicalJson(records) !== canonicalJson(normalized[part])) return false;
  }
  return true;
}

/** Inspect original JSON, not filtered UI views, before any read/modify/write or sync. */
function localDataSupported(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const parse = (key: string, fallback: unknown): unknown => {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    };
    const owner = parse('library-owner', '');
    if (typeof owner !== 'string' || owner.length > 180) return false;
    const favorites = parse('favorites', []);
    const notes = parse('notes', {});
    const lessons = parse('lessons-complete', []);
    const progressions = parse('progressions', []);
    const meta = parse('sync-meta', emptySnapshot());
    const validKeys = (value: unknown): value is string[] => Array.isArray(value) && value.every((key) => typeof key === 'string' && validLibraryKey(key)) && new Set(value).size === value.length;
    if (!validKeys(favorites) || !validKeys(lessons) || !notes || typeof notes !== 'object' || Array.isArray(notes) || !Array.isArray(progressions) || !snapshotIsSupported(meta)) return false;
    if (!Object.entries(notes).every(([key, value]) => validLibraryKey(key) && typeof value === 'string' && value.length <= 50000)) return false;
    if (!progressions.every((entry) => validProgression(entry) && validLibraryKey(entry.id)) || new Set(progressions.map((entry: SavedProgression) => entry.id)).size !== progressions.length) return false;
    const snapshot = normalizeSnapshot(meta);
    // A list item must not be silently replaced by inconsistent metadata.
    for (const key of favorites) if (hasOwn(snapshot.favorites, key) && !snapshot.favorites[key].value) return false;
    for (const id of lessons) if (hasOwn(snapshot.lessons, id) && !snapshot.lessons[id].value) return false;
    for (const [key, value] of Object.entries(notes)) if (hasOwn(snapshot.notes, key) && snapshot.notes[key].value !== value) return false;
    for (const item of progressions as SavedProgression[]) if (hasOwn(snapshot.progressions, item.id) && canonicalJson(snapshot.progressions[item.id].value) !== canonicalJson(item)) return false;
    // Also detect a missing materialized item, which may be a deletion by an
    // older client. Treating metadata as authoritative would resurrect it.
    if (Object.entries(snapshot.favorites).some(([key, entry]) => entry.value && !favorites.includes(key))) return false;
    if (Object.entries(snapshot.lessons).some(([key, entry]) => entry.value && !lessons.includes(key))) return false;
    if (Object.entries(snapshot.notes).some(([key, entry]) => !!entry.value && (!hasOwn(notes, key) || (notes as Record<string, unknown>)[key] !== entry.value))) return false;
    const progressionIds = new Set((progressions as SavedProgression[]).map((item) => item.id));
    if (Object.entries(snapshot.progressions).some(([key, entry]) => entry.value !== null && !progressionIds.has(key))) return false;
    return true;
  } catch { return false; }
}

/** Check and read the local snapshot in the same cross-tab critical section. */
export async function readSnapshotForSync(expectedOwner: string): Promise<LibrarySnapshot> {
  const expected = boundOwner();
  return withLibraryLock(() => {
    if (!recoverPendingWrite() || authenticationPending || ownerTransitions || expected !== expectedOwner || boundOwner() !== expectedOwner || getLibraryOwner() !== expectedOwner) throw new Error(CHANGED_LIBRARY);
    if (!localDataSupported()) throw new Error(UNSUPPORTED_LIBRARY);
    return getLibrarySnapshot();
  });
}

/** Merge edits made in flight and apply while the owner and raw data are still checked. */
export async function applySnapshotForSync(expectedOwner: string, remote: LibrarySnapshot): Promise<LibrarySnapshot> {
  const expected = boundOwner();
  return withLibraryLock(() => {
    if (!recoverPendingWrite() || authenticationPending || ownerTransitions || expected !== expectedOwner || boundOwner() !== expectedOwner || getLibraryOwner() !== expectedOwner) throw new Error(CHANGED_LIBRARY);
    if (!localDataSupported() || !snapshotIsSupported(remote)) throw new Error(UNSUPPORTED_LIBRARY);
    const latest = mergeLibrarySnapshots(remote, getLibrarySnapshot());
    if (!applySnapshotUnlocked(latest)) throw new Error('Could not save the synced library on this device. Check browser storage and try again.');
    return latest;
  });
}

/** Convert older local-only libraries without discarding favorites or notes. */
function snapshotUnlocked(): LibrarySnapshot {
  const snapshot = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  for (const key of read<string[]>('favorites', [])) if (!hasOwn(snapshot.favorites, key)) snapshot.favorites[key] = { value: true, modified: 0 };
  for (const [key, value] of Object.entries(read<Record<string, string>>('notes', {}))) if (!hasOwn(snapshot.notes, key)) snapshot.notes[key] = { value, modified: 0 };
  for (const id of read<string[]>('lessons-complete', [])) if (!hasOwn(snapshot.lessons, id)) snapshot.lessons[id] = { value: true, modified: 0 };
  for (const progression of read<SavedProgression[]>('progressions', [])) if (!hasOwn(snapshot.progressions, progression.id)) snapshot.progressions[progression.id] = { value: progression, modified: 0 };
  return snapshot;
}
export function getLibrarySnapshot(): LibrarySnapshot {
  if (!canReadLibrary()) throw new Error(CHANGED_LIBRARY);
  if (!localDataSupported()) throw new Error(UNSUPPORTED_LIBRARY);
  return snapshotUnlocked();
}

/** Merge per-item last writes; deterministic tie-breaking handles equal clocks. */
export function mergeLibrarySnapshots(a: LibrarySnapshot, b: LibrarySnapshot): LibrarySnapshot {
  const merged = emptySnapshot();
  for (const part of ['favorites', 'notes', 'lessons', 'progressions'] as const) {
    const left = a[part] as Record<string, VersionedValue<unknown>>;
    const right = b[part] as Record<string, VersionedValue<unknown>>;
    const target = merged[part] as Record<string, VersionedValue<unknown>>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      // Item IDs can be names such as "toString"; inherited properties are
      // not versioned records and must not win a merge against real data.
      const x = hasOwn(left, key) ? left[key] : undefined;
      const y = hasOwn(right, key) ? right[key] : undefined;
      if (!x && y) target[key] = y;
      else if (x && !y) target[key] = x;
      else if (x && y && x.modified !== y.modified) target[key] = x.modified > y.modified ? x : y;
      else if (x && y) target[key] = canonicalJson(x.value) <= canonicalJson(y.value) ? x : y;
    }
  }
  return merged;
}

function snapshotEntries(snapshot: LibrarySnapshot): [string, unknown][] {
  return [
    ['sync-meta', snapshot],
    ['favorites', Object.entries(snapshot.favorites).filter(([, v]) => v.value).sort((a, b) => b[1].modified - a[1].modified).map(([key]) => key)],
    ['notes', Object.fromEntries(Object.entries(snapshot.notes).filter(([, v]) => v.value).map(([key, v]) => [key, v.value]))],
    ['lessons-complete', Object.entries(snapshot.lessons).filter(([, v]) => v.value).map(([key]) => key)],
    ['progressions', Object.values(snapshot.progressions).filter((entry) => entry.value !== null).sort((a, b) => b.modified - a.modified).map((entry) => entry.value)],
  ];
}

/** Apply an already-merged snapshot without creating new timestamps. */
function applySnapshotUnlocked(input: LibrarySnapshot): boolean {
  if (!snapshotIsSupported(input)) return false;
  const ok = writeMany(snapshotEntries(normalizeSnapshot(input)));
  if (ok) notify('sync');
  return ok;
}
export function applyLibrarySnapshot(input: LibrarySnapshot): Promise<boolean> {
  return mutate(false, () => applySnapshotUnlocked(input));
}

// ---------------------------------------------------------- progressions
export function getProgressions(): SavedProgression[] {
  if (!canReadLibrary()) return [];
  const stored = read<unknown>('progressions', []);
  return Array.isArray(stored) ? stored.filter((entry): entry is SavedProgression => validProgression(entry)) : [];
}

function changeProgression(id: string, value: SavedProgression | null): boolean {
  if (!validLibraryKey(id) || (value !== null && !validProgression(value, id))) return false;
  const meta = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  meta.progressions[id] = { value, modified: nextStamp(meta.progressions[id]?.modified) };
  const remaining = getProgressions().filter((item) => item.id !== id);
  const list = value ? [value, ...remaining] : remaining;
  if (!writeMany([['sync-meta', meta], ['progressions', list]])) return false;
  notify();
  return true;
}
export function saveProgression(value: SavedProgression, draftOwner?: string): Promise<boolean> { return mutate(false, () => changeProgression(value.id, value), draftOwner); }
export function deleteProgression(id: string, expectedOwner?: string): Promise<boolean> { return mutate(false, () => changeProgression(id, null), expectedOwner); }

// First account adopts the guest library. Each subsequent account has a local cache.
export function getLibraryOwner(): string { return read<string>('library-owner', ''); }

export async function switchLibraryOwner(nextId: string, isCurrent = () => true): Promise<boolean> {
  if (!validLibraryKey(nextId)) return false;
  if (!hasPendingWrite()) boundOwner();
  ownerTransitions++;
  let switched = false;
  try {
    switched = await withLibraryLock(() => {
      if (!isCurrent() || !recoverPendingWrite() || !localDataSupported()) return false;
      const current = getLibraryOwner();
      // A stale tab may accept an already-completed switch to its requested user,
      // but cannot switch away from an owner it never observed.
      if (current !== boundOwner() && current !== nextId) return false;
      if (current === nextId) { tabOwner = nextId; return true; }
      const backupKey = `account-library:${encodeURIComponent(current)}`;
      const targetKey = `account-library:${encodeURIComponent(nextId)}`;
      const targetRaw = localStorage.getItem(PREFIX + targetKey);
      const sourceRaw = current ? localStorage.getItem(PREFIX + backupKey) : null;
      let target: LibrarySnapshot = emptySnapshot();
      let source: LibrarySnapshot | null = null;
      try {
        if (targetRaw !== null) { const parsed: unknown = JSON.parse(targetRaw); if (!snapshotIsSupported(parsed)) return false; target = normalizeSnapshot(parsed); }
        if (sourceRaw !== null) { const parsed: unknown = JSON.parse(sourceRaw); if (!snapshotIsSupported(parsed)) return false; source = normalizeSnapshot(parsed); }
      } catch { return false; }
      // A prior account cache plus an unowned guest library needs explicit recovery;
      // do not overwrite either by silently adopting one over the other.
      if (!current && targetRaw !== null) return false;
      if (!current) {
        if (!writeMany([['library-owner', nextId]])) return false;
      } else {
        const active = snapshotUnlocked();
        const backup = source ? mergeLibrarySnapshots(source, active) : active;
        if (!writeMany([[backupKey, backup], ...snapshotEntries(target), ['library-owner', nextId]])) return false;
      }
      tabOwner = nextId;
      return true;
    });
    return switched;
  } catch { return false; }
  finally { ownerTransitions--; if (switched && ownerTransitions === 0) notify('sync'); }
}

// ------------------------------------------------------------- favorites
export function getFavorites(): string[] {
  const stored = canReadLibrary() ? read<unknown>('favorites', []) : [];
  return Array.isArray(stored) ? [...new Set(stored.filter((value): value is string => typeof value === 'string'))] : [];
}
export function isFavorite(chordKey: string): boolean { return getFavorites().includes(chordKey); }
/** Return the new state, or null if the item could not be saved safely. */
export function toggleFavorite(chordKey: string, expectedOwner?: string): Promise<boolean | null> {
  return mutate<boolean | null>(null, () => {
    if (!validLibraryKey(chordKey)) return null;
    const list = getFavorites();
    const exists = list.includes(chordKey);
    const meta = stampedMetadata('favorites', chordKey, !exists);
    const next = exists ? list.filter((k) => k !== chordKey) : [chordKey, ...list];
    if (!writeMany([['sync-meta', meta], ['favorites', next]])) return null;
    notify();
    return !exists;
  }, expectedOwner);
}

// Recent chords and quiz totals are device-local (not part of account sync).
export interface RecentChord { key: string; rootName: string; typeId: string; shortName: string; viewedAt: number }
function isRecent(value: unknown): value is RecentChord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<RecentChord>;
  return typeof item.key === 'string' && typeof item.rootName === 'string' && typeof item.typeId === 'string' && typeof item.shortName === 'string' && typeof item.viewedAt === 'number' && Number.isFinite(item.viewedAt);
}
function writableRecents(): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + 'recents');
    if (raw === null) return true;
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 20 || !value.every(isRecent) || new Set(value.map((item) => item.key)).size !== value.length) return false;
    return value.every((item) => {
      if (Object.keys(item).some((key) => !['key', 'rootName', 'typeId', 'shortName', 'viewedAt'].includes(key)) || item.key !== `${item.rootName}|${item.typeId}`) return false;
      try { buildChord(item.rootName, item.typeId); return true; } catch { return false; }
    });
  } catch { return false; }
}
export function getRecents(): RecentChord[] {
  const stored = canReadLibrary() ? read<unknown>('recents', []) : [];
  return Array.isArray(stored) ? stored.filter(isRecent) : [];
}
export function addRecent(entry: Omit<RecentChord, 'viewedAt'>): Promise<boolean> {
  return mutate(false, () => {
    if (!writableRecents()) return false;
    const list = getRecents().filter((r) => r.key !== entry.key);
    const ok = writeMany([['recents', [{ ...entry, viewedAt: Date.now() }, ...list].slice(0, 20)]]);
    if (ok) notify();
    return ok;
  });
}

// ----------------------------------------------------------------- notes
export function getNotes(): Record<string, string> {
  const stored = canReadLibrary() ? read<unknown>('notes', {}) : {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
}
export function getNote(chordKey: string): string {
  const notes = getNotes();
  return hasOwn(notes, chordKey) ? notes[chordKey] : '';
}
export function saveNote(chordKey: string, text: string, draftOwner?: string): Promise<boolean> {
  return mutate(false, () => {
    if (!validLibraryKey(chordKey) || text.length > 50000) return false;
    const all = getNotes();
    if (text.trim()) all[chordKey] = text;
    else delete all[chordKey];
    const meta = stampedMetadata('notes', chordKey, text.trim() ? text : '');
    if (!writeMany([['sync-meta', meta], ['notes', all]])) return false;
    notify();
    return true;
  }, draftOwner);
}

// ------------------------------------------------------ lesson challenges
export function getCompletedLessons(): string[] {
  const stored = canReadLibrary() ? read<unknown>('lessons-complete', []) : [];
  return Array.isArray(stored) ? [...new Set(stored.filter((value): value is string => typeof value === 'string'))] : [];
}
export function markLessonComplete(id: string): Promise<boolean> {
  return mutate(false, () => {
    if (!validLibraryKey(id)) return false;
    const completed = getCompletedLessons();
    if (completed.includes(id)) return true;
    const meta = stampedMetadata('lessons', id, true);
    if (!writeMany([['sync-meta', meta], ['lessons-complete', [...completed, id]]])) return false;
    notify();
    return true;
  });
}

// ------------------------------------------------------------- progress
export interface QuizProgress { answered: number; correct: number; bestStreak: number }
const emptyQuizProgress = (): QuizProgress => ({ answered: 0, correct: 0, bestStreak: 0 });
function validQuizProgress(value: unknown): value is QuizProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).every((key) => ['answered', 'correct', 'bestStreak'].includes(key)) &&
    ['answered', 'correct', 'bestStreak'].every((key) => typeof item[key] === 'number' && Number.isSafeInteger(item[key]) && (item[key] as number) >= 0);
}
export function getQuizProgress(): QuizProgress {
  const stored = canReadLibrary() ? read<unknown>('quiz-progress', emptyQuizProgress()) : null;
  return validQuizProgress(stored) ? stored : emptyQuizProgress();
}
export function recordQuizAnswer(correct: boolean, streak: number): Promise<QuizProgress | null> {
  return mutate<QuizProgress | null>(null, () => {
    const raw = localStorage.getItem(PREFIX + 'quiz-progress');
    if (raw !== null) { try { if (!validQuizProgress(JSON.parse(raw))) return null; } catch { return null; } }
    const current = getQuizProgress();
    const next = { answered: current.answered + 1, correct: current.correct + (correct ? 1 : 0), bestStreak: Math.max(current.bestStreak, streak) };
    if (!writeMany([['quiz-progress', next]])) return null;
    notify();
    return next;
  });
}

export function chordKey(rootName: string, typeId: string): string { return `${rootName}|${typeId}`; }
