import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { midiToFreq } from '@core/notes';
import { playMidi } from '@core/audio';
import Tuner from './Tuner';

const mocks = vi.hoisted(() => ({
  microphone: { status: 'listening', input: null as unknown, stop: vi.fn(), start: vi.fn() },
}));
vi.mock('@/hooks/useAudioInput', () => ({ useAudioInput: () => mocks.microphone }));
vi.mock('@core/audio', () => ({ isAudioSupported: () => true, playMidi: vi.fn() }));

let frequency = midiToFreq(40);
let amplitude = 0.06;
let pendingFrame: FrameRequestCallback | null = null;
let frameId = 0;
function frame(time: number) {
  const callback = pendingFrame;
  if (!callback) throw new Error('No animation frame scheduled');
  pendingFrame = null;
  act(() => callback(time));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  frequency = midiToFreq(40);
  amplitude = 0.06;
  pendingFrame = null;
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { pendingFrame = callback; return ++frameId; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  mocks.microphone.status = 'listening';
  mocks.microphone.input = {
    context: { sampleRate: 48000 },
    analyser: {
      fftSize: 8192,
      getFloatTimeDomainData: (buffer: Float32Array) => {
        for (let i = 0; i < buffer.length; i++) buffer[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / 48000);
      },
    },
  };
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('tuner microphone flow', () => {
  it('guides a flat guitar string against its target, while preserving chromatic mode', () => {
    frequency = midiToFreq(40) * 2 ** (-75 / 1200);
    render(<Tuner />);
    frame(100); frame(200);
    expect(screen.getByText('TARGET · STRING 6')).toBeInTheDocument();
    expect(screen.getByText('Flat · tune up gently')).toBeInTheDocument();
    expect(screen.getByText(/-7[3-7] cents from E2 · heard D#2/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Microphone level' })).toHaveAttribute('aria-valuetext', 'Signal received');
    fireEvent.click(screen.getByRole('button', { name: 'Chromatic' }));
    expect(screen.getByText('NEAREST NOTE')).toBeInTheDocument();
    expect(screen.getByText('Sharp · tune down gently')).toBeInTheDocument();
    expect(screen.getByText(/\+2[3-7] cents from D#2/)).toBeInTheDocument();
  });

  it('selects silently while listening and refuses to tell users to tune the wrong string', () => {
    render(<Tuner />);
    frame(100); frame(200);
    fireEvent.click(screen.getByRole('button', { name: 'Select E4 target, string 1' }));
    expect(playMidi).not.toHaveBeenCalled();
    frame(300); frame(400);
    expect(screen.getByText(/Heard E2. Check the selected string before turning a peg/)).toBeInTheDocument();
    expect(screen.queryByText(/tune up gently|tune down gently/i)).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Tuning in cents' }).querySelector('.meter-needle')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Auto detect' }));
    expect(screen.getByRole('button', { name: 'Auto detect' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores reference playback until its delayed sample and analyser tail have finished', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(playMidi).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    render(<Tuner />);
    fireEvent.click(screen.getByRole('button', { name: 'Select E2 target, string 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play selected reference' }));
    expect(playMidi).toHaveBeenCalledWith(40);
    expect(screen.getByText('Reference playing · listening paused')).toBeInTheDocument();
    frame(100); frame(200); frame(300);
    expect(screen.queryByText('In tune')).not.toBeInTheDocument();
    await act(async () => { finish!(); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(219));
    frame(400); frame(500);
    expect(screen.queryByText('In tune')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    frame(600); frame(700);
    expect(screen.getByText('In tune')).toBeInTheDocument();
  });

  it('flushes a full analyser window even at a low audio sample rate', async () => {
    (mocks.microphone.input as { context: { sampleRate: number } }).context.sampleRate = 22050;
    let finish: (() => void) | undefined;
    vi.mocked(playMidi).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    render(<Tuner />);
    fireEvent.click(screen.getByRole('button', { name: 'Select E2 target, string 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play selected reference' }));
    await act(async () => { finish!(); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(406));
    expect(screen.getByText('Reference playing · listening paused')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Reference playing · listening paused')).not.toBeInTheDocument();
  });

  it('allows repeated reference pegs and waits for every overlapping sound before listening', async () => {
    const finishes: Array<() => void> = [];
    vi.mocked(playMidi).mockImplementation(() => new Promise<void>((resolve) => finishes.push(resolve)));
    mocks.microphone.input = null;
    mocks.microphone.status = 'idle';
    const view = render(<Tuner />);
    fireEvent.click(screen.getByRole('button', { name: 'Play E2 reference, string 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play A2 reference, string 5' }));
    expect(vi.mocked(playMidi).mock.calls.map(([midi]) => midi)).toEqual([40, 45]);
    await act(async () => { finishes[1](); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText('Reference playing · listening paused')).toBeInTheDocument();
    await act(async () => { finishes[0](); await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(220));
    expect(screen.queryByText('Reference playing · listening paused')).not.toBeInTheDocument();
    view.unmount();
  });

  it('reports a reference playback failure and returns to microphone detection', async () => {
    vi.mocked(playMidi).mockRejectedValue(new Error('audio failed'));
    render(<Tuner />);
    fireEvent.click(screen.getByRole('button', { name: 'Select E2 target, string 6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play selected reference' }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('alert')).toHaveTextContent(/reference audio could not play/i);
    act(() => vi.advanceTimersByTime(220));
    frame(100); frame(200);
    expect(screen.getByText('In tune')).toBeInTheDocument();
  });

  it('shows microphone-level feedback and an actionable permission error', () => {
    const view = render(<Tuner />);
    amplitude = 0;
    frame(100); frame(200);
    expect(screen.getByText('Very quiet — try moving closer')).toBeInTheDocument();
    amplitude = 1.1;
    frame(300);
    expect(screen.getByText('Input is clipping — move the microphone back')).toBeInTheDocument();
    mocks.microphone.input = null;
    mocks.microphone.status = 'denied';
    view.rerender(<Tuner />);
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.getByRole('meter', { name: 'Tuning in cents' })).toHaveAttribute('aria-valuetext', 'No pitch detected');
  });
});
