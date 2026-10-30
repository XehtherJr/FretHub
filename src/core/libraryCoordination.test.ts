import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFavorites, toggleFavorite } from './storage';
import { LIBRARY_FENCE_KEY, withLibraryLock } from './libraryLock';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('fails closed if cross-tab coordination is unavailable, then permits saving once it is restored', async () => {
  localStorage.setItem('frethub:favorites', JSON.stringify(['C|major']));
  const indexedDb = indexedDB;
  vi.stubGlobal('indexedDB', undefined);
  expect(await toggleFavorite('G|major')).toBeNull();
  expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual(['C|major']);
  vi.stubGlobal('indexedDB', indexedDb);
  expect(await toggleFavorite('G|major')).toBe(true);
  expect(new Set(getFavorites())).toEqual(new Set(['C|major', 'G|major']));
});


it('waits for a stale localStorage fence before reading or writing library data', async () => {
  await withLibraryLock(() => true);
  const realGet = Storage.prototype.getItem;
  let staleReads = 0;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (key === LIBRARY_FENCE_KEY && staleReads++ < 2) return 'stale-renderer-cache';
    return realGet.call(this, key);
  });
  const operation = vi.fn(() => 'done');
  expect(await withLibraryLock(operation)).toBe('done');
  expect(staleReads).toBeGreaterThanOrEqual(3);
  expect(operation).toHaveBeenCalledOnce();
});

it('fails closed if a coordination fence exists without its corresponding database state', async () => {
  localStorage.setItem(LIBRARY_FENCE_KEY, 'orphaned-fence');
  localStorage.setItem('frethub:favorites', JSON.stringify(['C|major']));
  expect(await toggleFavorite('G|major')).toBeNull();
  expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual(['C|major']);
  expect(localStorage.getItem(LIBRARY_FENCE_KEY)).toBe('orphaned-fence');
});


it('leaves a mismatched fence and blocks subsequent writes if the final fence cannot be stored', async () => {
  await withLibraryLock(() => true);
  const committed = localStorage.getItem(LIBRARY_FENCE_KEY);
  const realSet = Storage.prototype.setItem;
  let fenceWrites = 0;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (key === LIBRARY_FENCE_KEY && ++fenceWrites === 2) throw new Error('storage failed');
    return realSet.call(this, key, value);
  });
  await expect(withLibraryLock(() => localStorage.setItem('frethub:example', 'partially written'))).rejects.toThrow('storage failed');
  expect(localStorage.getItem(LIBRARY_FENCE_KEY)).not.toBe(committed);
  spy.mockRestore();
  expect(await toggleFavorite('C|major')).toBeNull();
  expect(localStorage.getItem('frethub:favorites')).toBeNull();
}, 6000);
