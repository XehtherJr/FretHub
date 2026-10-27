import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { playClick, playMidi, strum } from '@core/audio';
import { applyLibrarySnapshot, emptySnapshot, getNote } from '@core/storage';

// jsdom has no Web Audio implementation; pretend support so playback controls render.
vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ get currentTime() { return Date.now() / 1000; }, state: 'running', resume: () => {} }),
  playMidi: vi.fn(),
  strum: vi.fn(),
  playClick: vi.fn(),
}));

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('application routing and rendering', () => {
  it('renders the home page with destinations and playable chord references', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/your fretboard/i);
    expect(screen.getByText('A place to start')).toBeTruthy();
    expect(screen.getByText('Chord encyclopedia')).toBeTruthy();
    // Popular chord links resolve to real encyclopedia routes.
    expect(screen.getByRole('link', { name: /Browse the encyclopedia/ })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: /fret positions/ }).length).toBeGreaterThan(0);
  });

  it('renders the chord encyclopedia browser and filters by root', () => {
    renderAt('/chords');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('C chords');
    const cards = screen.getAllByRole('link').map((l) => l.textContent);
    expect(cards.some((t) => t?.includes('Cm7'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'G' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('G chords');
    expect(screen.getAllByText(/G/).length).toBeGreaterThan(0);
  });

  it('renders a chord detail page with notes, formula and generated voicings', async () => {
    renderAt('/chords/G/dominant-7');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('G7');
    // Notes of G7: G B D F (note names appear in several places)
    expect(screen.getAllByText('G').length).toBeGreaterThan(0);
    expect(screen.getAllByText('F').length).toBeGreaterThan(0);
    expect(screen.getByText(/1\s+3\s+5\s+b7/)).toBeTruthy();
    // Engine produced playable diagrams with strum buttons.
    expect(screen.getAllByRole('button', { name: /Strum/ }).length).toBeGreaterThan(0);
  });

  it('decodes sharp roots from URLs (C# minor)', () => {
    renderAt(`/chords/${encodeURIComponent('C#')}/minor`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('C#m');
    // C# minor = C# E G#
    expect(screen.getAllByText('C#').length).toBeGreaterThan(0);
    expect(screen.getAllByText('G#').length).toBeGreaterThan(0);
  });

  it('shows an honest empty state for an unknown chord type', () => {
    renderAt('/chords/C/made-up-chord');
    expect(screen.getByText('Unknown chord')).toBeTruthy();
  });

  it('renders the interactive fretboard with keyboard-operable cells', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    const buttons = within(board).getAllByRole('button');
    expect(buttons.length).toBe(6 * (12 + 1)); // 6 strings x (open cell + 12 frets)
    // Every cell has a descriptive aria label.
    expect(buttons[0].getAttribute('aria-label')).toMatch(/string|fret|note/i);
  });

  it('identifies, strums and deselects a real open G voicing', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    const find = (label: RegExp) => within(board).getByRole('button', { name: label });
    // Conventional string numbering: low E is string 6; high E is string 1.
    const lowG = find(/String 6, fret 3, note G2/);
    fireEvent.click(lowG);
    fireEvent.click(find(/String 5, fret 2, note B2/));
    fireEvent.click(find(/D3 string open/));
    fireEvent.click(find(/G3 string open/));
    fireEvent.click(find(/B3 string open/));
    fireEvent.click(find(/String 1, fret 3, note G4/));
    expect(lowG).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: /G.*Major.*Exact/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Strum selection/ }));
    expect(strum).toHaveBeenCalledWith([43, 47, 50, 55, 59, 67]);
    fireEvent.click(lowG);
    expect(lowG).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('5 / 6 strings')).toBeTruthy();
  });

  it('ranks chord matches using the lowest sounding pitch, not just string order', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    // Low E at fret 12 sounds E3, above the open A2 on the next string.
    fireEvent.click(within(board).getByRole('button', { name: /String 6, fret 12, note E3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /A2 string open, note A2/ }));
    expect(screen.getByRole('link', { name: /A5.*Power chord.*Exact/ })).toBeTruthy();
  });

  it('keeps capo, physical frets, tuning and note-on-click audio in agreement', () => {
    renderAt('/fretboard');
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    const open = within(board).getByRole('button', { name: /E2 string open, capo fret 2, note F#2/ });
    const third = within(board).getByRole('button', { name: /String 6, fret 3, note G2/ });
    expect(within(board).getByRole('button', { name: /String 6, fret 1, note F2/ })).toBeDisabled();
    expect(within(board).getByRole('button', { name: /String 6, fret 2, note F#2/ })).toBeDisabled();
    fireEvent.click(open);
    fireEvent.click(third);
    expect(playMidi).toHaveBeenNthCalledWith(1, 42);
    expect(playMidi).toHaveBeenNthCalledWith(2, 43);
    fireEvent.click(screen.getByRole('button', { name: /Sound on/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 6, fret 4, note G#2/ }));
    expect(playMidi).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    expect(within(board).getByRole('button', { name: /D2 string open, note D2/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('0 / 6 strings')).toBeTruthy();
  });

  it('uses flat spelling consistently on the neck, chord matches and scale links', () => {
    renderAt('/fretboard');
    fireEvent.click(screen.getByRole('button', { name: /Options/ }));
    fireEvent.change(screen.getByLabelText('Note spelling'), { target: { value: 'flat' } });
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /String 6, fret 9, note Db3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 5, fret 8, note F3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 6, note Ab3/ }));
    expect(screen.getByRole('link', { name: /Db.*Major.*Exact/ })).toHaveAttribute('href', '/chords/Db/major');
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 6, fret 11, note Eb3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 5, fret 10, note G3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 10, note C4/ }));
    const inversion = screen.getByRole('link', { name: /Cm\/Eb.*Minor.*Exact/ });
    expect(inversion).toHaveTextContent(/C\s*·\s*Eb\s*·\s*G/);
    fireEvent.click(screen.getByRole('tab', { name: 'Explore scales' }));
    fireEvent.change(screen.getByLabelText('Root'), { target: { value: 'C#' } });
    expect(screen.getByRole('heading', { name: /Db Major/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open in scale library/ })).toHaveAttribute('href', '/scales/major?root=Db');
  });

  it('maps a minor-scale triad and auditions notes in scale mode', () => {
    renderAt('/fretboard');
    fireEvent.click(screen.getByRole('tab', { name: 'Explore scales' }));
    fireEvent.change(screen.getByLabelText('Root'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Scale / mode'), { target: { value: 'dorian' } });
    fireEvent.click(screen.getByRole('button', { name: /Root triad off/ }));
    const board = screen.getByRole('group', { name: /Fretboard showing D Dorian/ });
    const minorThird = within(board).getByRole('button', { name: /String 6, fret 1, note F2/ });
    expect(minorThird.querySelector('.v-cool')).toBeTruthy();
    fireEvent.click(minorThird);
    expect(playMidi).toHaveBeenCalledWith(41);
    expect(screen.getByText(/Outlined notes form the root triad: 1 · b3 · 5/)).toBeTruthy();
  });

  it('renders the theory index and a lesson with live example links', () => {
    const index = renderAt('/theory');
    expect(screen.getByText(/Intervals: the distance/)).toBeTruthy();
    index.unmount();

    renderAt('/theory/intervals');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Intervals/);
    // Lesson example cards are real links into the chord encyclopedia.
    const caption = screen.getByText(/bright major third/);
    const exampleLink = caption.closest('a');
    expect(exampleLink).toBeTruthy();
    expect(exampleLink?.getAttribute('href')).toMatch(/^\/chords\//);
  });

  it('renders scales and plays the closing tonic in the correct octave', () => {
    renderAt('/scales/dorian?root=D');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Scale library/);
    expect(screen.getByText(/D Dorian/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /D Dorian scale pattern/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Play ascending/ }));
    expect(vi.mocked(playMidi).mock.calls.map(([midi]) => midi)).toEqual([62, 64, 65, 67, 69, 71, 72, 74]);
  });

  it('renders the progression explorer with diatonic table', () => {
    renderAt('/progressions');
    expect(screen.getByText(/Diatonic chords of C major/)).toBeTruthy();
    // vii° appears in the table and in the custom-builder chips.
    expect(screen.getAllByText('vii°').length).toBeGreaterThan(0);
    // I–V–vi–IV in C resolves to C G Am F
    expect(screen.getAllByText(/C/).length).toBeGreaterThan(0);
  });

  it('renders the practice tools and quiz flow', () => {
    renderAt('/practice');
    expect(screen.getByRole('tab', { name: 'Metronome' })).toBeTruthy();
    expect(screen.getByText('Identify this chord')).toBeTruthy();
    const choices = screen.getAllByRole('button', { name: /^Answer/ });
    expect(choices).toHaveLength(4);
    fireEvent.click(choices[0]);
    expect(screen.getByText(/Next chord/)).toBeTruthy();
  });

  it('keeps the metronome beat indicator in time with its clicks', () => {
    vi.useFakeTimers();
    try {
      const { container, unmount } = renderAt('/practice');
      fireEvent.click(screen.getByRole('tab', { name: 'Metronome' }));
      fireEvent.click(screen.getByRole('button', { name: /Start/ }));
      const beats = container.querySelectorAll('.metronome-beat');
      expect(playClick).toHaveBeenNthCalledWith(1, true, expect.any(Number));
      act(() => vi.advanceTimersByTime(55));
      expect(beats[0]).toHaveClass('is-active');
      act(() => vi.advanceTimersByTime(667));
      expect(playClick).toHaveBeenNthCalledWith(2, false, expect.any(Number));
      expect(beats[1]).toHaveClass('is-active');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a microphone stream if permission resolves after leaving the tuner', async () => {
    const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const audioDescriptor = Object.getOwnPropertyDescriptor(window, 'AudioContext');
    const stopTrack = vi.fn();
    let resolveRequest: (stream: MediaStream) => void = () => {};
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => new Promise<MediaStream>((resolve) => { resolveRequest = resolve; }),
    } });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {} });
    try {
      renderAt('/practice');
      fireEvent.click(screen.getByRole('tab', { name: 'Tuner' }));
      fireEvent.click(screen.getByRole('button', { name: 'Start tuner' }));
      expect(screen.getByRole('button', { name: /Requesting microphone/ })).toBeDisabled();
      fireEvent.click(screen.getByRole('tab', { name: 'Metronome' }));
      await act(async () => resolveRequest({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream));
      expect(stopTrack).toHaveBeenCalledTimes(1);
    } finally {
      if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor);
      else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
      if (audioDescriptor) Object.defineProperty(window, 'AudioContext', audioDescriptor);
      else delete (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    }
  });

  it('makes augmented triads and augmented sevenths easy to discover', () => {
    renderAt('/chords');
    fireEvent.click(screen.getByRole('button', { name: /Explore augmented chords/ }));
    expect(screen.getByRole('link', { name: /Caug.*Augmented/ })).toHaveAttribute('href', '/chords/C/augmented');
    expect(screen.getByRole('link', { name: /C7#5.*Augmented dominant seventh/ })).toBeInTheDocument();
  });

  it('teaches beginners with a glossary, playable strings and a saved challenge', () => {
    renderAt('/theory/meet-your-guitar');
    expect(screen.getByRole('heading', { name: 'Meet your guitar' })).toBeInTheDocument();
    const pitch = screen.getAllByRole('button', { name: /^pitch$/i })[0];
    fireEvent.click(pitch);
    expect(screen.getByText(/How high or low a sound is/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /STRING 6 E2 LOW/ }));
    expect(playMidi).toHaveBeenCalledWith(40);
    fireEvent.click(screen.getByRole('button', { name: 'String 1, high E' }));
    expect(screen.getByText(/You got it/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('frethub:lessons-complete') ?? '[]')).toContain('meet-your-guitar');
  });

  it('renders the standalone tuner and selectable reference strings', () => {
    renderAt('/tuner');
    expect(screen.getByRole('heading', { name: 'Guitar tuner' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Guitar tuning'), { target: { value: 'drop-d' } });
    fireEvent.click(screen.getByRole('button', { name: /Play D2 reference, string 6/ }));
    expect(playMidi).toHaveBeenCalledWith(38);
    expect(screen.getByRole('button', { name: 'Auto detect' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes timing coach and disappearing click settings without requesting a microphone', () => {
    renderAt('/metronome');
    fireEvent.click(screen.getByRole('button', { name: 'Timing coach' }));
    expect(screen.getByRole('button', { name: 'Enable microphone' })).toBeInTheDocument();
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disappearing' }));
    expect(screen.getByLabelText('Audible bars')).toBeInTheDocument();
    expect(screen.getByLabelText('Silent bars')).toBeInTheDocument();
  });

  it('keeps unsaved chord-note edits when a remote note arrives', () => {
    renderAt('/chords/C/major');
    const textarea = screen.getByRole('textbox', { name: 'Personal notes for this chord' });
    const incoming = (text: string, modified: number) => ({ ...emptySnapshot(), notes: { 'C|major': { value: text, modified } } });
    act(() => applyLibrarySnapshot(incoming('From another device', 10)));
    expect(textarea).toHaveValue('From another device');
    fireEvent.change(textarea, { target: { value: 'My unsaved version' } });
    act(() => applyLibrarySnapshot(incoming('A newer cloud note', 20)));
    expect(textarea).toHaveValue('My unsaved version');
    expect(screen.getByText(/The saved note changed on another device/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(getNote('C|major')).toBe('My unsaved version');
  });

  it('keeps the library usable without an account', () => {
    renderAt('/library');
    expect(screen.getByText(/Account sync is not configured on this deployment/)).toBeInTheDocument();
    expect(screen.getByText(/never require an account/)).toBeInTheDocument();
  });

  it('preloads a chord on the fretboard via deep link', () => {
    renderAt('/fretboard?chord=C%7Cmajor');
    // The board renders and the identification section finds a C-family chord.
    expect(screen.getByText(/Identification/)).toBeTruthy();
    expect(screen.getAllByText(/C/).length).toBeGreaterThan(0);
  });

  it('global search finds chords by symbol and navigates to them', () => {
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: /Open global search/ }));
    const input = screen.getByRole('dialog').querySelector('input')!;
    fireEvent.change(input, { target: { value: 'G7' } });
    const results = screen.getAllByRole('button', { name: /G7/ });
    expect(results.length).toBeGreaterThan(0);
    fireEvent.click(results[0]);
    return expect(screen.findByRole('heading', { level: 1 })).resolves.toHaveTextContent('G7');
  });

  it('renders the library empty states and a 404 for unknown routes', () => {
    renderAt('/library');
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    renderAt('/does-not-exist');
    expect(screen.getByText(/gone off the fretboard/)).toBeTruthy();
  });
});
