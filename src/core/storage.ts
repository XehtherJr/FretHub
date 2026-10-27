/**
 * storage.ts — client-side persistence for favorites, recently viewed
 * chords, personal notes and practice progress. Everything lives in
 * localStorage, so the core reference needs no account and no server.
 */

const PREFIX = 'frethub:';

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
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); fail silently.
  }
}

// ------------------------------------------------------------- favorites
export function getFavorites(): string[] {
  return read<string[]>('favorites', []);
}

export function isFavorite(chordKey: string): boolean {
  return getFavorites().includes(chordKey);
}

export function toggleFavorite(chordKey: string): boolean {
  const list = getFavorites();
  const exists = list.includes(chordKey);
  const next = exists ? list.filter((k) => k !== chordKey) : [chordKey, ...list];
  write('favorites', next);
  return !exists;
}

// --------------------------------------------------------------- recents
export interface RecentChord {
  key: string;
  rootName: string;
  typeId: string;
  shortName: string;
  viewedAt: number;
}

export function getRecents(): RecentChord[] {
  return read<RecentChord[]>('recents', []);
}

export function addRecent(entry: Omit<RecentChord, 'viewedAt'>): void {
  const list = getRecents().filter((r) => r.key !== entry.key);
  write('recents', [{ ...entry, viewedAt: Date.now() }, ...list].slice(0, 20));
}

// ----------------------------------------------------------------- notes
export function getNotes(): Record<string, string> {
  return read<Record<string, string>>('notes', {});
}

export function getNote(chordKey: string): string {
  return getNotes()[chordKey] ?? '';
}

export function saveNote(chordKey: string, text: string): void {
  const all = getNotes();
  if (text.trim()) all[chordKey] = text;
  else delete all[chordKey];
  write('notes', all);
}

// ------------------------------------------------------------- progress
export interface QuizProgress {
  answered: number;
  correct: number;
  bestStreak: number;
}

export function getQuizProgress(): QuizProgress {
  return read<QuizProgress>('quiz-progress', { answered: 0, correct: 0, bestStreak: 0 });
}

export function recordQuizAnswer(correct: boolean, streak: number): QuizProgress {
  const current = getQuizProgress();
  const next: QuizProgress = {
    answered: current.answered + 1,
    correct: current.correct + (correct ? 1 : 0),
    bestStreak: Math.max(current.bestStreak, streak),
  };
  write('quiz-progress', next);
  return next;
}

/** Chord key helper shared by pages so URLs and storage keys never drift. */
export function chordKey(rootName: string, typeId: string): string {
  return `${rootName}|${typeId}`;
}
