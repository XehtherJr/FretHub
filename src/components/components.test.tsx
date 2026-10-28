import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import ChordDiagram from './ChordDiagram';
import Fretboard from './Fretboard';
import { getTuning } from '@core/tunings';
import { assignFingering, generateVoicings, Voicing } from '@core/voicing-engine';
import { buildChord } from '@core/chords';

vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(),
  playSequence: vi.fn(),
  strum: vi.fn(),
  playClick: vi.fn(),
}));

describe('ChordDiagram', () => {
  it('renders the F major barre with a visible barre and finger numbers', () => {
    const fingering = assignFingering([1, 3, 3, 2, 1, 1], true)!;
    const tuning = getTuning('standard');
    const voicing: Voicing = {
      frets: [1, 3, 3, 2, 1, 1],
      fingers: fingering.fingers,
      barre: fingering.barre,
      midi: [null, null, null, null, null, null],
      pitchClasses: [],
      bassPc: null,
      position: 1,
      span: 2,
      fingerCount: fingering.fingerCount,
      hasOpen: false,
      mutedCount: 0,
      score: 1,
      playability: 'intermediate',
    };
    render(<ChordDiagram voicing={voicing} tuning={tuning} name="F" />);
    const figure = screen.getByRole('img', { name: /F, fret positions/ });
    expect(figure.querySelector('.cd-barre')?.textContent).toBe('1'); // barre label
    expect(figure.querySelectorAll('.cd-dot').length).toBeGreaterThan(0);
    const nut = figure.querySelector('.cd-nut')!;
    const string = figure.querySelector('.cd-string')!;
    expect(nut.getAttribute('y1')).toBe(nut.getAttribute('y2')); // horizontal nut
    expect(string.getAttribute('x1')).toBe(string.getAttribute('x2')); // vertical strings
    // Top row markers show no open/muted strings for a full barre.
    expect(figure.textContent).not.toContain('×');
  });

  it('labels a higher partial barre with its actual suggested finger', () => {
    const tuning = getTuning('standard');
    const chord = buildChord('C', 'dominant-9');
    const voicing = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxFret: 5, maxResults: 10000 })
      .find((item) => item.frets.join(',') === [null, 3, 2, 3, 3, 3].join(','));
    expect(voicing).toBeDefined();
    render(<ChordDiagram voicing={voicing!} tuning={tuning} name="C9" />);
    expect(screen.getByRole('img', { name: /C9, fret positions/ }).querySelector('.cd-barre')?.textContent).toBe('3');
  });

  it('renders and describes both independently fingered barres accessibly', () => {
    const tuning = getTuning('standard');
    const chord = buildChord('C', 'dominant-9');
    const voicing = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxFret: 9, maxResults: 10000 })
      .find((item) => item.frets.join(',') === [8, 7, 8, 7, 8, 8].join(','));
    expect(voicing).toBeDefined();
    render(<ChordDiagram voicing={voicing!} tuning={tuning} name="C9" />);
    const figure = screen.getByRole('img', { name: /C9, fret positions/ });
    expect([...figure.querySelectorAll('.cd-barre')].map((barre) => barre.textContent)).toEqual(['1', '4']);
    expect(figure).toHaveAccessibleDescription(/Finger 1 barres fret 7 from string 5 through string 3/);
    expect(figure).toHaveAccessibleDescription(/Finger 4 barres fret 8 from string 2 through string 1/);
    expect(figure).toHaveAccessibleDescription(/string 6, fret 8, finger 2/);
  });

  it('marks muted and open strings in the diagram header', () => {
    const chord = buildChord('C', 'major');
    const [voicing] = generateVoicings(chord.pitchClasses, getTuning('standard'), chord.rootPc);
    const { container } = render(
      <ChordDiagram voicing={voicing} tuning={getTuning('standard')} name="C" />,
    );
    // Engine's top-ranked C shapes always use at least one open string.
    expect(container.textContent).toContain('O');
  });
});

describe('Fretboard', () => {
  it('renders one accessible button per cell in interactive mode and toggles', () => {
    const tuning = getTuning('standard');
    const onToggle = vi.fn();
    render(
      <Fretboard tuning={tuning} fretCount={12} interactive onToggle={onToggle} />,
    );
    const board = screen.getByRole('group');
    const buttons = within(board).getAllByRole('button');
    expect(buttons).toHaveLength(6 * 13);
    fireEvent.click(buttons[0]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('places bass strings at the top and navigates in the visible direction', () => {
    render(<Fretboard tuning={getTuning('standard')} fretCount={12} interactive />);
    const board = screen.getByRole('group');
    expect([...board.querySelectorAll('.fb-svg-string-label')].map((label) => label.textContent)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    const low = within(board).getByRole('button', { name: /E2 string open, note E2/ });
    const high = within(board).getByRole('button', { name: /E4 string open, note E4/ });
    expect(parseFloat(low.style.top)).toBeLessThan(parseFloat(high.style.top));
    low.focus();
    fireEvent.keyDown(low, { key: 'ArrowDown' });
    expect(within(board).getByRole('button', { name: /A2 string open, note A2/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(low).toHaveFocus();
  });

  it('renders non-interactive scale markers as an image with no buttons', () => {
    const tuning = getTuning('standard');
    const { container } = render(
      <Fretboard
        tuning={tuning}
        fretCount={12}
        markers={[{ stringIndex: 0, fret: 0, label: 'E', variant: 'root' }]}
        ariaLabel="scale pattern"
      />,
    );
    expect(screen.getByRole('img', { name: 'scale pattern' })).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('.fb-note.v-root')?.textContent).toBe('E');
  });

  it('uses arrow keys to navigate positions and skips frets under a capo', () => {
    render(<Fretboard tuning={getTuning('standard')} capo={2} fretCount={12} interactive />);
    const board = screen.getByRole('group');
    const open = within(board).getByRole('button', { name: /E4 string open, capo fret 2, note F#4/ });
    act(() => open.focus());
    fireEvent.keyDown(open, { key: 'ArrowRight' });
    const firstPlayable = within(board).getByRole('button', { name: /String 1, fret 3, note G4/ });
    expect(firstPlayable).toHaveFocus();
    fireEvent.keyDown(firstPlayable, { key: 'ArrowUp' });
    expect(within(board).getByRole('button', { name: /String 2, fret 3, note D4/ })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(within(board).getByRole('button', { name: /B3 string open, capo fret 2, note C#4/ })).toHaveFocus();
  });

  it('supports extended-range tunings without changing the number of fret positions', () => {
    render(<Fretboard tuning={getTuning('8-string-standard')} fretCount={12} interactive />);
    const board = screen.getByRole('group');
    expect(within(board).getAllByRole('button')).toHaveLength(8 * 13);
    expect(within(board).getByRole('button', { name: /F#1 string open, note F#1, string 8/ })).toBeTruthy();
  });

  it('reflects a capo visually and disables frets under it', () => {
    const tuning = getTuning('standard');
    render(
      <Fretboard tuning={tuning} capo={2} fretCount={12} interactive ariaLabel="capo board" />,
    );
    const board = screen.getByRole('group', { name: 'capo board' });
    expect(board.querySelector('.fb-capo')?.textContent).toContain('capo 2');
    const disabled = within(board).getAllByRole('button').filter((b) => b.hasAttribute('disabled'));
    expect(disabled.length).toBeGreaterThan(0);
  });
});
