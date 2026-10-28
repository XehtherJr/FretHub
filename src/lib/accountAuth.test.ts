import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accountCallbackUrl, hasAuthMethod, readEmailVerification, recordEmailVerification } from './accountAuth';

function token(payload: unknown): string {
  return `header.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
}

describe('account callbacks', () => {
  it('builds same-origin callback URLs, including the app base path', () => {
    expect(accountCallbackUrl('account/reset')).toBe(`${window.location.origin}/account/reset`);
    expect(accountCallbackUrl('/account/verify')).toBe(`${window.location.origin}/account/verify`);
  });
  it('treats the recovery claim only as a UI hint and rejects malformed payloads', () => {
    expect(hasAuthMethod(token({ amr: [{ method: 'recovery', timestamp: 123 }] }), 'recovery')).toBe(true);
    expect(hasAuthMethod(token({ amr: [{ method: 'password' }] }), 'recovery')).toBe(false);
    expect(hasAuthMethod(token({ amr: 'recovery' }), 'recovery')).toBe(false);
    expect(hasAuthMethod('not-a-jwt', 'recovery')).toBe(false);
    expect(hasAuthMethod(undefined, 'recovery')).toBe(false);
  });
  it('only displays verification state returned by the server and rejects malformed status', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { verified: false, verified_at: null }, error: null })
      .mockResolvedValueOnce({ data: { verified: true, verified_at: '2026-10-28T00:00:00Z' }, error: null })
      .mockResolvedValueOnce({ data: { verified: true }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await readEmailVerification(client)).toEqual({ verified: false, verifiedAt: null });
    expect(await readEmailVerification(client)).toEqual({ verified: true, verifiedAt: '2026-10-28T00:00:00Z' });
    await expect(readEmailVerification(client)).rejects.toThrow('status is unavailable');
    expect(rpc).toHaveBeenCalledWith('email_verification_status');
  });
  it('never interprets a rejected proof as verification', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'A recent email link is required' } });
    await expect(recordEmailVerification({ rpc } as unknown as SupabaseClient)).rejects.toThrow('could not be confirmed');
    expect(rpc).toHaveBeenCalledWith('record_email_verification');
  });
});
