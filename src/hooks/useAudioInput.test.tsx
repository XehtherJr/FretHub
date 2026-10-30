import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getAudioContext } from '@core/audio';
import { useAudioInput } from './useAudioInput';

vi.mock('@core/audio', () => ({ getAudioContext: vi.fn(), isAudioSupported: () => true }));

function Harness() {
  const microphone = useAudioInput(8192);
  return <><span data-testid="status">{microphone.status}</span><button onClick={() => { void microphone.start(); }}>Start</button><button onClick={microphone.stop}>Stop</button></>;
}

let restoreMediaDevices: PropertyDescriptor | undefined;
beforeEach(() => { vi.clearAllMocks(); restoreMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'); });
afterEach(() => {
  if (restoreMediaDevices) Object.defineProperty(navigator, 'mediaDevices', restoreMediaDevices);
  else delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
});

describe('microphone input lifecycle', () => {
  it('uses a longer tuner window and releases the stream when the track ends', async () => {
    const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
    track.stop = vi.fn();
    const stream = { getTracks: () => [track] };
    const request = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: request } });
    const analyser = { fftSize: 0, disconnect: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    vi.mocked(getAudioContext).mockReturnValue({ state: 'running', createMediaStreamSource: () => source, createAnalyser: () => analyser } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('listening'));
    expect(request).toHaveBeenCalledWith({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    expect(analyser.fftSize).toBe(8192);
    act(() => track.dispatchEvent(new Event('ended')));
    expect(screen.getByTestId('status')).toHaveTextContent('unavailable');
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(analyser.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('does not claim to listen to a microphone that disconnected during setup', async () => {
    const track = { readyState: 'ended', stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    const createSource = vi.fn();
    vi.mocked(getAudioContext).mockReturnValue({ state: 'running', createMediaStreamSource: createSource } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(createSource).not.toHaveBeenCalled();
  });

  it('does not claim to be listening if audio processing cannot resume', async () => {
    const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
    track.stop = vi.fn();
    const resume = vi.fn().mockRejectedValue(new Error('blocked'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    vi.mocked(getAudioContext).mockReturnValue({ state: 'suspended', resume } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
    expect(resume).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it.each(['stop', 'unmount'] as const)('stops acquired tracks immediately on %s while resume is pending, even if resume later rejects', async (cancel) => {
    const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
    track.stop = vi.fn();
    let rejectResume!: (error: Error) => void;
    const resume = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectResume = reject; }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    vi.mocked(getAudioContext).mockReturnValue({ state: 'suspended', resume } as unknown as AudioContext);
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(resume).toHaveBeenCalledOnce());
    if (cancel === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    else view.unmount();
    expect(track.stop).toHaveBeenCalledOnce();
    await act(async () => { rejectResume(new Error('resume rejected')); });
    expect(track.stop).toHaveBeenCalledOnce();
    if (cancel === 'stop') expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('disconnects partially created audio nodes and stops tracks when setup throws', async () => {
    const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
    track.stop = vi.fn();
    const source = { connect: vi.fn(() => { throw new Error('connect failed'); }), disconnect: vi.fn() };
    const analyser = { fftSize: 0, disconnect: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    vi.mocked(getAudioContext).mockReturnValue({ state: 'running', createMediaStreamSource: () => source, createAnalyser: () => analyser } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(analyser.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('stops a stream that arrives after cancellation without starting audio', async () => {
    let resolveStream!: (stream: { getTracks: () => unknown[] }) => void;
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(() => new Promise((resolve) => { resolveStream = resolve; }));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    const createSource = vi.fn();
    vi.mocked(getAudioContext).mockReturnValue({ state: 'running', createMediaStreamSource: createSource } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await act(async () => { resolveStream({ getTracks: () => [track] }); });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(createSource).not.toHaveBeenCalled();
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('releases an existing stream if a later start is unsupported', async () => {
    const track = new EventTarget() as EventTarget & { stop: ReturnType<typeof vi.fn> };
    track.stop = vi.fn();
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const analyser = { fftSize: 0, disconnect: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    vi.mocked(getAudioContext).mockReturnValue({ state: 'running', createMediaStreamSource: () => source, createAnalyser: () => analyser } as unknown as AudioContext);
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('listening'));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('status')).toHaveTextContent('unsupported');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });

});
