import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { getProgressions } from '@core/storage';
import { startProgressionPlayback } from '@core/progressionAudio';
import { progressionMidi } from '@core/userProgressions';

const audio = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock('@core/audio', () => ({
  isAudioSupported: () => true,
  getAudioContext: () => ({ currentTime: 0, state: 'running', resume: () => {} }),
  playMidi: vi.fn(), playSequence: vi.fn(), strum: vi.fn(), playClick: vi.fn(),
}));
vi.mock('@core/progressionAudio', () => ({ startProgressionPlayback: vi.fn(() => ({ stop: audio.stop })) }));

beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => vi.restoreAllMocks());

function renderBuilder() {
  render(<MemoryRouter initialEntries={['/fretboard?mode=progression']}><App /></MemoryRouter>);
  return screen.getByRole('group', { name: /Interactive guitar fretboard/ });
}
function choose(board: HTMLElement, notes: RegExp[]) {
  notes.forEach((name) => fireEvent.click(within(board).getByRole('button', { name })));
}

const cShape = [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 1, note C4/, /E4 string open/];
const gShape = [/String 6, fret 3, note G2/, /String 5, fret 2, note B2/, /D3 string open/, /G3 string open/, /B3 string open/, /String 1, fret 3, note G4/];

describe('fretboard progression builder', () => {
  it('adds real voicings, reorders, loops, grades, saves and reopens them', async () => {
    const board = renderBuilder();
    expect(screen.getByRole('tab', { name: 'Build a progression' })).toHaveAttribute('aria-selected', 'true');
    choose(board, cShape);
    expect(screen.getByLabelText(/Chord name/)).toHaveAttribute('placeholder', 'C');
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    choose(board, gShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    expect(screen.getByText('2 chords')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move chord 2, G earlier' }));
    fireEvent.change(screen.getByLabelText('Beats for chord 2, C'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Loop progression'));
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(startProgressionPlayback).toHaveBeenCalledWith([
      { midi: [43, 47, 50, 55, 59, 67], beats: 4 },
      { midi: [null, 48, 52, 55, 60, 64], beats: 2 },
    ], 90, true, expect.any(Object));
    act(() => vi.mocked(startProgressionPlayback).mock.calls[0][3].onChord(0));
    expect(screen.getByRole('button', { name: 'Edit chord 1, G' }).closest('li')).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(audio.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText('Progression name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    const dialog = screen.getByRole('dialog', { name: 'Save progression' });
    expect(screen.getByLabelText('Progression name')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Progression name'), { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('button', { name: 'Save progression' })).toHaveFocus();
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Save progression' }), { key: 'Tab' });
    expect(screen.getByLabelText('Progression name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Progression name'), { target: { value: 'Morning practice' } });
    const grade = screen.getByLabelText('Difficulty');
    expect(within(grade).getAllByRole('option').map((option) => option.textContent)).toEqual(['Automatic estimate', 'Beginner', 'Novice', 'Intermediate', 'Advanced']);
    fireEvent.change(grade, { target: { value: 'advanced' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save progression' }));
    expect(getProgressions()[0]).toMatchObject({ name: 'Morning practice', difficulty: 'advanced', difficultyMode: 'manual', loop: true });
    expect(getProgressions()[0].chords.map((chord) => chord.name)).toEqual(['G', 'C']);
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Library and account' }));
    const link = screen.getByRole('link', { name: /Morning practice.*advanced.*2 chords/ });
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Build a progression' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByLabelText('Progression name')).toHaveValue('Morning practice');
    expect(screen.getByLabelText('Difficulty')).toHaveValue('advanced');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Loop progression')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Edit chord 1, G' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Interactive guitar fretboard/ }).querySelectorAll('[aria-pressed="true"]').length).toBe(6);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Morning practice' }));
    expect(getProgressions()).toEqual([]);
  }, 15_000); // This full round trip performs many real fretboard interactions.

  it('puts Add beside the neck actions and uses a typed chord name to generate the shape', () => {
    renderBuilder();
    const arpeggiate = screen.getByRole('button', { name: 'Arpeggiate selection' });
    const add = screen.getByRole('button', { name: 'Add selected chord' });
    expect(add.closest('.wb-board-actions')).toBe(arpeggiate.closest('.wb-board-actions'));
    fireEvent.change(screen.getByLabelText('Chord name'), { target: { value: 'Bbmaj7/D' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    expect(screen.getByLabelText('Chord name')).toHaveValue('Bbmaj7/D');
    fireEvent.click(add);
    expect(screen.getByRole('button', { name: 'Edit chord 1, Bbmaj7/D' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    const [chords] = vi.mocked(startProgressionPlayback).mock.calls[0];
    const lowest = Math.min(...chords[0].midi.filter((midi): midi is number => midi !== null));
    expect(lowest % 12).toBe(2); // D is the actual sounding bass, including in alternate tunings.
  });

  it('plays and saves the requested mixed-string picking pattern, and restores it when loaded', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: 'A-D-G-B-G-G+E4' } });
    expect(screen.getByText('Pattern ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(startProgressionPlayback).toHaveBeenCalledWith([
      { midi: [null, 48, 52, 55, 60, 64], beats: 4 },
    ], 90, false, expect.any(Object), { mode: 'custom', stepsPerBeat: 2, steps: [
      { kind: 'pick', strings: [1] }, { kind: 'pick', strings: [2] }, { kind: 'pick', strings: [3] },
      { kind: 'pick', strings: [4] }, { kind: 'pick', strings: [3] }, { kind: 'pick', strings: [3, 5] },
    ] });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.change(screen.getByLabelText('Progression name'), { target: { value: 'Picking idea' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    expect(getProgressions()[0].pattern).toMatchObject({ mode: 'custom', stepsPerBeat: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'New progression' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Picking idea' }));
    expect(screen.getByLabelText('Playback style')).toHaveValue('custom');
    expect(screen.getByLabelText('Pattern steps')).toHaveValue('5 4 3 2 3 3+1');
    expect(screen.getByLabelText('Step timing')).toHaveValue('2');
  });

  it('starts a button-built custom pattern empty and plays exactly those steps on two four-beat chords', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    choose(board, gShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Step timing'), { target: { value: '1' } });
    expect(screen.getByLabelText('Pattern steps')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
    fireEvent.click(screen.getByText('Build steps with buttons'));
    fireEvent.click(screen.getByLabelText('3 · G3'));
    fireEvent.click(screen.getByLabelText('1 · E4'));
    expect(screen.getByText(/Selected strings are not in the pattern yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add picked step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add rest' }));
    fireEvent.click(screen.getByLabelText('2 · B3'));
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add picked step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add down strum' }));
    expect(screen.getByLabelText('Pattern steps')).toHaveValue('3+1 rest 2 down');
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(startProgressionPlayback).toHaveBeenCalledWith([
      { midi: [null, 48, 52, 55, 60, 64], beats: 4 },
      { midi: [43, 47, 50, 55, 59, 67], beats: 4 },
    ], 90, false, expect.any(Object), { mode: 'custom', stepsPerBeat: 1, steps: [
      { kind: 'pick', strings: [3, 5] }, { kind: 'rest' }, { kind: 'pick', strings: [4] }, { kind: 'down' },
    ] });
  });

  it('explains steps that cannot fit and picked strings muted in a chord', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    choose(board, gShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Step timing'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: '6 5 3+1 rest 2 down' } });
    expect(screen.getByText(/Some steps won’t play before the chord changes/)).toBeInTheDocument();
    expect(screen.getByText(/Chord 1 \(C\): 4 beats × 1 step per beat = 4 steps\. Steps 5–6 won’t play/)).toBeInTheDocument();
    expect(screen.getByText(/Chord 2 \(G\): 4 beats × 1 step per beat = 4 steps\. Steps 5–6 won’t play/)).toBeInTheDocument();
    expect(screen.getByText(/Chord 1 \(C\): step 1 \(string 6\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Beats for chord 2, G'), { target: { value: '6' } });
    expect(screen.queryByText(/Chord 2 \(G\): 4 beats ×/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Step timing'), { target: { value: '2' } });
    expect(screen.queryByText(/Some steps won’t play before the chord changes/)).not.toBeInTheDocument();
    expect(screen.getByText(/Chord 1 \(C\): step 1 \(string 6\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: 'rest' } });
    expect(screen.getByText(/only rests, so playback will be silent/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeEnabled();
  });

  it('builds simultaneous picks, strums and rests with buttons and blocks invalid patterns', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByText('Build steps with buttons'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear pattern' }));
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save progression' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('3 · G3'));
    fireEvent.click(screen.getByLabelText('1 · E4'));
    fireEvent.click(screen.getByRole('button', { name: 'Add picked step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add down strum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add up strum' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add rest' }));
    expect(screen.getByLabelText('Pattern steps')).toHaveValue('3+1 down up rest');
    fireEvent.change(screen.getByLabelText('Step timing'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(vi.mocked(startProgressionPlayback).mock.calls[0][4]).toEqual({ mode: 'custom', stepsPerBeat: 3, steps: [
      { kind: 'pick', strings: [3, 5] }, { kind: 'down' }, { kind: 'up' }, { kind: 'rest' },
    ] });
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: 'E' } });
    expect(screen.getByText(/is ambiguous/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
  });

  it('protects unadded string selections and clears them when a saved pattern is loaded', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: '5 4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.change(screen.getByLabelText('Progression name'), { target: { value: 'My pattern' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    fireEvent.click(screen.getByText('Build steps with buttons'));
    fireEvent.click(screen.getByLabelText('3 · G3'));
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByText('Build steps with buttons'));
    expect(screen.getByText(/Selected strings are not in the pattern yet/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear selected strings' })).toBeVisible();
    fireEvent.click(screen.getByText('Build steps with buttons'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'single' } });
    expect(screen.getByLabelText('Playback style')).toHaveValue('custom');
    expect(screen.getByLabelText('3 · G3')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'New progression' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('3 · G3')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Load My pattern' }));
    expect(screen.getByLabelText('3 · G3')).toBeChecked();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load My pattern' }));
    expect(screen.getByLabelText('3 · G3')).not.toBeChecked();
    expect(screen.getByLabelText('Pattern steps')).toHaveValue('5 4');
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeEnabled();
  });

  it('preserves pending string numbers across tuning changes and explains unavailable strings', () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByText('Build steps with buttons'));
    fireEvent.click(screen.getByLabelText('3 · G3'));
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: '7-string-standard' } });
    expect(screen.getByLabelText('3 · G3')).toBeChecked();
    fireEvent.click(screen.getByLabelText('7 · B1'));
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'standard' } });
    expect(screen.getByLabelText('3 · G3')).toBeChecked();
    expect(screen.getByText(/Some selected strings are unavailable in this tuning and were cleared/)).toBeVisible();
  });

  it('uses a repeating arpeggio while retaining the original one-strum behavior for older saves', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'arpeggio' } });
    fireEvent.change(screen.getByLabelText('Step timing'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(vi.mocked(startProgressionPlayback).mock.calls[0][4]).toEqual({ mode: 'arpeggio', stepsPerBeat: 4 });
  });

  it('does not silently label an unrelated selected shape as a typed chord', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.change(screen.getByLabelText('Chord name'), { target: { value: 'Am' } });
    expect(screen.getByRole('button', { name: 'Add selected chord' })).toBeDisabled();
    expect(screen.getByText(/Show this chord on the neck before adding it/)).toBeInTheDocument();
    // Experienced players may deliberately name their exact physical shape.
    fireEvent.click(screen.getByRole('button', { name: 'Use this name for current frets instead' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    expect(getProgressions()[0].chords[0]).toMatchObject({ name: 'Am', frets: [null, 3, 2, 0, 1, 0] });
  });

  it('cancels the save dialog without changing the draft and restores focus', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    const saveButton = screen.getByRole('button', { name: 'Save progression' });
    saveButton.focus();
    fireEvent.click(saveButton);
    fireEvent.change(screen.getByLabelText('Progression name'), { target: { value: 'Not saved' } });
    fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'advanced' } });
    fireEvent(screen.getByRole('dialog', { name: 'Save progression' }), new Event('cancel', { bubbles: true, cancelable: true }));
    expect(getProgressions()).toEqual([]);
    expect(saveButton).toHaveFocus();
    fireEvent.click(saveButton);
    expect(screen.getByLabelText('Progression name')).toHaveValue('My progression');
    expect(screen.getByLabelText('Difficulty')).toHaveValue('auto');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Cancel' }));
  });

  it('loads an adjustable generated chord, edits it, and keeps a draft when switching tabs', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Choose root & type' }));
    fireEvent.change(screen.getByLabelText('Chord root'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Chord type'), { target: { value: 'minor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    expect(screen.getByLabelText('Chord name').getAttribute('placeholder')).toMatch(/^Am/);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: /Edit chord 1/ }));
    fireEvent.change(screen.getByLabelText('Chord name'), { target: { value: 'My Am shape' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update chord 1' }));
    expect(screen.getByRole('button', { name: 'Edit chord 1, My Am shape' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Identify a chord' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Build a progression' }));
    expect(screen.getByRole('button', { name: 'Edit chord 1, My Am shape' })).toBeInTheDocument();
  });

  it('protects an unfinished chord edit from being played, saved or discarded silently', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit chord 1, C' }));
    fireEvent.change(screen.getByLabelText('Chord name'), { target: { value: 'Edited C' } });
    expect(screen.getByRole('button', { name: 'Play progression' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'New progression' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('Chord name')).toHaveValue('Edited C');
    fireEvent.click(screen.getByRole('button', { name: 'Update chord 1' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit chord 1, Edited C' })).toBeInTheDocument();
  });

  it('does not keep a generated name after the shape is replaced manually', () => {
    const board = renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: 'Choose root & type' }));
    fireEvent.change(screen.getByLabelText('Chord root'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Chord type'), { target: { value: 'minor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    expect(screen.getByLabelText('Chord name').getAttribute('placeholder')).toMatch(/^Am/);
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    choose(board, cShape);
    expect(screen.getByLabelText('Chord name')).toHaveAttribute('placeholder', 'C');
    expect(screen.getByLabelText('Chord name')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    expect(screen.getByRole('button', { name: 'Edit chord 1, C' })).toBeInTheDocument();
  });

  it('does not reuse a hidden chord-finder root hint when naming a progression', () => {
    const board = renderBuilder();
    fireEvent.click(screen.getByRole('tab', { name: 'Identify a chord' }));
    fireEvent.change(screen.getByLabelText('Root hint (optional)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Build a progression' }));
    choose(board, cShape);
    expect(screen.getByLabelText('Chord name')).toHaveAttribute('placeholder', 'C');
  });

  it('restores a saved alternate tuning, capo and exact physical shape', () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    fireEvent.change(screen.getByLabelText('Capo', { exact: true }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.change(screen.getByLabelText('Progression name'), { target: { value: 'Drop D idea' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    const item = getProgressions()[0];
    expect(item).toMatchObject({ tuningId: 'drop-d', capo: 2 });
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'standard' } });
    fireEvent.change(screen.getByLabelText('Capo', { exact: true }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load Drop D idea' }));
    expect(screen.getByLabelText('Tuning')).toHaveValue('drop-d');
    expect(screen.getByLabelText('Capo', { exact: true })).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(startProgressionPlayback).toHaveBeenCalledWith([
      { midi: progressionMidi(item.chords[0].frets, 'drop-d', 2), beats: 4 },
    ], 90, false, expect.any(Object));
  });

  it('keeps pattern string identities and sounding frets correct with alternate tuning and capo', () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    fireEvent.change(screen.getByLabelText('Capo', { exact: true }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show chord on neck' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Playback style'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('Pattern steps'), { target: { value: 'D2 D3 E4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progression' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Save progression' })).getByRole('button', { name: 'Save progression' }));
    const item = getProgressions()[0];
    expect(item.pattern).toEqual({ mode: 'custom', stepsPerBeat: 2, steps: [
      { kind: 'pick', strings: [0] }, { kind: 'pick', strings: [2] }, { kind: 'pick', strings: [5] },
    ] });
    fireEvent.click(screen.getByRole('button', { name: 'Play progression' }));
    expect(startProgressionPlayback).toHaveBeenCalledWith([
      { midi: progressionMidi(item.chords[0].frets, 'drop-d', 2), beats: 4 },
    ], 90, false, expect.any(Object), item.pattern);
  });

  it('protects an existing sequence from mixing capo or tuning setups', () => {
    const board = renderBuilder();
    choose(board, cShape);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected chord' }));
    fireEvent.change(screen.getByLabelText('Tuning'), { target: { value: 'drop-d' } });
    const newBoard = screen.getByRole('group', { name: /Interactive guitar fretboard/ });
    choose(newBoard, [/D2 string open, note D2/, /A2 string open, note A2/]);
    expect(screen.getByText(/This progression uses Standard/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add selected chord' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore progression setup' }));
    expect(screen.getByLabelText('Tuning')).toHaveValue('standard');
    expect(screen.getByRole('button', { name: 'Add selected chord' })).toBeEnabled();
  });
});
