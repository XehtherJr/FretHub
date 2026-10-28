import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startProgressionPlayback } from './progressionAudio';

const audio = vi.hoisted(() => ({ prepareStrummer: vi.fn(), getAudioContext: vi.fn() }));
vi.mock('./audio', () => audio);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.clearAllMocks();
  audio.getAudioContext.mockReturnValue({ get currentTime() { return Date.now() / 1000; } });
});
afterEach(() => vi.useRealTimers());

describe('progression audio scheduler', () => {
  it('plays the selected MIDI chords in order for their requested beats and finishes once', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number) => [{ stop: vi.fn(), onended: null }]);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const onChord = vi.fn(); const onEnd = vi.fn(); const onError = vi.fn();
    startProgressionPlayback([{ midi: [48, 52, 55], beats: 2 }, { midi: [43, 47, 50], beats: 1 }], 120, false, { onChord, onEnd, onError });
    await vi.advanceTimersByTimeAsync(100);
    expect(schedule.mock.calls[0][0]).toEqual([48, 52, 55]);
    expect(onChord).toHaveBeenNthCalledWith(1, 0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(schedule.mock.calls[1][0]).toEqual([43, 47, 50]);
    expect(onChord).toHaveBeenNthCalledWith(2, 1);
    expect(schedule.mock.calls[1][1] - schedule.mock.calls[0][1]).toBeCloseTo(1, 5);
    await vi.advanceTimersByTimeAsync(600);
    expect(onEnd).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('loops in order and stops both scheduled sound and future repetitions', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; onended: null }[] = [];
    audio.prepareStrummer.mockResolvedValue(vi.fn(() => { const node = { stop: vi.fn(), onended: null }; sources.push(node); return [node]; }));
    const onChord = vi.fn(); const onEnd = vi.fn();
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 1 }, { midi: [43, 47], beats: 1 }], 120, true, { onChord, onEnd, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(1650);
    expect(onChord.mock.calls.map((call) => call[0])).toEqual([0, 1, 0, 1]);
    const count = sources.length;
    player.stop();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sources).toHaveLength(count);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('does not burst through missed chords after a throttled timer resumes', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 1 }, { midi: [43, 47], beats: 1 }], 120, true, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(100);
    expect(schedule).toHaveBeenCalledTimes(1);
    vi.setSystemTime(5000); // The audio clock advanced while the timer was suspended.
    await vi.advanceTimersByTimeAsync(25);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule.mock.calls[1][0]).toEqual([43, 47]);
    expect(schedule.mock.calls[1][1]).toBeGreaterThanOrEqual(5);
    player.stop();
  });

  it('stops and reports an audio scheduling failure after playback has begun', async () => {
    const source = { stop: vi.fn(), onended: null };
    const schedule = vi.fn().mockReturnValueOnce([source]).mockImplementationOnce(() => { throw new Error('audio closed'); });
    audio.prepareStrummer.mockResolvedValue(schedule);
    const onError = vi.fn(); const onEnd = vi.fn();
    startProgressionPlayback([{ midi: [48, 52], beats: 1 }, { midi: [43, 47], beats: 1 }], 120, true, { onChord: vi.fn(), onEnd, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('does not play late sample loads after stop and rejects invalid timing', async () => {
    let ready!: (schedule: ReturnType<typeof vi.fn>) => void;
    const schedule = vi.fn();
    audio.prepareStrummer.mockReturnValue(new Promise((resolve) => { ready = resolve; }));
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 4 }], 90, true, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    player.stop(); ready(schedule);
    await vi.advanceTimersByTimeAsync(1000);
    expect(schedule).not.toHaveBeenCalled();
    expect(() => startProgressionPlayback([], 90, false, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })).toThrow();
    expect(() => startProgressionPlayback([{ midi: [48], beats: 0 }], 90, false, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })).toThrow();
  });
});
