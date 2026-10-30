import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import App from '@/App';
import { getNote } from '@core/storage';

vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(), playSequence: vi.fn(), strum: vi.fn(), playClick: vi.fn(),
}));
vi.mock('@core/progressionAudio', () => ({ startProgressionPlayback: vi.fn(() => ({ stop: vi.fn() })) }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

function renderAt(entries: string[]) {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: entries, initialIndex: entries.length - 1 });
  render(<RouterProvider router={router} />);
  return router;
}

describe('unsaved drafts', () => {
  it('protects a progression from link and history navigation without discarding it on cancel', async () => {
    const router = renderAt(['/chords', '/fretboard?mode=progression']);
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const name of [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 1, note C4/, /E4 string open/]) {
      fireEvent.click(within(board).getByRole('button', { name }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('link', { name: 'Library and account' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Discard unsaved changes to this progression?'));
    expect(screen.getByRole('button', { name: 'Edit chord 1, C' })).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await act(async () => { await router.navigate(-1); });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe('/fretboard');
    confirm.mockReturnValue(true);
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(router.state.location.pathname).toBe('/chords'));
  });

  it('protects note edits when changing chords and stops prompting once they are saved', async () => {
    const router = renderAt(['/chords/C/major']);
    const note = screen.getByRole('textbox', { name: 'Personal notes for this chord' });
    fireEvent.change(note, { target: { value: 'My fingering' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () => { await router.navigate('/chords/G/major'); });
    expect(confirm).toHaveBeenCalledWith('Discard your unsaved chord note?');
    expect(note).toHaveValue('My fingering');
    expect(router.state.location.pathname).toBe('/chords/C/major');
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(getNote('C|major')).toBe('My fingering'));
    await waitFor(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
    confirm.mockClear();
    await act(async () => { await router.navigate('/chords/G/major'); });
    expect(confirm).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/chords/G/major');
  });
});
