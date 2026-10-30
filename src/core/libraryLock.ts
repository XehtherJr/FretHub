/**
 * Serialize local library read/modify/write operations across cooperative tabs.
 * IndexedDB provides the cross-tab mutex; a localStorage fence ensures the
 * next tab has observed the preceding tab's writes before using its cache.
 * If either facility is unavailable, fail closed.
 */
const DATABASE = 'frethub-library-coordination';
const STORE = 'mutex';
export const LIBRARY_FENCE_KEY = 'frethub:library-coordination-v1';
const RETRIES = 100;
const RETRY_MS = 20;
// In-flight retries must not be stranded if a test replaces its clock.
const scheduleRetry = globalThis.setTimeout.bind(globalThis);
let database: Promise<IDBDatabase> | undefined;
const pendingLocks = new Set<Promise<unknown>>();

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Cross-tab library coordination is unavailable.')); return; }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onerror = () => reject(request.error ?? new Error('Could not open library coordination.'));
      request.onblocked = () => reject(new Error('Library coordination is blocked by another tab.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); database = undefined; };
        resolve(request.result);
      };
    }).catch((error: unknown) => { database = undefined; throw error; });
  }
  return database;
}

/** Fixed-size nonce: coordination only, not a credential. */
function newFence(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Attempt<T> = { done: true; value: T } | { done: false };

function attempt<T>(db: IDBDatabase, operation: () => T): Promise<Attempt<T>> {
  return new Promise<Attempt<T>>((resolve, reject) => {
    let result: Attempt<T> = { done: false };
    let callbackError: unknown;
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE, 'readwrite'); }
    catch (error) { database = undefined; reject(error); return; }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(callbackError ?? transaction.error ?? new Error('Library coordination was interrupted.'));
    transaction.onerror = () => { /* The abort handler reports the error. */ };
    const store = transaction.objectStore(STORE);
    const request = store.get('library');
    request.onsuccess = () => {
      try {
        const stored: unknown = request.result;
        const observed = localStorage.getItem(LIBRARY_FENCE_KEY);
        if (stored === undefined) {
          // Upgrade the old, empty mutex store without touching library data.
          // An orphaned fence may mean an interrupted transaction; do not guess.
          if (observed !== null) throw new Error('Library coordination needs recovery.');
          const initial = newFence();
          localStorage.setItem(LIBRARY_FENCE_KEY, initial);
          store.put(initial, 'library');
          return;
        }
        if (typeof stored !== 'string' || !/^[0-9a-f]{32}$/.test(stored)) throw new Error('Unsupported library coordination data.');
        // IndexedDB may commit before another renderer has received all of its
        // ordered localStorage events. Retry rather than reading a stale cache.
        if (observed !== stored) return;
        // Publish an in-progress fence before touching library keys. If the
        // final fence or IDB commit fails, the mismatch makes future work stop.
        localStorage.setItem(LIBRARY_FENCE_KEY, newFence());
        const value = operation();
        const finished = newFence();
        localStorage.setItem(LIBRARY_FENCE_KEY, finished);
        store.put(finished, 'library');
        result = { done: true, value };
      } catch (error) { callbackError = error; transaction.abort(); }
    };
  });
}

async function runWithLibraryLock<T>(operation: () => T): Promise<T> {
  const db = await openDatabase();
  for (let retry = 0; retry < RETRIES; retry++) {
    const result = await attempt(db, operation);
    if (result.done) return result.value;
    await new Promise<void>((resolve) => scheduleRetry(resolve, RETRY_MS));
  }
  throw new Error('Library coordination could not be synchronized. Preserve local data and refresh all tabs before trying again.');
}

/** The callback must be synchronous: awaiting it would release the IDB transaction. */
export function withLibraryLock<T>(operation: () => T): Promise<T> {
  const task = runWithLibraryLock(operation);
  pendingLocks.add(task);
  void task.then(() => pendingLocks.delete(task), () => pendingLocks.delete(task));
  return task;
}

/** Test isolation: finish fire-and-forget startup work before replacing the fake database. */
export async function settleLibraryLocksForTests(): Promise<void> {
  while (pendingLocks.size) await Promise.allSettled([...pendingLocks]);
}

/** Test isolation: each simulated browser/device gets its own IndexedDB factory. */
export function resetLibraryLockForTests(): void {
  if (database) void database.then((db) => db.close()).catch(() => {});
  database = undefined;
}
