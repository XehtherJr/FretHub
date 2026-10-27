import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LibrarySyncProvider } from './LibrarySync';
import LibraryPage from '@/pages/LibraryPage';

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  syncLibrary: vi.fn(),
}));
vi.mock('@/lib/cloudLibrary', () => ({
  cloudClient: { auth: { signInWithOtp: mocks.signInWithOtp, signOut: mocks.signOut, onAuthStateChange: mocks.onAuthStateChange } },
  syncLibrary: mocks.syncLibrary,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.syncLibrary.mockResolvedValue({ dirty: false });
  mocks.onAuthStateChange.mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
});

describe('optional account onboarding', () => {
  it('offers passwordless email without blocking a guest library', async () => {
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    expect(screen.getByText(/never require an account/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    await screen.findByText(/open the link in this same browser/);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'player@example.com', options: expect.objectContaining({ emailRedirectTo: expect.stringMatching(/\/library$/) }) }));
  });
  it('loads and syncs a signed-in user without losing the guest-first path', async () => {
    let authChange: ((event: string, session: unknown) => void) | undefined;
    mocks.onAuthStateChange.mockImplementation((listener) => { authChange = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    render(<LibrarySyncProvider><MemoryRouter><LibraryPage /></MemoryRouter></LibrarySyncProvider>);
    act(() => authChange?.('SIGNED_IN', { user: { id: 'user-1', email: 'player@example.com' } }));
    await waitFor(() => expect(screen.getByText('player@example.com')).toBeInTheDocument());
    await waitFor(() => expect(mocks.syncLibrary).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Function)));
    expect(screen.getByText(/Signing out leaves a copy/)).toBeInTheDocument();
  });
});
