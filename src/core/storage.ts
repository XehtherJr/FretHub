/**
 * Local-first library storage. All features work without an account. Optional
 * sync exchanges a versioned snapshot with per-item timestamps and tombstones
 * so a removal on one device is not resurrected on another.
 */
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

function write<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}

function notify(source: 'local' | 'sync' = 'local'): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_CHANGE_EVENT, { detail: { source } }));
}

export interface VersionedValue<T> { value: T; modified: number }
export interface LibrarySnapshot {
  version: 1;
  favorites: Record<string, VersionedValue<boolean>>;
  notes: Record<string, VersionedValue<string>>;
  lessons: Record<string, VersionedValue<boolean>>;
}

type SnapshotPart = 'favorites' | 'notes' | 'lessons';
let lastModified = 0;
function stamp(part: SnapshotPart, key: string, value: boolean | string): void {
  const meta = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  lastModified = Math.max(Date.now(), lastModified + 1, (meta[part]?.[key]?.modified ?? 0) + 1);
  // The union is safe here: callers select the value type matching `part`.
  (meta[part] as Record<string, VersionedValue<boolean | string>>)[key] = { value, modified: lastModified };
  write('sync-meta', meta);
}

export function emptySnapshot(): LibrarySnapshot {
  return { version: 1, favorites: {}, notes: {}, lessons: {} };
}

/** Validate remote JSON before it can affect local state. */
export function normalizeSnapshot(input: unknown): LibrarySnapshot {
  const result = emptySnapshot();
  if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1) return result;
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
  return result;
}

/** Convert older local-only libraries without discarding favorites or notes. */
export function getLibrarySnapshot(): LibrarySnapshot {
  const snapshot = normalizeSnapshot(read<unknown>('sync-meta', emptySnapshot()));
  for (const key of getFavorites()) if (!snapshot.favorites[key]) snapshot.favorites[key] = { value: true, modified: 0 };
  for (const [key, value] of Object.entries(getNotes())) if (!snapshot.notes[key]) snapshot.notes[key] = { value, modified: 0 };
  for (const id of getCompletedLessons()) if (!snapshot.lessons[id]) snapshot.lessons[id] = { value: true, modified: 0 };
  return snapshot;
}

/** Merge per-item last writes; deterministic tie-breaking handles equal clocks. */
export function mergeLibrarySnapshots(a: LibrarySnapshot, b: LibrarySnapshot): LibrarySnapshot {
  const merged = emptySnapshot();
  for (const part of ['favorites', 'notes', 'lessons'] as const) {
    const left = a[part] as Record<string, VersionedValue<boolean | string>>;
    const right = b[part] as Record<string, VersionedValue<boolean | string>>;
    const target = merged[part] as Record<string, VersionedValue<boolean | string>>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const x = left[key];
      const y = right[key];
      if (!x) target[key] = y;
      else if (!y) target[key] = x;
      else if (x.modified !== y.modified) target[key] = x.modified > y.modified ? x : y;
      else target[key] = JSON.stringify(x.value) <= JSON.stringify(y.value) ? x : y;
    }
  }
  return merged;
}

/** Apply an already-merged snapshot without creating new timestamps. */
export function applyLibrarySnapshot(input: LibrarySnapshot): void {
  const snapshot = normalizeSnapshot(input);
  write('sync-meta', snapshot);
  write('favorites', Object.entries(snapshot.favorites).filter(([, v]) => v.value)
    .sort((a, b) => b[1].modified - a[1].modified).map(([key]) => key));
  write('notes', Object.fromEntries(Object.entries(snapshot.notes).filter(([, v]) => v.value).map(([key, v]) => [key, v.value])));
  write('lessons-complete', Object.entries(snapshot.lessons).filter(([, v]) => v.value).map(([key]) => key));
  notify('sync');
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
