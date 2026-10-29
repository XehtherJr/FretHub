import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { playMidi, playSequence, strum } from '@core/audio';
import { getCompletedLessons, getLibrarySnapshot } from '@core/storage';
import { TRIAD_TRANSFER_ID } from '@/components/TriadTransferChallenge';

vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 10, state: 'running', resume: () => {} }),
  playMidi: vi.fn(), playSequence: vi.fn(), strum: vi.fn(), playClick: vi.fn(),
}));

const renderAt = (route: string) => render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());

describe('connected triad study', () => {
  it('connects the curriculum and chord and scale pages to real context-aware routes', () => {
    const index = renderAt('/theory');
    expect(screen.getByRole('heading', { name: 'One idea leads to another' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore a triad/ })).toHaveAttribute('href', '/theory/triads/explore');
    index.unmount();

    const chordPage = renderAt('/chords/Eb/minor');
    const fromChord = screen.getByRole('link', { name: 'Explore its relationships' });
    expect(fromChord).toHaveAttribute('href', '/theory/triads/explore?root=Eb&quality=minor&tuning=standard');
    fireEvent.click(fromChord);
    expect(screen.getByRole('heading', { name: 'One chord. A whole neck.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Root note')).toHaveValue('Eb');
    expect(screen.getByLabelText('Chord quality')).toHaveValue('minor');
    chordPage.unmount();

    renderAt('/scales/dorian?root=D');
    const fromScale = screen.getByRole('link', { name: /Study the root triad/ });
    expect(fromScale).toHaveAttribute('href', '/theory/triads/explore?root=D&quality=minor&scale=dorian&frets=12');
    fireEvent.click(fromScale);
    expect(screen.getByLabelText('Same-root scale')).toHaveValue('dorian');
    expect(screen.getByLabelText('Chord quality')).toHaveValue('minor');
  });

  it('compares major and minor thirds and plays labeled positions on the shared fretboard', () => {
    renderAt('/theory/triads/explore');
    expect(screen.getByText('arpeggio')).toBeInTheDocument();
    let board = screen.getByRole('group', { name: 'C major relationship fretboard' });
    const root = within(board).getByRole('button', { name: /String 5, fret 3, note C3, C, root of C/ });
    const majorThird = within(board).getByRole('button', { name: /String 4, fret 2, note E3, E, major third of C/ });
    expect(root.querySelector('.v-root')).toHaveTextContent('R');
    expect(majorThird.querySelector('.v-cool')).toHaveTextContent('3');
    fireEvent.click(majorThird);
    expect(playMidi).toHaveBeenCalledWith(52);
    fireEvent.change(screen.getByLabelText('Chord quality'), { target: { value: 'minor' } });
    expect(screen.getByText(/E → Eb \(third down one semitone\)/)).toBeInTheDocument();
    board = screen.getByRole('group', { name: 'C minor relationship fretboard' });
    const minorThird = within(board).getByRole('button', { name: /String 4, fret 1, note D#3, Eb, minor third of C/ });
    expect(minorThird.querySelector('.v-cool')).toHaveTextContent('b3');
    fireEvent.click(minorThird);
    expect(playMidi).toHaveBeenCalledWith(51);
    fireEvent.click(screen.getByRole('button', { name: 'Inside a scale' }));
    expect(screen.getByLabelText('Same-root scale')).toHaveValue('natural-minor');
    expect(within(board).getByRole('button', { name: /String 4, fret 3, note F3, F, perfect fourth/ }).querySelector('.v-scale')).toHaveTextContent('F');
    fireEvent.click(screen.getByRole('button', { name: 'Hear notes one by one' }));
    expect(playSequence).toHaveBeenCalledWith([60, 63, 67, 72], 0.38, 0.9);
  });

  it('preserves tuning, capo, spelling and physical fret positions in a deep link', () => {
    renderAt('/theory/triads/explore?root=Db&quality=minor&scale=dorian&tuning=drop-d&capo=2&frets=15');
    expect(screen.getByLabelText('Root note')).toHaveValue('Db');
    expect(screen.getByLabelText('Same-root scale')).toHaveValue('dorian');
    const board = screen.getByRole('group', { name: 'Db minor relationship fretboard' });
    const open = within(board).getByRole('button', { name: /D2 string open, capo fret 2, note E2, string 6, Fb, minor third of Db/ });
    expect(open.querySelector('.v-cool')).toHaveTextContent('b3');
    expect(within(board).getByRole('button', { name: /String 6, fret 2/ })).toBeDisabled();
    fireEvent.click(open);
    expect(playMidi).toHaveBeenCalledWith(40);
    fireEvent.click(screen.getByText(/Instrument: Drop D/));
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo')).toHaveValue('2');
    expect(screen.getByLabelText('Frets shown')).toHaveValue('15');
  });

  it('shows generated inversions and correctly transposed E and A forms on the neck', () => {
    renderAt('/theory/triads/explore');
    expect(screen.getByRole('img', { name: 'C, fret positions low to high: x 3 2 0 1 0' })).toBeInTheDocument();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next voicing' }));
    const compactChart = screen.getByRole('img', { name: /C, fret positions low to high:/ }).getAttribute('aria-label')!;
    expect(compactChart.split(': ')[1].split(' ').filter((fret) => fret !== 'x')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Third · E' }));
    expect(screen.getByText(/Third in the bass: first inversion/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^C\/E, fret positions/ })).toBeInTheDocument();
    expect(screen.getByText(/Finger numbers are suggestions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hear this voicing' }));
    expect(strum).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Show shape on neck/ }));
    expect(document.activeElement).toBe(document.getElementById('triad-neck'));
    expect(screen.getByText('C, E in the bass')).toBeInTheDocument();
    const board = screen.getByRole('group', { name: 'C major relationship fretboard' });
    expect(board.querySelectorAll('.fb-note').length).toBeGreaterThanOrEqual(3);
    expect(board.querySelectorAll('.fb-note').length).toBeLessThanOrEqual(6);
    fireEvent.click(screen.getByText('Recognize an open E or A shape?'));
    fireEvent.click(screen.getByRole('button', { name: /Show E form on neck/ }));
    expect(screen.getByText('C, E-form shape')).toBeInTheDocument();
    expect(board.querySelectorAll('.fb-note')).toHaveLength(6);
    expect(within(board).getByRole('button', { name: /String 6, fret 8, note C3, C, root/ }).querySelector('.v-root')).toHaveTextContent('R');
    fireEvent.click(screen.getByRole('button', { name: /Show A form on neck/ }));
    expect(board.querySelectorAll('.fb-note')).toHaveLength(5);
    expect(within(board).getByRole('button', { name: /String 5, fret 3, note C3, C, root/ }).querySelector('.v-root')).toHaveTextContent('R');
  });

  it('falls back safely for malformed share links', () => {
    renderAt('/theory/triads/explore?root=H&quality=unknown&scale=unknown&tuning=unknown&capo=99&frets=1');
    expect(screen.getByLabelText('Root note')).toHaveValue('C');
    expect(screen.getByLabelText('Chord quality')).toHaveValue('major');
    expect(screen.getByLabelText('Same-root scale')).toHaveValue('major');
    fireEvent.click(screen.getByText(/Instrument: standard/));
    expect(screen.getByLabelText('Tuning')).toHaveValue('standard');
    expect(screen.getByLabelText('Capo')).toHaveValue('0');
    expect(screen.getByLabelText('Frets shown')).toHaveValue('12');
  });

  it('expands the physical fret range for a high capo shape and never shows a partial shape', () => {
    renderAt('/theory/triads/explore?root=A%23&quality=major&capo=7&frets=12');
    fireEvent.click(screen.getByText('Recognize an open E or A shape?'));
    fireEvent.click(screen.getByRole('button', { name: /Show E form on neck/ }));
    expect(screen.getByText('A#, E-form shape')).toBeInTheDocument();
    const board = screen.getByRole('group', { name: 'A# major relationship fretboard' });
    expect(board.querySelectorAll('.fb-note')).toHaveLength(6);
    fireEvent.click(screen.getByText(/Instrument: standard/));
    expect(screen.getByLabelText('Frets shown')).toHaveValue('22');
    fireEvent.change(screen.getByLabelText('Frets shown'), { target: { value: '12' } });
    expect(screen.queryByText('A#, E-form shape')).not.toBeInTheDocument();
    expect(board.querySelectorAll('.fb-note').length).toBeGreaterThan(6);
  });

  it('guides a beginner from an open string to a root and a hidden third, then removes the guide for transfer', () => {
    renderAt('/theory/triads/explore');
    fireEvent.click(screen.getByRole('button', { name: 'Start the two-key challenge' }));
    let board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of C major' });
    expect(board.querySelectorAll('.fb-note')).toHaveLength(0);
    expect(within(board).getByRole('button', { name: 'String 1, fret 12, play note' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guide me: find the root first' }));
    expect(screen.getByText(/Open string 1 sounds E/)).toBeInTheDocument();
    expect(screen.getByText(/E–F and B–C are adjacent/)).toBeInTheDocument();
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 7/ }));
    expect(screen.getByRole('status')).toHaveTextContent('sounds B');
    fireEvent.click(screen.getByRole('button', { name: 'Show one root' }));
    expect(board.querySelectorAll('.fb-note')).toHaveLength(1);
    expect(within(board).getByRole('button', { name: 'String 1, fret 12, play note' })).toBeInTheDocument();
    const root = within(board).getByRole('button', { name: /String 1, fret 8, C, root, marker R/ });
    expect(root.querySelector('.fb-note')).toHaveTextContent('R');
    fireEvent.click(root);
    expect(screen.getByRole('status')).toHaveTextContent('C is the root at fret 8');
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 10/ }));
    expect(screen.getByRole('status')).toHaveTextContent('2 frets above the root');
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 12/ }));
    expect(screen.getByRole('status')).toHaveTextContent('E is the major third');
    fireEvent.click(screen.getByRole('button', { name: /Try another key/ }));
    board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of F major' });
    expect(board.querySelectorAll('.fb-note')).toHaveLength(0);
    expect(within(board).getByRole('button', { name: 'String 2, fret 10, play note' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guide me: find the root first' })).toBeInTheDocument();
    fireEvent.click(within(board).getByRole('button', { name: /String 2, fret 9/ }));
    expect(screen.getByRole('status')).toHaveTextContent('try another fret');
    fireEvent.click(within(board).getByRole('button', { name: /String 2, fret 10/ }));
    expect(screen.getByText(/Two keys explored/)).toBeInTheDocument();
    expect(getCompletedLessons()).toContain(TRIAD_TRANSFER_ID);
  });

  it('keeps unusual spelling, capo context and a reachable guided route', () => {
    renderAt('/theory/triads/explore?root=Cb&quality=minor&tuning=drop-d&capo=7&frets=12');
    expect(screen.getByLabelText('Root note')).toHaveValue('Cb');
    expect(screen.getByText(/Ebb sounds like D on this guitar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the two-key challenge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guide me: find the root first' }));
    expect(screen.getByText(/Cb sounds the same as B here/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show one root' }));
    const board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of Cb minor' });
    const root = board.querySelector<HTMLButtonElement>('.fb-hit.has-marker')!;
    expect(root).not.toBeNull();
    const [stringIndex, rootFret] = root.dataset.position!.split(':').map(Number);
    fireEvent.click(root);
    const thirdFret = (rootFret === 0 ? 7 : rootFret) + 3;
    fireEvent.click(board.querySelector<HTMLButtonElement>(`[data-position="${stringIndex}:${thirdFret}"]`)!);
    expect(screen.getByRole('status')).toHaveTextContent('Ebb is the minor third of Cb');
    fireEvent.click(screen.getByRole('button', { name: /Try another key/ }));
    expect(screen.getByRole('heading', { name: 'Find the third of Fb minor' })).toBeInTheDocument();
  });

  it('gives actionable retry feedback and saves application separately after transfer to another key', () => {
    const page = renderAt('/theory/triads/explore');
    fireEvent.click(screen.getByRole('button', { name: 'Start the two-key challenge' }));
    expect(screen.getByRole('heading', { name: 'Find the third of C major' })).toBeInTheDocument();
    let board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of C major' });
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 11/ }));
    expect(screen.getByRole('status')).toHaveTextContent('That position sounds D#');
    expect(getCompletedLessons()).not.toContain(TRIAD_TRANSFER_ID);
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 12/ }));
    expect(screen.getByRole('status')).toHaveTextContent('E is the major third of C');
    fireEvent.click(screen.getByRole('button', { name: /Try another key/ }));
    expect(screen.getByRole('heading', { name: 'Find the third of F major' })).toBeInTheDocument();
    board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of F major' });
    fireEvent.click(within(board).getByRole('button', { name: /String 2, fret 10/ }));
    expect(screen.getByRole('status')).toHaveTextContent('A is the major third of F');
    expect(screen.getByText(/not a claim of mastery/)).toBeInTheDocument();
    expect(getCompletedLessons()).toContain(TRIAD_TRANSFER_ID);
    expect(getCompletedLessons()).not.toContain('triads');
    expect(getLibrarySnapshot().lessons[TRIAD_TRANSFER_ID].value).toBe(true);
    page.unmount();
    renderAt('/theory/triads/explore');
    expect(screen.getByText(/You have completed this application challenge/)).toBeInTheDocument();
  });

  it('does not claim the transfer challenge was saved if local storage fails', () => {
    renderAt('/theory/triads/explore');
    fireEvent.click(screen.getByRole('button', { name: 'Start the two-key challenge' }));
    let board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of C major' });
    fireEvent.click(within(board).getByRole('button', { name: /String 1, fret 12/ }));
    fireEvent.click(screen.getByRole('button', { name: /Try another key/ }));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'frethub:sync-meta') throw new Error('quota');
      return original.call(this, key, value);
    });
    board = screen.getByRole('group', { name: 'Challenge fretboard: find the third of F major' });
    fireEvent.click(within(board).getByRole('button', { name: /String 2, fret 10/ }));
    expect(screen.getByText(/Progress could not be saved on this device/)).toBeInTheDocument();
    expect(screen.queryByText(/saved as an application challenge/)).not.toBeInTheDocument();
    expect(getCompletedLessons()).not.toContain(TRIAD_TRANSFER_ID);
  });

  it('uses concept-specific labs, related lessons and useful retry hints', () => {
    const lesson = renderAt('/theory/intervals');
    fireEvent.click(screen.getByRole('button', { name: 'Minor third' }));
    expect(screen.getByText('C → Eb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hear the interval' }));
    expect(playSequence).toHaveBeenCalledWith([60, 63], 0.45, 0.8);
    fireEvent.click(screen.getByRole('button', { name: 'Three' }));
    expect(screen.getByRole('status')).toHaveTextContent('Compare C to E on one string');
    expect(screen.getByRole('link', { name: /Triads: stacking notes in thirds/ })).toBeInTheDocument();
    lesson.unmount();
    renderAt('/theory/modes');
    fireEvent.click(screen.getByRole('button', { name: 'D Dorian' }));
    expect(screen.getByText(/D Dorian shares its pitch classes with C major/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find D minor in this scale/ })).toHaveAttribute('href', '/theory/triads/explore?root=D&quality=minor&scale=dorian');
  });
});
