import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { resetLibraryLockForTests, settleLibraryLocksForTests } from '@core/libraryLock';
import { afterEach, beforeEach } from 'vitest';
import { resetLibraryTabForTests } from '@core/storage';

beforeEach(() => { resetLibraryLockForTests(); Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), writable: true, configurable: true }); resetLibraryTabForTests(); });
import { cleanup } from '@testing-library/react';

afterEach(async () => {
  cleanup();
  await settleLibraryLocksForTests();
});

// jsdom does not implement layout/navigation APIs the app calls on route change.
window.scrollTo = () => {};
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
