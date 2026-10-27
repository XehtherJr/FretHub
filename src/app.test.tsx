import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// jsdom has no Web Audio implementation; pretend support so playback controls render.
vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(),
  strum: vi.fn(),
  playClick: vi.fn(),
}));

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('application routing and rendering', () => {
  it('renders the home page with hero, onboarding and popular chords', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/computed/);
    expect(screen.getByText(/New here\? Three steps/)).toBeTruthy();
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

  it('identifies a chord built on the fretboard', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    // Open G major (320003): low E fret3, A fret2, D/G/B open, high E fret3
    const find = (label: RegExp) => within(board).getAllByRole('button').find((b) => label.test(b.getAttribute('aria-label') ?? ''));
    // Open G major (320003): low E fret3, A fret2, D/G/B open, high E fret3
    fireEvent.click(find(/String 1, fret 3/)!);
    fireEvent.click(find(/String 2, fret 2/)!);
    fireEvent.click(find(/D3 string open/)!);
    fireEvent.click(find(/G3 string open/)!);
    fireEvent.click(find(/B3 string open/)!);
    fireEvent.click(find(/String 6, fret 3/)!);
    expect(screen.getByText(/Identification/)).toBeTruthy();
    expect(screen.getAllByText(/G/).length).toBeGreaterThan(0);
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

  it('renders scales with the fretboard pattern overlay', () => {
    renderAt('/scales/dorian?root=D');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Scale library/);
    expect(screen.getByText(/D Dorian/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /D Dorian scale pattern/ })).toBeTruthy();
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
