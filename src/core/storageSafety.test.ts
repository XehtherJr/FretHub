import { withLibraryLock } from './libraryLock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addRecent, emptySnapshot, getFavorites, getLibrarySnapshot, recordQuizAnswer, recoverLibrary, saveNote, switchLibraryOwner, toggleFavorite } from './storage';
import { syncLibrary } from '@/lib/cloudLibrary';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const raw = (key: string, value: unknown) => localStorage.setItem(`frethub:${key}`, JSON.stringify(value));

/** These are deliberately unreadable to this client; none may be rewritten or dropped. */
describe('local library safety', () => {
  it('does not rewrite an unsupported progression during an unrelated edit or initial sync', async () => {
    const future = [{ id: 'future-song', name: 'Future format', chords: [{ newFormat: true }] }];
    raw('progressions', future);
    expect(await toggleFavorite('C|major')).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:progressions')!)).toEqual(future);
    let inserted = false;
    const cloud = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => { inserted = true; return { error: null }; },
    }) };
    await expect(syncLibrary(cloud as unknown as SupabaseClient, 'alice')).rejects.toThrow();
    expect(inserted).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:progressions')!)).toEqual(future);
  });

  it('preserves newer metadata and unknown tombstones rather than normalizing them away', async () => {
    const meta = { version: 4, favorites: { old: { value: false, modified: 100 } }, notes: {}, lessons: {}, progressions: {}, future: { keep: true } };
    raw('sync-meta', meta);
    expect(await saveNote('C|major', 'new note')).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:sync-meta')!)).toEqual(meta);
    expect(localStorage.getItem('frethub:notes')).toBeNull();
  });

  it('refuses an account switch if the target backup is unsupported', async () => {
    raw('library-owner', 'alice');
    raw('favorites', ['C|major']);
    getLibrarySnapshot(); // Bind this tab before another account is requested.
    const future = { version: 4, favorites: {}, notes: {}, lessons: {}, progressions: {}, future: true };
    raw('account-library:bob', future);
    expect(await switchLibraryOwner('bob')).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:library-owner')!)).toBe('alice');
    expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual(['C|major']);
    expect(JSON.parse(localStorage.getItem('frethub:account-library:bob')!)).toEqual(future);
  });

  it('rejects stale-tab edits and sync even if another tab has already switched the active owner', async () => {
    raw('library-owner', 'alice');
    raw('favorites', ['C|major']);
    getLibrarySnapshot(); // This tab belongs to Alice.
    raw('library-owner', 'bob');
    raw('favorites', ['D|major']);
    expect(await toggleFavorite('G|major')).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual(['D|major']);
    let inserted = false;
    const cloud = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: async () => { inserted = true; return { error: null }; },
    }) };
    await expect(syncLibrary(cloud as unknown as SupabaseClient, 'alice')).rejects.toThrow();
    expect(inserted).toBe(false);
  });
  it('serializes competing edits and does not let a queued edit cross an account transition', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    const results = await Promise.all([toggleFavorite('C|major'), toggleFavorite('D|major')]);
    expect(results).toEqual([true, true]);
    expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'D|major']));
    const switching = switchLibraryOwner('bob');
    const edit = toggleFavorite('G|major');
    expect(await switching).toBe(true);
    expect(await edit).toBeNull();
    expect(getFavorites()).toEqual([]);
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'D|major']));
  });

  it('leaves a recoverable journal if rollback cannot finish, and hides intermediate records', async () => {
    raw('library-owner', 'alice');
    raw('favorites', ['C|major']);
    getLibrarySnapshot();
    raw('library-transaction', { version: 1, previous: [
      ['frethub:favorites', JSON.stringify(['C|major'])],
      ['frethub:library-owner', JSON.stringify('alice')],
    ] });
    raw('favorites', ['D|major']);
    raw('library-owner', 'bob');
    expect(getFavorites()).toEqual([]);
    expect(await toggleFavorite('G|major')).toBeNull();
    expect(await recoverLibrary()).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(JSON.parse(localStorage.getItem('frethub:library-owner')!)).toBe('alice');
    expect(localStorage.getItem('frethub:library-transaction')).toBeNull();
  });

  it('preserves unknown fields in both v3 metadata and the current account backup', async () => {
    raw('library-owner', 'alice');
    getLibrarySnapshot();
    const unknownMeta = { ...emptySnapshot(), notes: { x: { value: '', modified: 2, origin: 'future' } } };
    raw('sync-meta', unknownMeta);
    expect(await toggleFavorite('C|major')).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:sync-meta')!)).toEqual(unknownMeta);
    localStorage.removeItem('frethub:sync-meta');
    const futureBackup = { ...emptySnapshot(), extensions: { keep: true } };
    raw('account-library:alice', futureBackup);
    expect(await switchLibraryOwner('bob')).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:account-library:alice')!)).toEqual(futureBackup);
    expect(JSON.parse(localStorage.getItem('frethub:library-owner')!)).toBe('alice');
  });

  it('does not upload after ownership changes while the cloud read is in flight', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(await toggleFavorite('C|major')).toBe(true);
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let inserted = false;
    const cloud = { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { await waiting; return { data: null, error: null }; } }) }),
      insert: async () => { inserted = true; return { error: null }; },
    }) };
    const syncing = syncLibrary(cloud as unknown as SupabaseClient, 'alice');
    expect(await switchLibraryOwner('bob')).toBe(true);
    release();
    await expect(syncing).rejects.toThrow(/changed in another tab/i);
    expect(inserted).toBe(false);
    expect(getFavorites()).toEqual([]);
  });

  it('keeps a journal when a storage failure also prevents rollback, then recovers the original account', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(await toggleFavorite('C|major')).toBe(true);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if ((key === 'frethub:library-owner' && value === JSON.stringify('bob')) ||
          (key === 'frethub:favorites' && value === JSON.stringify(['C|major']))) throw new Error('storage unavailable');
      return original.call(this, key, value);
    });
    expect(await switchLibraryOwner('bob')).toBe(false);
    expect(localStorage.getItem('frethub:library-transaction')).not.toBeNull();
    expect(getFavorites()).toEqual([]); // Never expose a partially switched library.
    vi.restoreAllMocks();
    expect(await recoverLibrary()).toBe(true);
    expect(JSON.parse(localStorage.getItem('frethub:library-owner')!)).toBe('alice');
    expect(getFavorites()).toEqual(['C|major']);
    expect(localStorage.getItem('frethub:library-transaction')).toBeNull();
  });

  it('serializes competing account transitions without mixing the cached libraries', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(await toggleFavorite('C|major')).toBe(true);
    expect(await Promise.all([switchLibraryOwner('bob'), switchLibraryOwner('carol')])).toEqual([true, true]);
    expect(getFavorites()).toEqual([]);
    expect(await toggleFavorite('G|major')).toBe(true);
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(await switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual([]);
    expect(await switchLibraryOwner('carol')).toBe(true);
    expect(getFavorites()).toEqual(['G|major']);
  });

  it.each(['progression', 'chord', 'pattern', 'step'] as const)('does not discard unknown %s fields while editing an otherwise readable progression', async (where) => {
    const chord = { id: 'c', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 };
    const pattern = { mode: 'custom', stepsPerBeat: 1, steps: [{ kind: 'pick', strings: [1] }] };
    const progression = { id: 'p', name: 'Keep all data', tuningId: 'standard', capo: 0, bpm: 90, loop: false,
      difficulty: 'beginner', difficultyMode: 'manual', chords: [chord], pattern };
    const target = where === 'progression' ? progression : where === 'chord' ? chord : where === 'pattern' ? pattern : pattern.steps[0];
    Object.assign(target, { futureField: { keep: true } });
    raw('progressions', [progression]);
    expect(await toggleFavorite('C|major')).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:progressions')!)).toEqual([progression]);
  });

  it('preserves unsupported device-local recent and quiz data on automatic writes', async () => {
    const recent = [{ key: 'C|major', rootName: 'C', typeId: 'major', shortName: 'C', viewedAt: 5, future: 'keep' }];
    const quiz = { answered: 3, correct: 2, bestStreak: 1, future: 'keep' };
    raw('recents', recent);
    raw('quiz-progress', quiz);
    expect(await addRecent({ key: 'G|major', rootName: 'G', typeId: 'major', shortName: 'G' })).toBe(false);
    expect(await recordQuizAnswer(true, 3)).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:recents')!)).toEqual(recent);
    expect(JSON.parse(localStorage.getItem('frethub:quiz-progress')!)).toEqual(quiz);
  });

  it('checks a draft owner inside the same critical section as a note write', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(await switchLibraryOwner('bob')).toBe(true);
    expect(await saveNote('C|major', 'Alice draft', 'alice')).toBe(false);
    expect(localStorage.getItem('frethub:notes')).toBe('{}');
  });

  it('does not silently resurrect a local deletion when stored metadata disagrees', async () => {
    const meta = emptySnapshot();
    meta.favorites['C|major'] = { value: true, modified: 10 };
    raw('favorites', []);
    raw('sync-meta', meta);
    expect(await toggleFavorite('G|major')).toBeNull();
    expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual([]);
    expect(JSON.parse(localStorage.getItem('frethub:sync-meta')!)).toEqual(meta);
  });

  it('does not replace an existing first-account backup with the guest library', async () => {
    const saved = emptySnapshot();
    saved.notes['C|major'] = { value: 'Keep this backup', modified: 7 };
    raw('account-library:alice', saved);
    expect(await toggleFavorite('G|major')).toBe(true);
    expect(await switchLibraryOwner('alice')).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:account-library:alice')!)).toEqual(saved);
    expect(getFavorites()).toEqual(['G|major']);
  });

  it('queues a bound tab behind an in-progress journaled write', async () => {
    expect(getFavorites()).toEqual([]); // Bind this tab to the guest owner.
    let queued!: Promise<boolean | null>;
    await withLibraryLock(() => {
      raw('library-transaction', { version: 1, previous: [] });
      queued = toggleFavorite('C|major');
      localStorage.removeItem('frethub:library-transaction'); // The live writer completes before releasing its lock.
    });
    expect(await queued).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
  });

  it.each([
    ['an unknown journal field', { version: 1, previous: [['frethub:favorites', '["old"]']], future: { keep: true } }],
    ['an unknown journaled key', { version: 1, previous: [['frethub:future-feature', '"old"']] }],
    ['the coordination fence', { version: 1, previous: [['frethub:library-coordination-v1', '"old"']] }],
    ['duplicate journaled keys', { version: 1, previous: [['frethub:favorites', '["old"]'], ['frethub:favorites', '["older"]']] }],
  ])('leaves %s untouched rather than interpreting an unsupported rollback', async (_description, journal) => {
    raw('favorites', ['C|major']);
    raw('future-feature', { keep: 'new' });
    raw('library-transaction', journal);
    expect(await recoverLibrary()).toBe(false);
    expect(JSON.parse(localStorage.getItem('frethub:library-transaction')!)).toEqual(journal);
    expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual(['C|major']);
    expect(JSON.parse(localStorage.getItem('frethub:future-feature')!)).toEqual({ keep: 'new' });
  });

  it('still recovers recognized account backups from a valid journal', async () => {
    const backup = emptySnapshot();
    backup.notes['C|major'] = { value: 'Keep this', modified: 3 };
    raw('account-library:alice', emptySnapshot());
    raw('library-transaction', { version: 1, previous: [['frethub:account-library:alice', JSON.stringify(backup)]] });
    expect(await recoverLibrary()).toBe(true);
    expect(JSON.parse(localStorage.getItem('frethub:account-library:alice')!)).toEqual(backup);
    expect(localStorage.getItem('frethub:library-transaction')).toBeNull();
  });

});
