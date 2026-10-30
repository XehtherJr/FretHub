import type { BrowserContext, Page, Route } from '@playwright/test';

/** A deliberately tiny, in-memory Auth/PostgREST double. No requests reach Supabase. */
export const FAKE_SUPABASE_URL = 'http://127.0.0.1:54399';
const userId = 'browser-test-user';
const email = 'player@example.test';
const user = { id: userId, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, prefer, accept, x-supabase-api-version',
  'access-control-expose-headers': 'content-range',
};

type Versioned = { value: unknown; modified: number };
export interface FakeSnapshot {
  version: number;
  favorites: Record<string, Versioned>;
  notes: Record<string, Versioned>;
  lessons: Record<string, Versioned>;
  progressions: Record<string, Versioned>;
}
export interface FakeRow { user_id: string; data: FakeSnapshot; revision: number; updated_at?: string }

export class FakeSupabase {
  row: FakeRow | null;
  offline = false;
  conflicts = 0;
  private barrier: { count: number; wait: Promise<void>; release: () => void } | null = null;

  constructor(data?: FakeSnapshot) {
    this.row = data ? { user_id: userId, data: structuredClone(data), revision: 1 } : null;
  }

  /** Force two writes to race after reading the same revision. */
  raceNextUpdates() {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    this.barrier = { count: 0, wait, release };
  }

  async attach(context: BrowserContext) {
    await context.route(`${FAKE_SUPABASE_URL}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const reply = (status: number, body?: unknown) => route.fulfill({
      status, headers, ...(body === undefined ? { body: '' } : { json: body }),
    });
    if (method === 'OPTIONS') return reply(204);
    if (this.offline) return route.abort('internetdisconnected');
    if (url.pathname === '/auth/v1/token' && method === 'POST') {
      const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      return reply(200, { access_token: `test.${payload}.signature`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh', user });
    }
    if (url.pathname === '/auth/v1/user' && method === 'GET') return reply(200, user);
    if (url.pathname === '/auth/v1/logout' && method === 'POST') return reply(204);
    if (url.pathname === '/rest/v1/rpc/email_verification_status' && method === 'POST') return reply(200, { verified: false, verified_at: null });
    if (url.pathname === '/rest/v1/user_libraries' && method === 'GET') {
      return reply(200, this.row ? [{ data: this.row.data, revision: this.row.revision }] : []);
    }
    if (url.pathname === '/rest/v1/user_libraries' && method === 'POST') {
      if (this.row) return reply(409, { code: '23505', message: 'duplicate key' });
      this.row = request.postDataJSON() as FakeRow;
      return reply(201);
    }
    if (url.pathname === '/rest/v1/user_libraries' && method === 'PATCH') {
      const barrier = this.barrier;
      if (barrier) {
        barrier.count++;
        if (barrier.count === 2) { this.barrier = null; barrier.release(); }
        await barrier.wait;
      }
      const expected = Number(url.searchParams.get('revision')?.replace(/^eq\./, ''));
      if (!this.row || this.row.revision !== expected) {
        this.conflicts++;
        return reply(200, []);
      }
      this.row = { ...this.row, ...request.postDataJSON() as Pick<FakeRow, 'data' | 'revision' | 'updated_at'> };
      return reply(200, [{ revision: this.row.revision }]);
    }
    return reply(500, { message: `Unexpected test request: ${method} ${url.pathname}` });
  }
}

export async function signIn(page: Page) {
  await page.goto('/library');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Sign in to sync' }).click();
  await page.getByText('Signed in as', { exact: false }).waitFor();
  await page.getByText('Library synced.').waitFor();
}
