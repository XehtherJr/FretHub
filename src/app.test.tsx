import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { playClick, playMidi, playSequence, strum } from '@core/audio';
import { applyLibrarySnapshot, emptySnapshot, getNote } from '@core/storage';

// jsdom has no Web Audio implementation; pretend support so playback controls render.
vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ get currentTime() { return Date.now() / 1000; }, state: 'running', resume: () => {} }),
  playMidi: vi.fn(),
  playSequence: vi.fn(),
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
afterEach(() => vi.useRealTimers());

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

  it('makes account access visible and scrolls to it from the header, including on the library page', () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      renderAt('/library');
      const signIn = screen.getByRole('link', { name: /^Sign in$/ });
      expect(signIn).toHaveAttribute('href', '/library#account');
      fireEvent.click(signIn);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      expect(screen.getByLabelText('Optional account and sync')).toHaveAttribute('id', 'account');
    } finally { HTMLElement.prototype.scrollIntoView = original; }
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

  it('shows the complete Am9 x02413 on the default unfiltered chord page', () => {
    renderAt('/chords/A/minor-9');
    expect(screen.getByRole('img', { name: 'Am9, fret positions low to high: x 0 2 4 1 3' })).toBeInTheDocument();
  });

  it('shows the complete low-position Am9 and can reveal more generated shapes', () => {
    renderAt('/chords/A/minor-9?bass=A');
    expect(screen.getByRole('img', { name: 'Am9, fret positions low to high: x 0 2 4 1 3' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sort voicings')).toHaveDisplayValue('Lowest fret position first');
    const before = screen.getAllByRole('img', { name: /^Am9, fret positions/ }).length;
    fireEvent.click(screen.getByRole('button', { name: 'Show more voicings' }));
    expect(screen.getAllByRole('img', { name: /^Am9, fret positions/ }).length).toBeGreaterThan(before);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer voicings' }));
    expect(screen.getAllByRole('img', { name: /^Am9, fret positions/ })).toHaveLength(before);
  });

  it('navigates past the old 500-shape cap and filters the fretted position and muted strings', () => {
    renderAt('/chords/A/minor-9');
    const page = screen.getByLabelText('Go to page');
    expect(Number(page.getAttribute('max'))).toBeGreaterThan(32);
    const first = screen.getAllByRole('img', { name: /fret positions low to high/ })[0].getAttribute('aria-label');
    fireEvent.change(page, { target: { value: '33' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByText(/Showing 513–528 of/)).toBeInTheDocument();
    expect(screen.getByText(/Page 33 of/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /fret positions low to high/ })[0]).not.toHaveAttribute('aria-label', first);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText(/Page 34 of/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText(/Page 33 of/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Lowest fretted position'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Maximum muted strings'), { target: { value: '1' } });
    const diagrams = screen.getAllByRole('img', { name: /fret positions low to high/ });
    expect(diagrams.length).toBeGreaterThan(0);
    for (const diagram of diagrams) {
      const tokens = diagram.getAttribute('aria-label')!.split(': ')[1].split(' ');
      expect(tokens.filter((token) => token === 'x').length).toBeLessThanOrEqual(1);
      expect(tokens.every((token) => token === 'x' || Number(token) === 0 || Number(token) >= 7)).toBe(true);
    }
    expect(screen.getByText(/Showing 1–/)).toBeInTheDocument();
  });

  it('offers precise high-fret windows without exceeding the physical neck after a capo', () => {
    renderAt('/chords/G/major');
    fireEvent.change(screen.getByLabelText('Fret window'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Lowest fretted position'), { target: { value: '22' } });
    const charts = screen.getAllByRole('img', { name: /^G(?:\/\w+)?, fret positions low to high:/ });
    const frets = charts.flatMap((chart) => (chart.getAttribute('aria-label') ?? '').split(': ')[1].split(' '))
      .filter((fret) => fret !== 'x').map(Number);
    expect(frets.some((fret) => fret >= 22)).toBe(true);
    expect(frets.every((fret) => fret === 0 || (fret >= 22 && fret <= 24))).toBe(true);
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '7' } });
    expect(screen.getByLabelText('Fret window')).toHaveValue('17');
    expect(screen.getByLabelText('Lowest fretted position')).toHaveValue('0');
    expect(screen.getByRole('option', { name: 'Up to fret 18' })).toBeDisabled();
    expect(screen.getByText(/highest fret choice stops at physical fret 24/i)).toBeInTheDocument();
  }, 15000);

  it('warns when a broad eight-string search is incomplete and clears the warning when narrowed', () => {
    renderAt('/chords/C/dominant-alt?tuning=8-string-standard');
    fireEvent.change(screen.getByLabelText('Fret window'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Max stretch'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Maximum muted strings'), { target: { value: '6' } });
    expect(screen.getByText(/The search reached its safety limit and is incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/Showing 1–16 of at least/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lowest fretted position'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Fret window'), { target: { value: '9' } });
    expect(screen.queryByText(/The search reached its safety limit and is incomplete/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /fret positions low to high/ }).length).toBeGreaterThan(0);
  }, 15000);

  it('shows the chosen 7alt alterations as alternatives rather than treating the others as missing', () => {
    const { container } = renderAt('/chords/C/dominant-alt?bass=C');
    expect(screen.getByText(/These are alternatives, not a requirement to play every alteration together/)).toBeInTheDocument();
    const mapping: Record<string, number> = { b9: 1, '#9': 3, b5: 6, '#5': 8 };
    const tuning = [40, 45, 50, 55, 59, 64];
    const items = [...container.querySelectorAll('.voicing-item')];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const frets = item.querySelector('[role="img"]')!.getAttribute('aria-label')!.split(': ')[1].split(' ');
      const pcs = new Set(frets.flatMap((fret, index) => fret === 'x' ? [] : [(tuning[index] + Number(fret)) % 12]));
      const expected = Object.entries(mapping).filter(([, pc]) => pcs.has(pc)).map(([interval]) => interval);
      const alteration = item.querySelector('[title^="Altered tones present:"]');
      expect(expected.length).toBeGreaterThan(0);
      expect(alteration?.textContent).toBe(`with ${expected.join(',')}`);
      expect(item.querySelector('[title^="Omits "]')).toBeNull();
    }
  });

  it('labels each generated inversion by its actual, interval-spelled bass', () => {
    renderAt('/chords/C/minor');
    const bass = screen.getByLabelText('Bass note');
    expect(bass).toHaveDisplayValue('Any bass');
    expect(screen.getByText('Bass: varies')).toBeInTheDocument();
    expect(screen.getByText(/Finger numbers and playability labels are estimates/)).toBeInTheDocument();
    fireEvent.change(bass, { target: { value: '3' } });
    expect(screen.getByText('Bass: Eb')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cm');
    expect(bass).toHaveDisplayValue('Eb (b3) — Cm/Eb');
    const diagrams = screen.getAllByRole('img', { name: /^Cm\/Eb, fret positions/ });
    expect(diagrams.length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /^Cm\/D#/ })).not.toBeInTheDocument();
    fireEvent.change(bass, { target: { value: '0' } });
    expect(bass).toHaveDisplayValue('Root position (C)');
    expect(screen.getAllByRole('img', { name: /^Cm, fret positions/ }).length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole('button', { name: /Arpeggiate selection/ }));
    expect(playSequence).toHaveBeenCalledWith([43, 47, 50, 55, 59, 67], 0.35, 1.4);
    fireEvent.click(lowG);
    expect(lowG).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('5 / 6 strings')).toBeTruthy();
  });

  it('arpeggiates selected strings in string order with alternate tuning and capo', () => {
    renderAt('/fretboard');
    const arpeggiate = screen.getByRole('button', { name: /Arpeggiate selection/ });
    expect(arpeggiate).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 3, note F3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /D2 string open, capo fret 2, note E2/ }));
    fireEvent.click(arpeggiate);
    expect(playSequence).toHaveBeenCalledWith([40, 53], 0.35, 1.4);
    fireEvent.change(screen.getByLabelText('Arpeggio speed'), { target: { value: 'slow' } });
    fireEvent.click(arpeggiate);
    expect(playSequence).toHaveBeenLastCalledWith([40, 53], 0.6, 1.4);
    fireEvent.change(screen.getByLabelText('Arpeggio speed'), { target: { value: 'fast' } });
    fireEvent.click(arpeggiate);
    expect(playSequence).toHaveBeenLastCalledWith([40, 53], 0.16, 1.4);
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    expect(arpeggiate).toBeDisabled();
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
    expect(screen.getByRole('link', { name: /Db.*Major.*Exact/ })).toHaveAttribute('href', '/chords/Db/major?bass=Db');
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

  it('retains a root-position bass rather than opening an unrestricted reference', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /String 5, fret 3, note C3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 2, note E3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /G3 string open/ }));
    const match = screen.getByRole('link', { name: /^C Major.*Exact/ });
    expect(match).toHaveAttribute('href', '/chords/C/major?bass=C');
    fireEvent.click(match);
    expect(screen.getByLabelText('Bass note')).toHaveDisplayValue('Root position (C)');
    expect(screen.getByText('Bass: C')).toBeInTheDocument();
  });

  it('keeps interval-correct chord names even when the workbench prefers sharps', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /String 6, fret 11, note D#3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 5, fret 10, note G3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 10, note C4/ }));
    const inversion = screen.getByRole('link', { name: /Cm\/Eb.*Minor.*Exact/ });
    expect(inversion).toHaveTextContent(/C\s*·\s*Eb\s*·\s*G/);
    expect(inversion).toHaveAttribute('title', expect.stringContaining('Bass note Eb'));
    expect(inversion).toHaveAttribute('href', '/chords/C/minor?bass=Eb');
    fireEvent.click(inversion);
    expect(screen.getByLabelText('Bass note')).toHaveDisplayValue('Eb (b3) — Cm/Eb');
    expect(screen.getByText(/Showing Cm\/Eb voicings with Eb in the bass/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Cm\/Eb, fret positions/ }).length).toBeGreaterThan(0);
  });

  it('identifies suspended ninths and explains omitted notes in the actual guitar selection', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [/String 5, fret 3, note C3/, /String 4, fret 3, note F3/, /String 3, fret 3, note A#3/, /String 2, fret 3, note D4/, /String 1, fret 3, note G4/]) {
      fireEvent.click(within(board).getByRole('button', { name: label }));
    }
    expect(screen.getByRole('link', { name: /C9sus4.*Dominant ninth suspended fourth.*Exact/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /A#6\/9\/B#.*Also spelled Bb6\/9\/C.*Exact/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Gm7\/C.*non-chord bass.*Slash bass/ })).toHaveAttribute('href', '/chords/G/minor-7?bass=C');
    expect(screen.queryByRole('link', { name: /Cso-what/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 5, fret 3, note C3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 2, note E3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 3, fret 3, note A#3/ }));
    expect(screen.getByRole('link', { name: /C7.*Not played: G \(5\).*Partial/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /C7alt/ })).not.toBeInTheDocument();
  });

  it('offers rootless names only when a root is explicitly chosen', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [/String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 3, note D4/, /String 1, fret 6, note A#4/]) {
      fireEvent.click(within(board).getByRole('button', { name: label }));
    }
    expect(screen.queryByRole('link', { name: /C9\/E/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Root hint (optional)'), { target: { value: '0' } });
    const rootless = screen.getByRole('link', { name: /C9\/E.*Root C assumed, not played.*Partial/ });
    expect(rootless).toHaveAttribute('href', '/chords/C/dominant-9?bass=E');
    fireEvent.change(screen.getByLabelText('Root hint (optional)'), { target: { value: '' } });
    expect(screen.queryByRole('link', { name: /C9\/E/ })).not.toBeInTheDocument();
  });

  it('offers a third-and-seventh shell when its absent root is explicitly chosen', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 2, note E3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 3, fret 3, note A#3/ }));
    expect(screen.queryByRole('link', { name: /C7\/E/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Root hint (optional)'), { target: { value: '0' } });
    expect(screen.getByRole('link', { name: /C7\/E.*Root C assumed, not played.*Not played: G \(5\).*Partial/ })).toBeInTheDocument();
  });

  it('uses note register as well as pitch classes for the So What voicing', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [/String 5, fret 5, note D3/, /String 4, fret 5, note G3/, /String 3, fret 5, note C4/, /String 2, fret 6, note F4/, /String 1, fret 5, note A4/]) {
      fireEvent.click(within(board).getByRole('button', { name: label }));
    }
    expect(screen.getByRole('link', { name: /Dso-what.*So What chord.*Exact/ })).toBeInTheDocument();
    fireEvent.click(within(board).getByRole('button', { name: /String 4, fret 3, note F3/ }));
    fireEvent.click(within(board).getByRole('button', { name: /G3 string open/ }));
    fireEvent.click(within(board).getByRole('button', { name: /String 2, fret 1, note C4/ }));
    expect(screen.queryByRole('link', { name: /Dso-what/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dm11.*Not played: E \(9\).*Partial/ })).toBeInTheDocument();
  });

  it('retains a non-chord slash bass when opening the chord reference and returning to the fretboard', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [/String 6, fret 8, note C3/, /String 5, fret 5, note D3/, /String 4, fret 4, note F#3/, /String 3, fret 2, note A3/]) {
      fireEvent.click(within(board).getByRole('button', { name: label }));
    }
    const slash = screen.getByRole('link', { name: /D\/C.*non-chord bass.*Slash bass/ });
    expect(slash).toHaveAttribute('href', '/chords/D/major?bass=C');
    fireEvent.click(slash);
    expect(screen.getByLabelText('Bass note')).toHaveDisplayValue('C (non-chord bass) — D/C');
    expect(screen.getByText('Bass: C')).toBeInTheDocument();
    expect(screen.getByText(/Showing D\/C voicings with C in the bass \(a non-chord bass, not an inversion\)/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^D\/C, fret positions/ }).length).toBeGreaterThan(0);
    const open = screen.getByRole('link', { name: 'Open on fretboard' });
    expect(open).toHaveAttribute('href', '/fretboard?chord=D%7Cmajor&bass=C');
    fireEvent.click(open);
    expect(screen.getByRole('link', { name: /D\/C.*non-chord bass.*Slash bass/ })).toBeInTheDocument();
  });

  it('keeps alternate tuning, capo and bass across the chord-reference round trip', () => {
    renderAt('/fretboard');
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [
      /D2 string open, capo fret 2, note E2/,
      /A2 string open, capo fret 2, note B2/,
      /G3 string open, capo fret 2, note A3/,
      /B3 string open, capo fret 2, note C#4/,
      /E4 string open, capo fret 2, note F#4/,
    ]) fireEvent.click(within(board).getByRole('button', { name: label }));
    const match = screen.getByRole('link', { name: /A6\/9\/E.*Exact/ });
    expect(match).toHaveAttribute('href', '/chords/A/six-nine?bass=E&tuning=drop-d&capo=2');
    fireEvent.click(match);
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo')).toHaveValue('2');
    expect(screen.getByText('Bass: E')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('href', '/chords/A/major?tuning=drop-d&capo=2');
    const back = screen.getByRole('link', { name: 'Open on fretboard' });
    expect(back).toHaveAttribute('href', '/fretboard?chord=A%7Csix-nine&bass=E&tuning=drop-d&capo=2');
    fireEvent.click(back);
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo')).toHaveValue('2');
    expect(screen.getByRole('link', { name: /A6\/9\/E.*Exact/ })).toBeInTheDocument();
  });

  it('validates shared instrument settings and supports the full capo range', () => {
    const view = renderAt('/chords/C/major?tuning=not-a-tuning&capo=99');
    expect(screen.getByLabelText('Tuning')).toHaveValue('standard');
    expect(screen.getByLabelText('Capo')).toHaveValue('0');
    view.unmount();
    renderAt('/chords/C/major?tuning=drop-d&capo=7');
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo')).toHaveValue('7');
    fireEvent.change(screen.getByLabelText('Fret window'), { target: { value: '17' } });
    expect(screen.getByLabelText('Fret window')).toHaveValue('17');
    expect(screen.getByRole('option', { name: 'Up to fret 18' })).toBeDisabled();
    expect(screen.getByText(/highest fret choice stops at physical fret 24/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Open on fretboard' }));
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo')).toHaveValue('7');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    expect(within(board).getAllByRole('button', { pressed: true }).length).toBeGreaterThan(0);
  });

  it('explains when a requested reference voicing cannot be generated', () => {
    renderAt('/fretboard?chord=D%7Cso-what&bass=C');
    expect(screen.getByText(/No reference voicing was found within the current model and settings/)).toBeInTheDocument();
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /E2 string open, note E2/ }));
    expect(screen.queryByText(/No reference voicing was found within the current model and settings/)).not.toBeInTheDocument();
  });

  it('shows a direct-link reference warning in progression mode and clears it when notes change', () => {
    renderAt('/fretboard?mode=progression&chord=D%7Cso-what&bass=C');
    expect(screen.getByRole('tab', { name: 'Build a progression' })).toHaveAttribute('aria-selected', 'true');
    const message = screen.getByText(/No reference voicing was found within the current model and settings/);
    expect(message).toBeVisible();
    expect(message).toHaveAttribute('role', 'status');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /E2 string open, note E2/ }));
    expect(screen.queryByText(/No reference voicing was found within the current model and settings/)).not.toBeInTheDocument();
  });

  it('explains an altered-chord family without labeling unchosen alterations as omissions', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const name of [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /String 3, fret 3, note A#3/, /String 2, fret 2, note C#4/]) {
      fireEvent.click(within(board).getByRole('button', { name }));
    }
    const showAll = screen.queryByRole('button', { name: /Show all \d+ matches/ });
    if (showAll) fireEvent.click(showAll);
    const family = screen.getByRole('link', { name: /C7alt/ });
    expect(family).toHaveTextContent('Family match');
    expect(family).toHaveTextContent('Played alterations: Db (b9)');
    expect(family).not.toHaveTextContent('Not played:');
    expect(family).toHaveAttribute('title', expect.stringContaining('alternatives, not required together'));
  });

  it('opens an extended chord on the fretboard without dropping its defining alteration', () => {
    renderAt('/fretboard?chord=C%7Cdominant-alt');
    const selection = screen.getByRole('heading', { name: 'Selection' }).closest('section')!;
    const names = [...selection.querySelectorAll('.note-chip')].map((chip) => chip.textContent);
    for (const required of ['C', 'E', 'A#']) expect(names).toContain(required);
    expect(names.some((name) => ['C#', 'D#', 'F#', 'G#'].includes(name ?? ''))).toBe(true);
    expect(screen.getByRole('link', { name: /C7alt.*Family match/ })).toBeInTheDocument();
  });

  it('distinguishes octave doublings from different chord tones', () => {
    renderAt('/fretboard');
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    fireEvent.click(within(board).getByRole('button', { name: /E2 string open, note E2/ }));
    fireEvent.click(within(board).getByRole('button', { name: /E4 string open, note E4/ }));
    expect(screen.getByText('One note, possibly in different octaves')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /E5.*Exact/ })).not.toBeInTheDocument();
    fireEvent.click(within(board).getByRole('button', { name: /B3 string open, note B3/ }));
    expect(screen.getByRole('link', { name: /E5.*Power chord.*Exact/ })).toBeInTheDocument();
  });

  it('identifies sounding notes and omissions above a capo', () => {
    renderAt('/fretboard');
    fireEvent.change(screen.getByLabelText('Capo'), { target: { value: '2' } });
    const board = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    for (const label of [/E2 string open, capo fret 2, note F#2/, /A2 string open, capo fret 2, note B2/, /D3 string open, capo fret 2, note E3/, /G3 string open, capo fret 2, note A3/, /B3 string open, capo fret 2, note C#4/]) {
      fireEvent.click(within(board).getByRole('button', { name: label }));
    }
    expect(screen.getByRole('link', { name: /F#m11.*Not played: G# \(9\).*Partial/ })).toBeInTheDocument();
  });

  it('preserves a chosen flat spelling for a non-chord slash bass', () => {
    renderAt('/chords/C/major?bass=Db');
    expect(screen.getByLabelText('Bass note')).toHaveDisplayValue('Db (non-chord bass) — C/Db');
    expect(screen.getByText(/Showing C\/Db voicings with Db in the bass/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open on fretboard' })).toHaveAttribute('href', '/fretboard?chord=C%7Cmajor&bass=Db');
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
    expect(playSequence).toHaveBeenCalledWith([62, 64, 65, 67, 69, 71, 72, 74], 0.32, 0.7);
  });

  it('shows the actual scale spelling on F# major neck markers', () => {
    renderAt('/scales/major?root=F%23');
    const board = screen.getByRole('img', { name: 'F# Major (Ionian) scale pattern across 12 frets' });
    expect([...board.querySelectorAll('.fb-note')].some((marker) => marker.textContent === 'E#')).toBe(true);
    expect(screen.getByLabelText('Notes in F# Major (Ionian)')).toHaveTextContent('E#');
  });

  it('renders the progression explorer with diatonic table', () => {
    renderAt('/progressions');
    expect(screen.getByText(/Diatonic chords of C major/)).toBeTruthy();
    // vii° appears in the table and in the custom-builder chips.
    expect(screen.getAllByText('vii°').length).toBeGreaterThan(0);
    // I–V–vi–IV in C resolves to C G Am F
    expect(screen.getAllByText(/C/).length).toBeGreaterThan(0);
  });

  it('uses written scale degrees consistently for progression chords and links', () => {
    renderAt('/progressions');
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'F#' } });
    const table = screen.getByRole('table');
    const seventhDegree = within(table).getAllByRole('row')[7];
    expect(within(seventhDegree).getByRole('link', { name: 'E#dim' })).toHaveAttribute('href', '/chords/E%23/diminished');
    expect(within(seventhDegree).getByRole('link', { name: /E#m/ })).toHaveAttribute('href', '/chords/E%23/half-diminished');
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

  it('uses meter-specific click units, group accents and disappearing bars', () => {
    vi.useFakeTimers();
    renderAt('/metronome');
    fireEvent.change(screen.getByLabelText('Time signature'), { target: { value: '6/8' } });
    expect(screen.getByRole('group', { name: '6/8, 6 eighth-note clicks per bar' })).toBeInTheDocument();
    expect(screen.getByText(/grouped 3\+3 \(two dotted-quarter beats\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start metronome' }));
    act(() => { vi.advanceTimersByTime(2100); });
    expect(vi.mocked(playClick).mock.calls.slice(0, 4).map(([accent]) => accent)).toEqual([true, false, false, 'group']);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.change(screen.getByLabelText('Time signature'), { target: { value: '7/8' } });
    fireEvent.change(screen.getByLabelText('7/8 grouping'), { target: { value: '3+2+2' } });
    expect(screen.getByText(/grouped 3\+2\+2/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '7/8, 7 eighth-note clicks per bar' }).querySelectorAll('.is-group-start')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Time signature'), { target: { value: '12/8' } });
    expect(screen.getByText(/four dotted-quarter beats/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disappearing' }));
    fireEvent.change(screen.getByLabelText('Tempo in clicks per minute'), { target: { value: '240' } });
    vi.mocked(playClick).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Start metronome' }));
    act(() => { vi.advanceTimersByTime(3200); });
    expect(playClick).toHaveBeenCalledTimes(12);
    expect(screen.getByText('Silent bar · keep playing')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(vi.mocked(playClick).mock.calls.length).toBeGreaterThan(12);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    const tempo = screen.getByLabelText('Tempo in clicks per minute');
    expect(tempo).toHaveAttribute('max', '480');
    fireEvent.change(tempo, { target: { value: '360' } });
    expect(tempo).toHaveValue('360'); // 120 dotted-quarter beats per minute in 12/8.
    fireEvent.change(screen.getByLabelText('Time signature'), { target: { value: '4/4' } });
    expect(tempo).toHaveAttribute('max', '240');
    expect(tempo).toHaveValue('240');
    vi.useRealTimers();
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
