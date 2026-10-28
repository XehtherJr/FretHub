import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibrarySyncProvider } from './LibrarySync';
import LibraryPage from '@/pages/LibraryPage';
import AccountRecoveryPage from '@/pages/AccountRecoveryPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import { switchLibraryOwner } from '@core/storage';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  syncLibrary: vi.fn(),
}));
vi.mock('@/lib/cloudLibrary', () => ({
  cloudClient: { auth: { signInWithPassword: mocks.signInWithPassword, signInWithOtp: mocks.signInWithOtp, signUp: mocks.signUp, resetPasswordForEmail: mocks.resetPasswordForEmail, updateUser: mocks.updateUser, signOut: mocks.signOut, onAuthStateChange: mocks.onAuthStateChange }, rpc: mocks.rpc },
  syncLibrary: mocks.syncLibrary,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: { verified: false, verified_at: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.syncLibrary.mockResolvedValue({ dirty: false });
  mocks.onAuthStateChange.mockImplementation((listener) => { listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
});

describe('optional account onboarding', () => {
  it('signs in with email and password without blocking guest use', async () => {
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    expect(screen.getByText(/never require an account/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'some-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to sync' }));
    await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'player@example.com', password: 'some-password' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toHaveValue(''));
  });
  it('preserves optional email-link sign-in for existing accounts', async () => {
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Use an email link instead' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: 'player@example.com', options: { emailRedirectTo: expect.stringMatching(/\/library$/) } }));
    expect(await screen.findByText(/open the link in this same browser/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
  it('creates an account without an email-link step and reports errors honestly', async () => {
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(/No email verification is required/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'some-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and sync' }));
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalledWith({ email: 'player@example.com', password: 'some-password' }));
    mocks.signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'some-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and sync' }));
    expect(await screen.findByText(/could not sign in immediately/)).toBeInTheDocument();
  });
  it('requests a password reset without revealing whether the email exists', async () => {
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('player@example.com', { redirectTo: expect.stringMatching(/\/account\/reset$/) }));
    const generic = 'If this address can receive a reset link, check your email and open it in this same browser. Check spam or try again later.';
    expect(await screen.findByText(generic)).toBeInTheDocument();
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 400, message: 'User not found' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(generic)).toBeInTheDocument();
    expect(screen.queryByText('User not found')).not.toBeInTheDocument();
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: { status: 503, message: 'Service unavailable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('Could not connect. Please try again later.')).toBeInTheDocument();
  });
  it('offers optional email verification only after sign-in and requests a link for the current account', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    expect(screen.queryByRole('button', { name: 'Verify email (optional)' })).not.toBeInTheDocument();
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com', email_confirmed_at: '2026-01-01' }, access_token: 'password-token' }));
    expect(await screen.findByText(/Email not verified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify email (optional)' }));
    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledWith({ email: 'player@example.com', options: { shouldCreateUser: false, emailRedirectTo: expect.stringMatching(/\/account\/verify$/) } }));
    expect(await screen.findByText(/Email delivery must be configured/)).toBeInTheDocument();
  });
  it('refreshes verification status when another tab finishes the email link', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' }, access_token: 'password-token' }));
    expect(await screen.findByText(/Email not verified/)).toBeInTheDocument();
    mocks.rpc.mockResolvedValue({ data: { verified: true, verified_at: '2026-10-28T00:00:00Z' }, error: null });
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('Email access verified')).toBeInTheDocument();
  });
  it('returns to sign-in mode after signing out of a newly created account', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
    act(() => authChange?.('SIGNED_OUT', null));
    expect(await screen.findByRole('button', { name: 'Sign in to sync' })).toBeInTheDocument();
  });
  it('reports invalid credentials without pretending the user is signed in', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to sync' }));
    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });
  it('stops a stale tab from syncing another account’s local library', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' } }));
    await waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledTimes(1));
    const isCurrent = mocks.syncLibrary.mock.calls[0][2] as () => boolean;
    expect(isCurrent()).toBe(true);
    act(() => { expect(switchLibraryOwner('user-2')).toBe(true); window.dispatchEvent(new Event('storage')); });
    expect(isCurrent()).toBe(false);
    expect(await screen.findByText(/local library changed in another tab/)).toBeInTheDocument();
    expect(mocks.syncLibrary).toHaveBeenCalledTimes(1);
  });
  it('loads and syncs a signed-in user without losing the guest-first path', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' } }));
    await waitFor(() => expect(screen.getByText('player@example.com')).toBeInTheDocument());
    await waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Function)));
    expect(screen.getByText(/Signing out leaves a copy/)).toBeInTheDocument();
  });
});

describe('account link callbacks', () => {
  it('requires a recovery session, validates matching passwords, and really calls updateUser', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><AccountRecoveryPage /></MemoryRouter></LibrarySyncProvider>);
    expect(screen.getByText(/reset link could not be used/)).toBeInTheDocument();
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' }, access_token: 'password-token' }));
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    act(() => authChange?.('PASSWORD_RECOVERY', { user: { id: 'user-1', email: 'player@example.com' }, access_token: 'recovery-token' }));
    expect(screen.getByText(/Choose a new password for/)).toHaveTextContent('player@example.com');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'does-not-match' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('passwords do not match');
    expect(mocks.updateUser).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-password' }));
    expect(await screen.findByText('Your password has been updated.')).toBeInTheDocument();
  });

  it('can resume a recovered session after a refresh even when the recovery event was missed', () => {
    const payload = btoa(JSON.stringify({ amr: [{ method: 'recovery', timestamp: 100 }] })).replace(/=+$/, '');
    mocks.onAuthStateChange.mockImplementation((listener) => { listener('INITIAL_SESSION', { user: { id: 'user-1', email: 'player@example.com' }, access_token: `header.${payload}.signature` }); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><AccountRecoveryPage /></MemoryRouter></LibrarySyncProvider>);
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('requires the server to accept the email proof; a signed-in password alone is not a verified badge', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'A recent email link is required' } });
    render(<LibrarySyncProvider><MemoryRouter><VerifyEmailPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' }, access_token: 'password-token' }));
    expect(await screen.findByText(/email link could not be confirmed/)).toBeInTheDocument();
    expect(screen.queryByText(/Email access verified/)).not.toBeInTheDocument();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' }, access_token: 'magic-link-token' }));
    expect(await screen.findByText(/Email access verified/)).toHaveTextContent('player@example.com');
    expect(mocks.rpc).toHaveBeenCalledWith('record_email_verification');
  });

  it('ignores a verification response belonging to a previous account', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    let resolveFirst: ((value: unknown) => void) | undefined;
    mocks.rpc.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ data: null, error: { message: 'No email proof' } });
    render(<LibrarySyncProvider><MemoryRouter><VerifyEmailPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'first@example.com' }, access_token: 'first-token' }));
    await waitFor(() => expect(resolveFirst).toBeDefined());
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-2', email: 'second@example.com' }, access_token: 'second-token' }));
    expect(await screen.findByText(/email link could not be confirmed/)).toBeInTheDocument();
    await act(async () => { resolveFirst?.({ data: null, error: null }); });
    expect(screen.queryByText(/Email access verified/)).not.toBeInTheDocument();
  });

  it('reports unavailable verification rather than treating untrusted metadata as proof', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; listener('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'missing function' } });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com', user_metadata: { verified: true } }, access_token: 'password-token' }));
    expect(await screen.findByText(/Email verification is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText('Email access verified')).not.toBeInTheDocument();
  });
});
