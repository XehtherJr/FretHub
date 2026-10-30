import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { getFavorites, getNote, getProgressions, resetLibraryTabForTests, saveNote, saveProgression, setLibraryAuthenticationPending, switchLibraryOwner, toggleFavorite } from '@core/storage';

vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(), playSequence: vi.fn(), strum: vi.fn(), playClick: vi.fn(),
}));
vi.mock('@core/progressionAudio', () => ({ startProgressionPlayback: vi.fn(() => ({ stop: vi.fn() })) }));
beforeEach(() => { localStorage.clear(); resetLibraryTabForTests(); });

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

async function makeProgression() {
  const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
  for (const name of [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 1, note C4/, /E4 string open/]) fireEvent.click(within(board).getByRole('button', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
}

describe('draft ownership', () => {
  it('does not save an unsaved chord note from the previous account into the new one', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    renderAt('/chords/C/major');
    fireEvent.change(screen.getByLabelText('Personal notes for this chord'), { target: { value: 'Alice draft' } });
    await act(async () => { expect(await switchLibraryOwner('bob')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect((await screen.findAllByText(/account changed.*draft/i)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Personal notes for this chord')).toHaveValue('Alice draft');
    expect(getNote('C|major')).toBe('');
    await act(async () => { expect(await switchLibraryOwner('alice')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(getNote('C|major')).toBe('Alice draft'));
  });

  it('does not save a progression draft from the previous account into the new one', async () => {
    expect(await switchLibraryOwner('alice')).toBe(true);
    renderAt('/fretboard?mode=progression');
    await makeProgression();
    await act(async () => { expect(await switchLibraryOwner('bob')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    expect(await screen.findByText(/account changed.*draft/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit chord 1, C' })).toBeInTheDocument();
    expect(getProgressions()).toEqual([]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Cancel' }));
    await act(async () => { expect(await switchLibraryOwner('alice')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    await waitFor(() => expect(getProgressions()).toHaveLength(1));
  });

  it('allows the first account to adopt an unsaved guest draft', async () => {
    renderAt('/fretboard?mode=progression');
    await makeProgression();
    await act(async () => { expect(await switchLibraryOwner('alice')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    await waitFor(() => expect(getProgressions()).toHaveLength(1));
  });
  it('allows the first account to adopt an unsaved guest note', async () => {
    renderAt('/chords/C/major');
    fireEvent.change(screen.getByLabelText('Personal notes for this chord'), { target: { value: 'Guest note' } });
    await act(async () => { expect(await switchLibraryOwner('alice')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(getNote('C|major')).toBe('Guest note'));
  });

  it('keeps a loaded progression tied to its original account even before further edits', async () => {
    await switchLibraryOwner('alice');
    renderAt('/fretboard?mode=progression');
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    await waitFor(() => expect(getProgressions()).toHaveLength(1));
    await act(async () => { expect(await switchLibraryOwner('bob')).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    expect(await screen.findByText(/account changed.*draft/i)).toBeInTheDocument();
    expect(getProgressions()).toEqual([]);
  });

  it('does not reassign a note draft after the player retypes the original account’s saved text', async () => {
    await switchLibraryOwner('alice');
    expect(await saveNote('C|major', 'Alice original')).toBe(true);
    renderAt('/chords/C/major');
    const field = screen.getByLabelText('Personal notes for this chord');
    fireEvent.change(field, { target: { value: 'Alice draft' } });
    await act(async () => { expect(await switchLibraryOwner('bob')).toBe(true); });
    fireEvent.change(field, { target: { value: 'Alice original' } });
    fireEvent.change(field, { target: { value: 'Alice original again' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect((await screen.findAllByText(/account changed.*draft/i)).length).toBeGreaterThan(0);
    expect(getNote('C|major')).toBe('');
  });

  it('does not save a stale displayed note during the account-change render', async () => {
    await switchLibraryOwner('alice');
    expect(await saveNote('C|major', 'Alice saved note')).toBe(true);
    renderAt('/chords/C/major');
    expect(screen.getByLabelText('Personal notes for this chord')).toHaveValue('Alice saved note');
    await act(async () => {
      expect(await switchLibraryOwner('bob')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    });
    expect(getNote('C|major')).toBe('');
  });

  it('does not delete another account’s progression from a stale saved list', async () => {
    const item = { id: 'shared', name: 'Alice progression', tuningId: 'standard', capo: 0, bpm: 90, loop: false,
      difficulty: 'beginner' as const, difficultyMode: 'manual' as const,
      chords: [{ id: 'c', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 }] };
    await switchLibraryOwner('alice');
    expect(await saveProgression(item)).toBe(true);
    await switchLibraryOwner('bob');
    expect(await saveProgression({ ...item, name: 'Bob progression' })).toBe(true);
    await switchLibraryOwner('alice');
    renderAt('/fretboard?mode=progression');
    expect(screen.getByRole('button', { name: 'Delete Alice progression' })).toBeInTheDocument();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      expect(await switchLibraryOwner('bob')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Delete Alice progression' }));
    });
    confirm.mockRestore();
    expect(getProgressions().map((entry) => entry.name)).toEqual(['Bob progression']);
  });

  it('does not toggle a favorite in a new account using the previous account’s rendered button', async () => {
    await switchLibraryOwner('alice');
    expect(await toggleFavorite('C|major')).toBe(true);
    renderAt('/chords/C/major');
    expect(screen.getByRole('button', { name: '★ Saved' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      expect(await switchLibraryOwner('bob')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: '★ Saved' }));
    });
    expect(getFavorites()).toEqual([]);
  });

  it('does not load the previous account’s stale saved progression into the new account', async () => {
    const item = { id: 'shared', name: 'Alice progression', tuningId: 'standard', capo: 0, bpm: 90, loop: false,
      difficulty: 'beginner' as const, difficultyMode: 'manual' as const,
      chords: [{ id: 'c', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 }] };
    await switchLibraryOwner('alice');
    expect(await saveProgression(item)).toBe(true);
    await switchLibraryOwner('bob');
    expect(await saveProgression({ ...item, name: 'Bob progression' })).toBe(true);
    await switchLibraryOwner('alice');
    renderAt('/fretboard?mode=progression');
    await act(async () => {
      expect(await switchLibraryOwner('bob')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Load Alice progression' }));
    });
    expect(screen.getByText(/account changed.*saved progression list/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit chord 1, C' })).not.toBeInTheDocument();
    expect(getProgressions().map((entry) => entry.name)).toEqual(['Bob progression']);
  });

  it('does not guess an owner for a note started while authentication is pending', async () => {
    setLibraryAuthenticationPending(true);
    renderAt('/chords/C/major');
    fireEvent.change(screen.getByLabelText('Personal notes for this chord'), { target: { value: 'Unassigned note' } });
    act(() => setLibraryAuthenticationPending(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect((await screen.findAllByText(/cannot be safely assigned/i)).length).toBeGreaterThan(0);
    expect(getNote('C|major')).toBe('');
    expect(screen.getByLabelText('Personal notes for this chord')).toHaveValue('Unassigned note');
  });

  it('does not guess an owner for a progression started while authentication is pending', async () => {
    setLibraryAuthenticationPending(true);
    renderAt('/fretboard?mode=progression');
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add selected chord' }));
    act(() => setLibraryAuthenticationPending(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    expect(await screen.findByText(/cannot be safely assigned/i)).toBeInTheDocument();
    expect(getProgressions()).toEqual([]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /^Edit chord 1, C/ })).toBeInTheDocument();
  });

  it('keeps the bound favorite action available while another tab has a temporary write journal', async () => {
    renderAt('/chords/C/major');
    act(() => {
      localStorage.setItem('frethub:library-transaction', JSON.stringify({ version: 1, previous: [] }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'frethub:library-transaction' }));
    });
    localStorage.removeItem('frethub:library-transaction');
    fireEvent.click(screen.getByRole('button', { name: '☆ Save' }));
    await waitFor(() => expect(getFavorites()).toEqual(['C|major']));
  });

});
