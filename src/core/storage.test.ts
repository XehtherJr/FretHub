import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLibrarySnapshot, deleteProgression, emptySnapshot, getCompletedLessons, getFavorites, getLibrarySnapshot, getNotes, getProgressions, markLessonComplete, mergeLibrarySnapshots, normalizeSnapshot, saveNote, saveProgression, switchLibraryOwner, toggleFavorite, type LibrarySnapshot } from './storage';
import type { SavedProgression } from './userProgressions';
import { syncLibrary } from '@/lib/cloudLibrary';

beforeEach(() => localStorage.clear());

const progression: SavedProgression = {
  id: 'song-1', name: 'First song', tuningId: 'standard', capo: 0, bpm: 90, loop: true,
  difficulty: 'novice', difficultyMode: 'manual', chords: [
    { id: 'step-1', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 },
    { id: 'step-2', name: 'G', frets: [3, 2, 0, 0, 0, 3], beats: 2 },
  ],
};

describe('local-first library', () => {
  it('migrates guest favorites and notes without an account', () => {
    localStorage.setItem('frethub:favorites', JSON.stringify(['C|major']));
    localStorage.setItem('frethub:notes', JSON.stringify({ 'C|major': 'Practice this shape' }));
    const snapshot = getLibrarySnapshot();
    expect(snapshot.favorites['C|major'].value).toBe(true);
    expect(snapshot.notes['C|major'].value).toBe('Practice this shape');
  });
  it('merges independent edits and retains removals as tombstones', () => {
    toggleFavorite('C|major');
    saveNote('C|major', 'A note');
    markLessonComplete('triads');
    const old = getLibrarySnapshot();
    toggleFavorite('C|major');
    saveNote('C|major', '');
    toggleFavorite('G|major');
    const merged = mergeLibrarySnapshots(old, getLibrarySnapshot());
    applyLibrarySnapshot(merged);
    expect(getFavorites()).toEqual(['G|major']);
    expect(getNotes()).toEqual({});
    expect(getCompletedLessons()).toContain('triads');
    expect(merged.favorites['C|major'].value).toBe(false);
  });
  it('keeps progressions and deletion tombstones across merges', () => {
    expect(saveProgression(progression)).toBe(true);
    const saved = getLibrarySnapshot();
    expect(getProgressions()).toEqual([progression]);
    expect(deleteProgression(progression.id)).toBe(true);
    const merged = mergeLibrarySnapshots(saved, getLibrarySnapshot());
    expect(merged.progressions[progression.id].value).toBeNull();
    applyLibrarySnapshot(merged);
    expect(getProgressions()).toEqual([]);
  });
  it('keeps separate local libraries for different signed-in users', () => {
    toggleFavorite('C|major');
    expect(switchLibraryOwner('alice')).toBe(true); // The first account adopts the guest library.
    expect(saveProgression(progression)).toBe(true);
    expect(switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual([]);
    expect(getProgressions()).toEqual([]);
    toggleFavorite('G|major');
    expect(switchLibraryOwner('alice')).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions()).toEqual([progression]);
    expect(switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual(['G|major']);
  });
  it('refuses an account switch if the previous local library cannot be backed up', () => {
    toggleFavorite('C|major');
    expect(switchLibraryOwner('alice')).toBe(true);
    const original = Storage.prototype.setItem;
    const mocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes('account-library:')) throw new Error('quota');
      return original.call(this, key, value);
    });
    expect(switchLibraryOwner('bob')).toBe(false);
    expect(getFavorites()).toEqual(['C|major']);
    mocked.mockRestore();
  });
  it('rolls back an account switch if writing the new owner fails midway', () => {
    toggleFavorite('C|major');
    expect(saveProgression({ ...progression, id: 'alice-song' })).toBe(true);
    expect(switchLibraryOwner('alice')).toBe(true);
    const original = Storage.prototype.setItem;
    let failed = false;
    const mocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'frethub:library-owner' && !failed) { failed = true; throw new Error('quota'); }
      return original.call(this, key, value);
    });
    expect(switchLibraryOwner('bob')).toBe(false);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions().map((entry) => entry.id)).toEqual(['alice-song']);
    mocked.mockRestore();
    expect(switchLibraryOwner('bob')).toBe(true);
    expect(getFavorites()).toEqual([]);
    expect(switchLibraryOwner('alice')).toBe(true);
    expect(getFavorites()).toEqual(['C|major']);
    expect(getProgressions().map((entry) => entry.id)).toEqual(['alice-song']);
  });
  it('migrates old snapshots and rejects malformed progression data', () => {
    const old = normalizeSnapshot({ version: 1, favorites: { 'C|major': { value: true, modified: 5 } } });
    expect(old.version).toBe(2);
    expect(old.favorites['C|major'].value).toBe(true);
    expect(old.progressions).toEqual({});
    const malformed = normalizeSnapshot({ ...old, progressions: { bad: { value: { ...progression, id: 'bad', capo: 40 }, modified: 10 } } });
    expect(malformed.progressions).toEqual({});
  });
  it('ignores malformed remote entries', () => {
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

describe('cloud sync', () => {
  it('saves and restores a guest library on another device', async () => {
    const cloud = new FakeCloud();
    toggleFavorite('C|major');
    saveNote('C|major', 'My fingering');
    markLessonComplete('triads');
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    localStorage.clear();
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(getFavorites()).toEqual(['C|major']);
    expect(getNotes()['C|major']).toBe('My fingering');
    expect(getCompletedLessons()).toContain('triads');
  });
  it('syncs edited progressions and deletion tombstones between devices', async () => {
    const cloud = new FakeCloud();
    expect(saveProgression(progression)).toBe(true);
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    localStorage.clear();
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([progression]);
    const edited = { ...progression, name: 'Reordered', chords: [...progression.chords].reverse() };
    expect(saveProgression(edited)).toBe(true);
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    localStorage.clear();
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([edited]);
    deleteProgression(edited.id);
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    localStorage.clear();
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(getProgressions()).toEqual([]);
    expect(cloud.row?.data.progressions[edited.id].value).toBeNull();
  });
  it('does not rewrite identical progressions when JSONB reorders their object keys', async () => {
    const cloud = new FakeCloud();
    expect(saveProgression(progression)).toBe(true);
    const snapshot = getLibrarySnapshot();
    const entry = snapshot.progressions[progression.id];
    const { name, ...rest } = progression;
    const reordered = { name, ...rest }; // Equivalent values, different property order.
    cloud.row = { data: { ...snapshot, progressions: { [progression.id]: { value: reordered, modified: entry.modified } } }, revision: 7 };
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
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
        expect(saveProgression(edited)).toBe(true);
        return result;
      } };
    } };
    expect(saveProgression(progression)).toBe(true);
    expect(await syncLibrary(delayed as unknown as SupabaseClient, 'user-a')).toEqual({ dirty: true });
    expect(getProgressions()).toEqual([edited]);
    expect(cloud.row?.data.progressions[progression.id].value).toEqual(progression);
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.progressions[progression.id].value).toEqual(edited);
  });
  it('upgrades a version-one cloud snapshot instead of allowing an old client to erase progressions', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { version: 1, favorites: { 'C|major': { value: true, modified: 2 } }, notes: {}, lessons: {} } as unknown as LibrarySnapshot, revision: 1 };
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(cloud.row?.data.version).toBe(2);
    expect(cloud.row?.revision).toBe(2);
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('merges and restores the separate triad application challenge using the existing lesson snapshot', async () => {
    const cloud = new FakeCloud();
    markLessonComplete('triad-transfer-v1');
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    localStorage.clear();
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(getCompletedLessons()).toContain('triad-transfer-v1');
    expect(getLibrarySnapshot().lessons['triad-transfer-v1'].value).toBe(true);
  });
  it('retries a concurrent update and preserves both devices’ changes', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: emptySnapshot(), revision: 1 };
    cloud.conflictOnce = true;
    toggleFavorite('C|major');
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'D|major']));
    expect(cloud.row?.revision).toBe(3);
  });
  it('does not overwrite an unsupported newer cloud format', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...emptySnapshot(), version: 3 } as unknown as LibrarySnapshot, revision: 1 };
    toggleFavorite('C|major');
    await expect(syncLibrary(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported format/);
    expect(cloud.row.revision).toBe(1);
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('does not discard malformed cloud progressions while merging other changes', async () => {
    const cloud = new FakeCloud();
    const data = { ...emptySnapshot(), progressions: { damaged: { value: { id: 'damaged', chords: [] }, modified: 1 } } };
    cloud.row = { data: data as unknown as LibrarySnapshot, revision: 4 };
    toggleFavorite('C|major');
    await expect(syncLibrary(cloud as unknown as SupabaseClient, 'user-a')).rejects.toThrow(/unsupported progression data/);
    expect(cloud.row).toEqual({ data, revision: 4 });
    expect(getFavorites()).toEqual(['C|major']);
  });
  it('does not apply data after the session is no longer current', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...emptySnapshot(), favorites: { 'G|major': { value: true, modified: 12 } } }, revision: 1 };
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a', () => false);
    expect(getFavorites()).toEqual([]);
  });
});
