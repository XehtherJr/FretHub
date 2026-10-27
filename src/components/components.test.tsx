import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChordDiagram from './ChordDiagram';
import Fretboard from './Fretboard';
import { getTuning } from '@core/tunings';
import { assignFingering, generateVoicings, Voicing } from '@core/voicing-engine';
import { buildChord } from '@core/chords';

vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(),
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
    // Top row markers show no open/muted strings for a full barre.
    expect(figure.textContent).not.toContain('×');
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
