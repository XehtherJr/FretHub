import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLibrarySnapshot, deleteProgression, emptySnapshot, getCompletedLessons, getFavorites, getLibrarySnapshot, getNote, getNotes, getProgressions, markLessonComplete, mergeLibrarySnapshots, normalizeSnapshot, resetLibraryTabForTests, saveNote, saveProgression, switchLibraryOwner, toggleFavorite, type LibrarySnapshot } from './storage';
import type { SavedProgression } from './userProgressions';
import { syncLibrary } from '@/lib/cloudLibrary';

beforeEach(() => localStorage.clear());
// These tests reuse one fake IndexedDB while modeling a second device's empty
// library. Keep the internal fence paired with that fake database.
function clearDeviceLibrary() {
  const fence = localStorage.getItem('frethub:library-coordination-v1');
  localStorage.clear();
  if (fence !== null) localStorage.setItem('frethub:library-coordination-v1', fence);
}
afterEach(() => vi.restoreAllMocks());

const progression: SavedProgression = {
  id: 'song-1', name: 'First song', tuningId: 'standard', capo: 0, bpm: 90, loop: true,
  difficulty: 'novice', difficultyMode: 'manual', chords: [
    { id: 'step-1', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 },
    { id: 'step-2', name: 'G', frets: [3, 2, 0, 0, 0, 3], beats: 2 },
  ],
};

describe('local-first library', () => {
  it('migrates guest favorites and notes without an account', async () => {
    localStorage.setItem('frethub:favorites', JSON.stringify(['C|major']));
    localStorage.setItem('frethub:notes', JSON.stringify({ 'C|major': 'Practice this shape' }));
    const snapshot = getLibrarySnapshot();
    expect(snapshot.favorites['C|major'].value).toBe(true);
    expect(snapshot.notes['C|major'].value).toBe('Practice this shape');
  });
  it('merges independent edits and retains removals as tombstones', async () => {
    await toggleFavorite('C|major');
    await saveNote('C|major', 'A note');
    await markLessonComplete('triads');
    const old = getLibrarySnapshot();
    await toggleFavorite('C|major');
    await saveNote('C|major', '');
    await toggleFavorite('G|major');
    const merged = mergeLibrarySnapshots(old, getLibrarySnapshot());
    await applyLibrarySnapshot(merged);
    expect(getFavorites()).toEqual(['G|major']);
    expect(getNotes()).toEqual({});
    expect(getCompletedLessons()).toContain('triads');
    expect(merged.favorites['C|major'].value).toBe(false);
  });
  it('preserves valid item ids that also name inherited object properties', async () => {
    const remote = emptySnapshot();
    const inheritedKey = ['to', 'String'].join('');
    remote.notes[inheritedKey] = { value: 'Keep this note', modified: 7 };
    remote.progressions[inheritedKey] = { value: { ...progression, id: inheritedKey }, modified: 8 };
    const merged = mergeLibrarySnapshots(remote, emptySnapshot());
    expect(merged.notes[inheritedKey]).toEqual(remote.notes[inheritedKey]);
    expect(merged.progressions[inheritedKey]).toEqual(remote.progressions[inheritedKey]);
    expect(await applyLibrarySnapshot(merged)).toBe(true);
    expect(getLibrarySnapshot().notes[inheritedKey]).toEqual(remote.notes[inheritedKey]);
    expect(getProgressions().map((item) => item.id)).toContain(inheritedKey);
    localStorage.removeItem('frethub:sync-meta'); // Older local-only libraries have no metadata.
    expect(getLibrarySnapshot().notes[inheritedKey].value).toBe('Keep this note');
    expect(getLibrarySnapshot().progressions[inheritedKey].value?.id).toBe(inheritedKey);
    expect(await saveNote(inheritedKey, '')).toBe(true);
    expect(getNote(inheritedKey)).toBe('');
  });
  it('rolls back favorites, notes and lesson checks when sync metadata cannot be stored', async () => {
    await toggleFavorite('C|major');
    await saveNote('C|major', 'Original');
    await markLessonComplete('triads');
    const before = getLibrarySnapshot();
    const original = Storage.prototype.setItem;
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'frethub:sync-meta') throw new Error('quota');
      return original.call(this, key, value);
    });
    expect(await toggleFavorite('C|major')).toBeNull();
    expect(await saveNote('C|major', 'Changed')).toBe(false);
    expect(await markLessonComplete('intervals')).toBe(false);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getNotes()).toEqual({ 'C|major': 'Original' });
    expect(getCompletedLessons()).toEqual(['triads']);
    expect(getLibrarySnapshot()).toEqual(before);
    fail.mockRestore();
  });
  it('rolls back metadata if a visible library record cannot be stored', async () => {
    await saveNote('C|major', 'Original');
    const before = getLibrarySnapshot();
    const original = Storage.prototype.setItem;
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'frethub:notes') throw new Error('quota');
      return original.call(this, key, value);
    });
    expect(await saveNote('C|major', 'Changed')).toBe(false);
    expect(getNotes()).toEqual({ 'C|major': 'Original' });
    expect(getLibrarySnapshot()).toEqual(before);
    fail.mockRestore();
  });
  it('keeps progressions and deletion tombstones across merges', async () => {
    expect(await saveProgression(progression)).toBe(true);
    const saved = getLibrarySnapshot();
    expect(getProgressions()).toEqual([progression]);
    expect(await deleteProgression(progression.id)).toBe(true);
    const merged = mergeLibrarySnapshots(saved, getLibrarySnapshot());
    expect(merged.progressions[progression.id].value).toBeNull();
    await applyLibrarySnapshot(merged);
    expect(getProgressions()).toEqual([]);
  });
  it('keeps separate local libraries for different signed-in users', async () => {
    await toggleFavorite('C|major');
    expect(await switchLibraryOwner('alice')).toBe(true); // The first account adopts the guest library.
    expect(await saveProgression(progression)).toBe(true);
    expect(await switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual([]);
    expect(getProgressions()).toEqual([]);
    await toggleFavorite('G|major');
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions()).toEqual([progression]);
    expect(await switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual(['G|major']);
  });
  it('refuses an account switch if the previous local library cannot be backed up', async () => {
    await toggleFavorite('C|major');
    expect(await switchLibraryOwner('alice')).toBe(true);
    const original = Storage.prototype.setItem;
    const mocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes('account-library:')) throw new Error('quota');
      return original.call(this, key, value);
    });
    expect(await switchLibraryOwner('bob')).toBe(false);
    expect(getFavorites()).toEqual(['C|major']);
    mocked.mockRestore();
  });
  it('rolls back an account switch if writing the new owner fails midway', async () => {
    await toggleFavorite('C|major');
    expect(await saveProgression({ ...progression, id: 'alice-song' })).toBe(true);
    expect(await switchLibraryOwner('alice')).toBe(true);
    const original = Storage.prototype.setItem;
    let failed = false;
    const mocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'frethub:library-owner' && !failed) { failed = true; throw new Error('quota'); }
      return original.call(this, key, value);
    });
    expect(await switchLibraryOwner('bob')).toBe(false);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions().map((entry) => entry.id)).toEqual(['alice-song']);
    mocked.mockRestore();
    expect(await switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual([]);
    expect(await switchLibraryOwner('alice')).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions().map((entry) => entry.id)).toEqual(['alice-song']);
  });
  it('migrates old snapshots and rejects malformed progression data', async () => {
    const old = normalizeSnapshot({ version: 1, favorites: { 'C|major': { value: true, modified: 5 } } });
    expect(old.version).toBe(3);
    expect(old.favorites['C|major'].value).toBe(true);
    expect(old.progressions).toEqual({});
    const malformed = normalizeSnapshot({ ...old, progressions: { bad: { value: { ...progression, id: 'bad', capo: 40 }, modified: 10 } } });
    expect(malformed.progressions).toEqual({});
  });
  it('ignores malformed remote entries', async () => {
    const result = normalizeSnapshot({ version: 1, favorites: { a: { value: 'yes', modified: 1 }, b: { value: true, modified: 2 } }, notes: { x: { value: 2, modified: 3 } } });
    expect(result.favorites).toEqual({ b: { value: true, modified: 2 } });
    expect(result.notes).toEqual({});
  });
});

class FakeCloud {
  row: { data: LibrarySnapshot; revision: number } | null = null;
  conflictOnce = false;
  from() {
    const cloud = this;
    return {
      select() { return { eq() { return { async maybeSingle() { return { data: cloud.row ? structuredClone(cloud.row) : null, error: null }; } }; } }; },
      async insert(payload: { data: LibrarySnapshot; revision: number }) {
        if (cloud.row) return { error: { code: '23505' } };
        cloud.row = { data: structuredClone(payload.data), revision: payload.revision };
        return { error: null };
      },
      update(payload: { data: LibrarySnapshot; revision: number }) {
        let revision = 0;
        const chain = {
          eq(key: string, value: number | string) { if (key === 'revision') revision = Number(value); return chain; },
          select() { return chain; },
          async maybeSingle() {
            if (cloud.conflictOnce && cloud.row) {
              cloud.conflictOnce = false;
              cloud.row.revision++;
              cloud.row.data.favorites['D|major'] = { value: true, modified: Date.now() };
              return { data: null, error: null };
            }
            if (!cloud.row || cloud.row.revision !== revision) return { data: null, error: null };
            cloud.row = { data: structuredClone(payload.data), revision: payload.revision };
            return { data: { revision: payload.revision }, error: null };
          },
        };
        return chain;
      },
    };
  }
}

async function syncAsA(client: SupabaseClient, userId: string, isCurrent?: () => boolean) {
  // localStorage.clear below models a fresh second device, including its tab binding.
  if (!localStorage.getItem('frethub:library-owner')) {
    resetLibraryTabForTests();
    expect(await switchLibraryOwner(userId)).toBe(true);
  }
  return syncLibrary(client, userId, isCurrent);
}

describe('cloud sync', () => {
  it('saves and restores a guest library on another device', async () => {
    const cloud = new FakeCloud();
    await toggleFavorite('C|major');
    await saveNote('C|major', 'My fingering');
    await markLessonComplete('triads');
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getFavorites()).toEqual(['C|major']);
    expect(getNotes()['C|major']).toBe('My fingering');
    expect(getCompletedLessons()).toContain('triads');
  });
  it('syncs edited progressions and deletion tombstones between devices', async () => {
    const cloud = new FakeCloud();
    expect(await saveProgression(progression)).toBe(true);
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([progression]);
    const edited = { ...progression, name: 'Reordered', chords: [...progression.chords].reverse() };
    expect(await saveProgression(edited)).toBe(true);
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([edited]);
    await deleteProgression(edited.id);
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([]);
    expect(cloud.row?.data.progressions[edited.id].value).toBeNull();
  });
  it('does not rewrite identical progressions when JSONB reorders their object keys', async () => {
    const cloud = new FakeCloud();
    expect(await saveProgression(progression)).toBe(true);
    const snapshot = getLibrarySnapshot();
    const entry = snapshot.progressions[progression.id];
    const { name, ...rest } = progression;
    const reordered = { name, ...rest }; // Equivalent values, different property order.
    cloud.row = { data: { ...snapshot, progressions: { [progression.id]: { value: reordered, modified: entry.modified } } }, revision: 7 };
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row.revision).toBe(7);
    expect(getProgressions()).toEqual([progression]);
  });
  it('retains a progression edited while its earlier snapshot is in flight', async () => {
    const cloud = new FakeCloud();
    const edited = { ...progression, name: 'Edited while syncing' };
    const delayed = { from() {
      const table = cloud.from();
      return { ...table, async insert(payload: { data: LibrarySnapshot; revision: number }) {
        const result = await table.insert(payload);
        expect(await saveProgression(edited)).toBe(true);
        return result;
      } };
    } };
    expect(await saveProgression(progression)).toBe(true);
    expect(await syncAsA(delayed as unknown as SupabaseClient, 'user-a')).toEqual({ dirty: true });
    expect(getProgressions()).toEqual([edited]);
    expect(cloud.row?.data.progressions[progression.id].value).toEqual(progression);
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.progressions[progression.id].value).toEqual(edited);
  });
  it('upgrades a version-one cloud snapshot instead of allowing an old client to erase progressions', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { version: 1, favorites: { 'C|major': { value: true, modified: 2 } }, notes: {}, lessons: {} } as unknown as LibrarySnapshot, revision: 1 };
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.version).toBe(3);
    expect(cloud.row?.revision).toBe(2);
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('upgrades version-two saves and syncs a custom picking pattern without losing old chords', async () => {
    const cloud = new FakeCloud();
    const old = { ...emptySnapshot(), version: 2, progressions: { [progression.id]: { value: progression, modified: 20 } } };
    cloud.row = { data: old as unknown as LibrarySnapshot, revision: 1 };
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.version).toBe(3);
    expect(getProgressions()).toEqual([progression]);
    const patterned: SavedProgression = { ...progression, pattern: { mode: 'custom', stepsPerBeat: 2, steps: [
      { kind: 'pick', strings: [1] }, { kind: 'pick', strings: [3, 5] }, { kind: 'down' }, { kind: 'rest' },
    ] } };
    expect(await saveProgression(patterned)).toBe(true);
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([patterned]);
    // The previous client accepts only v1/v2, so it refuses rather than rewriting v3.
    expect([1, 2].includes(cloud.row!.data.version)).toBe(false);
  });
  it('merges and restores the separate triad application challenge using the existing lesson snapshot', async () => {
    const cloud = new FakeCloud();
    await markLessonComplete('triad-transfer-v1');
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    clearDeviceLibrary();
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(getCompletedLessons()).toContain('triad-transfer-v1');
    expect(getLibrarySnapshot().lessons['triad-transfer-v1'].value).toBe(true);
  });
  it('retries a concurrent update and preserves both devices’ changes', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: emptySnapshot(), revision: 1 };
    cloud.conflictOnce = true;
    await toggleFavorite('C|major');
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'D|major']));
    expect(cloud.row?.revision).toBe(3);
  });
  it('does not lose a cloud item whose id names an inherited object property', async () => {
    const cloud = new FakeCloud();
    const key = ['to', 'String'].join('');
    const data = emptySnapshot();
    data.notes[key] = { value: 'Keep me', modified: 12 };
    cloud.row = { data, revision: 1 };
    await toggleFavorite('C|major');
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.notes[key]).toEqual({ value: 'Keep me', modified: 12 });
    expect(getNote(key)).toBe('Keep me');
  });
  it('does not overwrite an unsupported newer cloud format', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...emptySnapshot(), version: 4 } as unknown as LibrarySnapshot, revision: 1 };
    await toggleFavorite('C|major');
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported format/);
    expect(cloud.row.revision).toBe(1);
    expect(getFavorites()).toEqual(['C|major']);
  });
  it.each(['favorites', 'notes', 'lessons'] as const)('does not discard unsupported cloud %s while merging other edits', async (part) => {
    const cloud = new FakeCloud();
    const badValue = part === 'notes' ? 42 : 'not a boolean';
    const data = { ...emptySnapshot(), [part]: { damaged: { value: badValue, modified: 1 } } };
    cloud.row = { data: data as unknown as LibrarySnapshot, revision: 4 };
    await toggleFavorite('C|major');
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(new RegExp(`unsupported ${part} data`, 'i'));
    expect(cloud.row).toEqual({ data, revision: 4 });
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('does not drop unrecognized cloud fields or versioned-entry metadata', async () => {
    const cloud = new FakeCloud();
    const unknownTopLevel = { ...emptySnapshot(), preferences: { theme: 'light' } };
    cloud.row = { data: unknownTopLevel as unknown as LibrarySnapshot, revision: 2 };
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported library data/i);
    expect(cloud.row).toEqual({ data: unknownTopLevel, revision: 2 });
    const unknownEntry = { ...emptySnapshot(), notes: { 'C|major': { value: 'Keep me', modified: 1, origin: 'future-client' } } };
    cloud.row = { data: unknownEntry as unknown as LibrarySnapshot, revision: 3 };
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported notes data/i);
    expect(cloud.row).toEqual({ data: unknownEntry, revision: 3 });
  });
  it('does not discard malformed cloud progressions while merging other changes', async () => {
    const cloud = new FakeCloud();
    const data = { ...emptySnapshot(), progressions: { damaged: { value: { id: 'damaged', chords: [] }, modified: 1 } } };
    cloud.row = { data: data as unknown as LibrarySnapshot, revision: 4 };
    await toggleFavorite('C|major');
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported progression data/);
    expect(cloud.row).toEqual({ data, revision: 4 });
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('does not overwrite an unrecognized saved pattern in a cloud progression', async () => {
    const cloud = new FakeCloud();
    const damaged = { ...progression, pattern: { mode: 'custom', stepsPerBeat: 2, steps: [{ kind: 'pick', strings: [99] }] } };
    const data = { ...emptySnapshot(), progressions: { [progression.id]: { value: damaged, modified: 1 } } };
    cloud.row = { data: data as unknown as LibrarySnapshot, revision: 7 };
    await toggleFavorite('C|major');
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported progression data/);
    expect(cloud.row).toEqual({ data, revision: 7 });
  });
  it('does not overwrite unknown fields nested inside a cloud progression', async () => {
    const cloud = new FakeCloud();
    const future = { ...progression, chords: [{ ...progression.chords[0], expression: { keep: true } }, progression.chords[1]] };
    const data = { ...emptySnapshot(), progressions: { [progression.id]: { value: future, modified: 1 } } };
    cloud.row = { data: data as unknown as LibrarySnapshot, revision: 9 };
    await toggleFavorite('C|major');
    await expect(syncAsA(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported progression data/i);
    expect(cloud.row).toEqual({ data, revision: 9 });
  });
  it('does not apply data after the session is no longer current', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...emptySnapshot(), favorites: { 'G|major': { value: true, modified: 12 } } }, revision: 1 };
    await syncAsA(cloud as unknown as SupabaseClient, 'user-a', () => false);
    expect(getFavorites()).toEqual([]);
  });
});
