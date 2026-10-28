import type { SupabaseClient } from '@supabase/supabase-js';

/** Redirects must also be allowed in the Supabase project's Auth settings. */
export function accountCallbackUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`, window.location.origin).toString();
}

/** A UI hint only. Supabase, not this decoded payload, authorizes account changes. */
export function hasAuthMethod(accessToken: string | undefined, method: string): boolean {
  try {
    const part = accessToken?.split('.')[1];
    if (!part) return false;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (!payload || typeof payload !== 'object' || !('amr' in payload)) return false;
    const amr = (payload as { amr?: unknown }).amr;
    return Array.isArray(amr) && amr.some((entry: unknown) => !!entry && typeof entry === 'object'
      && (entry as { method?: unknown }).method === method);
  } catch { return false; }
}

export interface EmailVerification {
  verified: boolean;
  verifiedAt: string | null;
}

/** Status comes from a server function which compares proof to the current Auth email. */
export async function readEmailVerification(client: SupabaseClient): Promise<EmailVerification> {
  const { data, error } = await client.rpc('email_verification_status');
  if (error || !data || typeof data.verified !== 'boolean'
    || (data.verified && typeof data.verified_at !== 'string')) {
    throw new Error('Email verification status is unavailable.');
  }
  return { verified: data.verified, verifiedAt: data.verified ? data.verified_at : null };
}

/** Only the server may record proof, after checking the signed JWT's recent email-link AMR. */
export async function recordEmailVerification(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('record_email_verification');
  if (error) throw new Error('The email link could not be confirmed.');
}
