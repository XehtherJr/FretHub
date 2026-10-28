/**
 * Local-first library storage. All features work without an account. Optional
 * sync exchanges a versioned snapshot with per-item timestamps and tombstones
 * so a removal on one device is not resurrected on another.
 */
import { validProgression, type SavedProgression } from './userProgressions';

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

function write<T>(key: string, value: T): boolean {
  if (typeof localStorage === 'undefined') return false;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

/** Apply related local records together; restore the old values if storage is full. */
function writeMany(entries: [string, unknown][]): boolean {
  if (typeof localStorage === 'undefined') return false;
  const previous: [string, string | null][] = [];
  try {
    for (const [key, value] of entries) {
      const fullKey = PREFIX + key;
      previous.push([fullKey, localStorage.getItem(fullKey)]);
      localStorage.setItem(fullKey, JSON.stringify(value));
    }
    return true;
  } catch {
    for (const [key, old] of previous.reverse()) {
      try { if (old === null) localStorage.removeItem(key); else localStorage.setItem(key, old); } catch { /* Best effort if storage remains unavailable. */ }
    }
    return false;
  }
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
function stamp(part: SnapshotPart, key: string, value: boolean | string): void {
  const meta = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  const modified = nextStamp(meta[part]?.[key]?.modified);
  // The union is safe here: callers select the value type matching `part`.
  (meta[part] as Record<string, VersionedValue<boolean | string>>)[key] = { value, modified };
  write('sync-meta', meta);
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

/** Convert older local-only libraries without discarding favorites or notes. */
export function getLibrarySnapshot(): LibrarySnapshot {
  const snapshot = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  for (const key of getFavorites()) if (!snapshot.favorites[key]) snapshot.favorites[key] = { value: true, modified: 0 };
  for (const [key, value] of Object.entries(getNotes())) if (!snapshot.notes[key]) snapshot.notes[key] = { value, modified: 0 };
  for (const id of getCompletedLessons()) if (!snapshot.lessons[id]) snapshot.lessons[id] = { value: true, modified: 0 };
  for (const progression of getProgressions()) if (!snapshot.progressions[progression.id]) snapshot.progressions[progression.id] = { value: progression, modified: 0 };
  return snapshot;
}

/** Merge per-item last writes; deterministic tie-breaking handles equal clocks. */
export function mergeLibrarySnapshots(a: LibrarySnapshot, b: LibrarySnapshot): LibrarySnapshot {
  const merged = emptySnapshot();
  for (const part of ['favorites', 'notes', 'lessons', 'progressions'] as const) {
    const left = a[part] as Record<string, VersionedValue<unknown>>;
    const right = b[part] as Record<string, VersionedValue<unknown>>;
    const target = merged[part] as Record<string, VersionedValue<unknown>>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const x = left[key];
      const y = right[key];
      if (!x) target[key] = y;
      else if (!y) target[key] = x;
      else if (x.modified !== y.modified) target[key] = x.modified > y.modified ? x : y;
      else target[key] = canonicalJson(x.value) <= canonicalJson(y.value) ? x : y;
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
export function applyLibrarySnapshot(input: LibrarySnapshot): boolean {
  const ok = writeMany(snapshotEntries(normalizeSnapshot(input)));
  if (ok) notify('sync');
  return ok;
}

// ---------------------------------------------------------- progressions
export function getProgressions(): SavedProgression[] {
  const stored = read<unknown>('progressions', []);
  return Array.isArray(stored) ? stored.filter((entry): entry is SavedProgression => validProgression(entry)) : [];
}

/** Store the list and its sync metadata together, retaining deleted-item tombstones. */
function changeProgression(id: string, value: SavedProgression | null): boolean {
  if (!id || id.length > 180 || id === '__proto__' || id === 'constructor' || (value !== null && !validProgression(value, id))) return false;
  const meta = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  meta.progressions[id] = { value, modified: nextStamp(meta.progressions[id]?.modified) };
  const remaining = getProgressions().filter((item) => item.id !== id);
  const list = value ? [value, ...remaining] : remaining;
  if (!writeMany([['sync-meta', meta], ['progressions', list]])) return false;
  notify();
  return true;
}
export function saveProgression(value: SavedProgression): boolean { return changeProgression(value.id, value); }
export function deleteProgression(id: string): boolean { return changeProgression(id, null); }

/**
 * Keep different accounts' local libraries separate. The first account adopts
 * this device's guest library; switching accounts backs up the previous one
 * before loading the other account's cached library (or an empty library).
 */
export function getLibraryOwner(): string { return read<string>('library-owner', ''); }

export function switchLibraryOwner(nextId: string): boolean {
  if (!nextId || nextId.length > 180) return false;
  const current = getLibraryOwner();
  if (current === nextId) return true;
  if (!current) return write('library-owner', nextId);
  const backup = getLibrarySnapshot();
  const target = normalizeSnapshot(read<unknown>(`account-library:${encodeURIComponent(nextId)}`, emptySnapshot()));
  const ok = writeMany([
    [`account-library:${encodeURIComponent(current)}`, backup],
    ...snapshotEntries(target),
    ['library-owner', nextId],
  ]);
  if (ok) notify('sync');
  return ok;
}

// ------------------------------------------------------------- favorites
export function getFavorites(): string[] { return read<string[]>('favorites', []); }
export function isFavorite(chordKey: string): boolean { return getFavorites().includes(chordKey); }
export function toggleFavorite(chordKey: string): boolean {
  const list = getFavorites();
  const exists = list.includes(chordKey);
  write('favorites', exists ? list.filter((k) => k !== chordKey) : [chordKey, ...list]);
  stamp('favorites', chordKey, !exists);
  notify();
  return !exists;
}

// --------------------------------------------------------------- recents
export interface RecentChord { key: string; rootName: string; typeId: string; shortName: string; viewedAt: number }
export function getRecents(): RecentChord[] { return read<RecentChord[]>('recents', []); }
export function addRecent(entry: Omit<RecentChord, 'viewedAt'>): void {
  const list = getRecents().filter((r) => r.key !== entry.key);
  write('recents', [{ ...entry, viewedAt: Date.now() }, ...list].slice(0, 20));
  notify();
}

// ----------------------------------------------------------------- notes
export function getNotes(): Record<string, string> { return read<Record<string, string>>('notes', {}); }
export function getNote(chordKey: string): string { return getNotes()[chordKey] ?? ''; }
export function saveNote(chordKey: string, text: string): void {
  const all = getNotes();
  if (text.trim()) all[chordKey] = text;
  else delete all[chordKey];
  write('notes', all);
  stamp('notes', chordKey, text.trim() ? text : '');
  notify();
}

// ------------------------------------------------------ lesson challenges
export function getCompletedLessons(): string[] { return read<string[]>('lessons-complete', []); }
export function markLessonComplete(id: string): void {
  const completed = getCompletedLessons();
  if (completed.includes(id)) return;
  write('lessons-complete', [...completed, id]);
  stamp('lessons', id, true);
  notify();
}

// ------------------------------------------------------------- progress
export interface QuizProgress { answered: number; correct: number; bestStreak: number }
export function getQuizProgress(): QuizProgress {
  return read<QuizProgress>('quiz-progress', { answered: 0, correct: 0, bestStreak: 0 });
}
export function recordQuizAnswer(correct: boolean, streak: number): QuizProgress {
  const current = getQuizProgress();
  const next = { answered: current.answered + 1, correct: current.correct + (correct ? 1 : 0), bestStreak: Math.max(current.bestStreak, streak) };
  write('quiz-progress', next);
  notify();
  return next;
}

export function chordKey(rootName: string, typeId: string): string { return `${rootName}|${typeId}`; }
