import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyLibrarySnapshot, emptySnapshot, getCompletedLessons, getFavorites, getLibrarySnapshot, getNotes, markLessonComplete, mergeLibrarySnapshots, normalizeSnapshot, saveNote, toggleFavorite, type LibrarySnapshot } from './storage';
import { syncLibrary } from '@/lib/cloudLibrary';

beforeEach(() => localStorage.clear());

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
  it('retries a concurrent update and preserves both devices’ changes', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: emptySnapshot(), revision: 1 };
    cloud.conflictOnce = true;
    toggleFavorite('C|major');
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a');
    expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'D|major']));
    expect(cloud.row?.revision).toBe(3);
  });
  it('does not apply data after the session is no longer current', async () => {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...emptySnapshot(), favorites: { 'G|major': { value: true, modified: 12 } } }, revision: 1 };
    await syncLibrary(cloud as unknown as SupabaseClient, 'user-a', () => false);
    expect(getFavorites()).toEqual([]);
  });
});
