import { expect, test } from './support/test';
import { FakeSupabase, signIn, type FakeSnapshot } from './support/fakeSupabase';
import type { BrowserContext, Page, Route } from '@playwright/test';

const base = 'http://127.0.0.1:54399';
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer, accept, x-supabase-api-version',
  'access-control-expose-headers': 'content-range',
};
const empty: FakeSnapshot = { version: 3, favorites: {}, notes: {}, lessons: {}, progressions: {} };

/** Two fake accounts with separate rows. This is not a live auth or RLS test. */
class TwoAccountService {
  reads = 0;
  rows = new Map<string, { user_id: string; data: FakeSnapshot; revision: number }>();
  async attach(context: BrowserContext) { await context.route(`${base}/**`, (route) => this.handle(route)); }
  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const reply = (status: number, body?: unknown) => route.fulfill({ status, headers, ...(body === undefined ? { body: '' } : { json: body }) });
    if (method === 'OPTIONS') return reply(204);
    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      const email = String(request.postDataJSON().email ?? 'alice@example.test');
      const id = email.startsWith('bob') ? 'bob' : 'alice';
      const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      const payload = Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      return reply(200, { access_token: `test.${payload}.signature`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${id}`, user });
    }
    if (url.pathname === '/auth/v1/logout' && method === 'POST') return reply(204);
    if (url.pathname === '/rest/v1/rpc/email_verification_status') return reply(200, { verified: false, verified_at: null });
    const auth = request.headers().authorization?.split('.')[1];
    let id = '';
    try { id = JSON.parse(Buffer.from(auth ?? '', 'base64url').toString()).sub as string; } catch { /* Anonymous request. */ }
    if (url.pathname === '/rest/v1/user_libraries') {
      const requested = url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? request.postDataJSON()?.user_id;
      if (!id || requested !== id) return reply(403, { message: 'Wrong fake owner' });
      const row = this.rows.get(id);
      if (method === 'GET') { this.reads++; return reply(200, row ? [{ data: row.data, revision: row.revision }] : []); }
      if (method === 'POST') {
        if (row) return reply(409, { code: '23505' });
        this.rows.set(id, request.postDataJSON());
        return reply(201);
      }
      if (method === 'PATCH') {
        const revision = Number(url.searchParams.get('revision')?.replace(/^eq\./, ''));
        if (!row || row.revision !== revision) return reply(200, []);
        const next = { ...row, ...request.postDataJSON() };
        this.rows.set(id, next);
        return reply(200, [{ revision: next.revision }]);
      }
    }
    return reply(500, { message: `Unexpected fake request: ${method} ${url.pathname}` });
  }
}

async function signInAs(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in to sync' }).click();
  await expect(page.getByText('Library synced.')).toBeVisible();
}

test('cooperating guest tabs serialize simultaneous favorites', async ({ context, page }) => {
  const cloud = new FakeSupabase();
  await cloud.attach(context);
  const other = await context.newPage();
  await Promise.all([page.goto('/chords/C/major'), other.goto('/chords/G/major')]);
  await Promise.all([
    page.getByRole('button', { name: /☆ Save/ }).click(),
    other.getByRole('button', { name: /☆ Save/ }).click(),
  ]);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('frethub:favorites') ?? '[]').sort())).toEqual(['C|major', 'G|major']);
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Favorites (2)' })).toBeVisible();
});

test('a stale signed-in tab cannot write another account’s local or fake-cloud library', async ({ context, page }) => {
  const service = new TwoAccountService();
  await service.attach(context);
  // Suppress this tab's auth broadcasts to model a lagging/stale tab. IndexedDB
  // coordination and storage events remain real browser APIs.
  await page.addInitScript(() => {
    class SilentChannel {
      name: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(name: string) { this.name = name; }
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    Object.defineProperty(window, 'BroadcastChannel', { value: SilentChannel });
  });
  await page.goto('/library');
  await signInAs(page, 'alice@example.test');
  await page.goto('/chords/C/major');
  const bob = await context.newPage();
  await bob.goto('/library');
  await bob.getByRole('button', { name: 'Sign out' }).click();
  await expect(bob.getByRole('button', { name: 'Sign in to sync' })).toBeVisible();
  await signInAs(bob, 'bob@example.test');
  await bob.goto('/chords/D/major');
  await bob.getByRole('button', { name: /☆ Save/ }).click();
  await expect(bob.getByRole('button', { name: /★ Saved/ })).toBeVisible();
  await page.getByRole('button', { name: /☆ Save/ }).click();
  await expect(page.getByText(/local library changed in another tab/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frethub:favorites') ?? '[]'))).toEqual(['D|major']);
  await bob.goto('/library');
  await bob.getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() => service.rows.get('bob')?.data.favorites['D|major']?.value).toBe(true);
  expect(service.rows.get('bob')?.data.favorites['C|major']).toBeUndefined();
  expect(service.rows.get('alice')?.data.favorites['D|major']).toBeUndefined();
});

test('internal journal and fence events do not keep two signed-in tabs syncing', async ({ context, page }) => {
  const service = new TwoAccountService();
  await service.attach(context);
  await context.addInitScript(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'visible' }); });
  await page.goto('/library');
  await signInAs(page, 'alice@example.test');
  const other = await context.newPage();
  await other.goto('/library');
  await expect(other.getByText('Library synced.')).toBeVisible();
  // Allow startup notifications to settle, then observe a fixed quiet window.
  await page.waitForTimeout(1200);
  const settledReads = service.reads;
  await page.waitForTimeout(2500);
  expect(service.reads - settledReads).toBeLessThanOrEqual(1);
});

test('a malformed chord in fake-cloud data is isolated without deleting it', async ({ context, page }) => {
  const snapshot: FakeSnapshot = { ...empty, favorites: { 'H|major': { value: true, modified: 2 }, 'C|major': { value: true, modified: 3 } } };
  const cloud = new FakeSupabase(snapshot);
  await cloud.attach(context);
  await signIn(page);
  await expect(page.getByText(/some saved chord records could not be displayed/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Favorites (1)' })).toBeVisible();
  expect(cloud.row?.data.favorites['H|major']).toEqual({ value: true, modified: 2 });
});

test('blocks unsupported local data without changing it or uploading a partial library', async ({ context, page }) => {
  const cloud = new FakeSupabase();
  await cloud.attach(context);
  await page.addInitScript(() => localStorage.setItem('frethub:progressions', JSON.stringify([{ id: 'future', chords: [{ newFormat: true }] }])));
  await page.goto('/chords/C/major');
  await page.getByRole('button', { name: /☆ Save/ }).click();
  await expect(page.getByText(/unsupported or damaged library data/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('frethub:progressions')!))).toEqual([{ id: 'future', chords: [{ newFormat: true }] }]);
  expect(cloud.row).toBeNull();
});

test('preserves an unsupported recovery journal when account switching is attempted', async ({ context, page }) => {
  const cloud = new FakeSupabase();
  await cloud.attach(context);
  const journal = { version: 1, previous: [['frethub:favorites', '["old"]']], future: { keep: true } };
  await page.addInitScript((value) => {
    localStorage.setItem('frethub:favorites', JSON.stringify(['C|major']));
    localStorage.setItem('frethub:library-transaction', JSON.stringify(value));
  }, journal);
  await page.goto('/library');
  await page.getByLabel('Email address').fill('player@example.test');
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in to sync' }).click();
  await expect(page.getByText(/Could not safely switch libraries/i)).toBeVisible();
  const saved = await page.evaluate(() => ({
    journal: JSON.parse(localStorage.getItem('frethub:library-transaction')!),
    favorites: JSON.parse(localStorage.getItem('frethub:favorites')!),
  }));
  expect(saved).toEqual({ journal, favorites: ['C|major'] });
  expect(cloud.row).toBeNull();
});

test('protects progression and note drafts on real browser navigation', async ({ page }) => {
  await page.goto('/fretboard?mode=progression');
  await page.getByRole('button', { name: 'Show chord on neck' }).click();
  await page.getByRole('button', { name: 'Add selected chord' }).click();
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
    page.getByRole('link', { name: 'Library and account' }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Edit chord 1, C' })).toBeVisible();
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.accept()),
    page.getByRole('link', { name: 'Library and account' }).click(),
  ]);
  await expect(page).toHaveURL(/\/library$/);
  await page.goto('/chords/C/major');
  const note = page.getByLabel('Personal notes for this chord');
  await note.fill('Unsaved browser note');
  await Promise.all([
    page.waitForEvent('dialog').then((dialog) => dialog.dismiss()),
    page.getByRole('link', { name: 'Chords', exact: true }).first().click(),
  ]);
  await expect(note).toHaveValue('Unsaved browser note');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Note saved')).toBeVisible();
  await page.getByRole('link', { name: 'Chords', exact: true }).first().click();
  await expect(page).toHaveURL(/\/chords$/);
});

test('protects a progression when the browser Back button is used', async ({ page }) => {
  await page.goto('/chords');
  await page.getByRole('link', { name: 'Fretboard', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Build a progression' }).click();
  await page.getByRole('button', { name: 'Show chord on neck' }).click();
  await page.getByRole('button', { name: 'Add selected chord' }).click();
  await Promise.all([page.waitForEvent('dialog').then((dialog) => dialog.dismiss()), page.goBack()]);
  await expect(page).toHaveURL(/\/fretboard$/);
  await expect(page.getByRole('button', { name: 'Edit chord 1, C' })).toBeVisible();
  await Promise.all([page.waitForEvent('dialog').then((dialog) => dialog.accept()), page.goBack()]);
  await expect(page).toHaveURL(/\/chords$/);
});

test('renders safe fallbacks for percent-encoded malformed routes', async ({ page }) => {
  for (const path of ['/chords/%25/major', '/theory/%25']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: path.startsWith('/chords') ? 'Unknown chord' : 'Lesson not found' })).toBeVisible();
  }
  await page.goto('/chords/C%23/major');
  await expect(page.getByRole('heading', { name: 'C#', exact: true })).toBeVisible();
});
