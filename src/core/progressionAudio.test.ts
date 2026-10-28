import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startProgressionPlayback } from './progressionAudio';

const audio = vi.hoisted(() => ({ prepareStrummer: vi.fn(), getAudioContext: vi.fn() }));
vi.mock('./audio', () => audio);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.clearAllMocks();
  audio.getAudioContext.mockReturnValue({ state: 'running', get currentTime() { return Date.now() / 1000; } });
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

  it('schedules A-D-G-B-G-G+E4 accurately, then restarts the pattern at the next chord', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const onChord = vi.fn(); const onEnd = vi.fn();
    const pattern = { mode: 'custom' as const, stepsPerBeat: 2 as const, steps: [
      { kind: 'pick' as const, strings: [1] }, { kind: 'pick' as const, strings: [2] },
      { kind: 'pick' as const, strings: [3] }, { kind: 'pick' as const, strings: [4] },
      { kind: 'pick' as const, strings: [3] }, { kind: 'pick' as const, strings: [3, 5] },
    ] };
    startProgressionPlayback([
      { midi: [null, 45, 52, 59, 60, 67], beats: 3 },
      { midi: [43, 47, 50, 55, 59, 67], beats: 3 },
    ], 120, false, { onChord, onEnd, onError: vi.fn() }, pattern);
    await vi.advanceTimersByTimeAsync(1550);
    expect(schedule.mock.calls.slice(0, 6).map((call) => call[0])).toEqual([[45], [52], [59], [60], [59], [59, 67]]);
    expect(schedule.mock.calls[5][3]).toEqual({ direction: 'down', gap: 0 });
    for (let index = 1; index < 6; index++) expect(schedule.mock.calls[index][1] - schedule.mock.calls[index - 1][1]).toBeCloseTo(0.25, 6);
    expect(schedule.mock.calls[6][0]).toEqual([47]);
    expect(schedule.mock.calls[6][1] - schedule.mock.calls[0][1]).toBeCloseTo(1.5, 6);
    expect(onChord.mock.calls.map((call) => call[0])).toEqual([0, 1]);
    await vi.advanceTimersByTimeAsync(1600);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('plays a button-built quarter-note pattern on two four-beat chords, including grouped picks and rests', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const onChord = vi.fn(); const onEnd = vi.fn();
    startProgressionPlayback([
      { midi: [null, 48, 52, 55, 60, 64], beats: 4 },
      { midi: [43, 47, 50, 55, 59, 67], beats: 4 },
    ], 120, false, { onChord, onEnd, onError: vi.fn() }, { mode: 'custom', stepsPerBeat: 1, steps: [
      { kind: 'pick', strings: [3, 5] }, { kind: 'rest' }, { kind: 'pick', strings: [4] }, { kind: 'down' },
    ] });
    await vi.advanceTimersByTimeAsync(4100);
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([
      [55, 64], [60], [null, 48, 52, 55, 60, 64],
      [55, 67], [59], [43, 47, 50, 55, 59, 67],
    ]);
    expect(schedule.mock.calls.map((call) => Number((call[1] - schedule.mock.calls[0][1]).toFixed(4))))
      .toEqual([0, 1, 1.5, 2, 3, 3.5]);
    expect(schedule.mock.calls[0][3]).toEqual({ direction: 'down', gap: 0 });
    expect(schedule.mock.calls[3][3]).toEqual({ direction: 'down', gap: 0 });
    expect(onChord.mock.calls.map((call) => call[0])).toEqual([0, 1]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('mixes up/down strums, simultaneous picks and rests at the selected subdivision', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const pattern = { mode: 'custom' as const, stepsPerBeat: 2 as const, steps: [
      { kind: 'down' as const }, { kind: 'rest' as const }, { kind: 'up' as const }, { kind: 'pick' as const, strings: [0, 2] },
    ] };
    const onEnd = vi.fn();
    startProgressionPlayback([{ midi: [48, null, 55], beats: 2 }], 120, false, { onChord: vi.fn(), onEnd, onError: vi.fn() }, pattern);
    await vi.advanceTimersByTimeAsync(1100);
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([[48, null, 55], [48, null, 55], [48, 55]]);
    expect(schedule.mock.calls.map((call) => call[1] - schedule.mock.calls[0][1])).toEqual([0, 0.5, 0.75]);
    expect(schedule.mock.calls[0][3]).toMatchObject({ direction: 'down' });
    expect(schedule.mock.calls[1][3]).toMatchObject({ direction: 'up' });
    expect(schedule.mock.calls[2][3]).toEqual({ direction: 'down', gap: 0 });
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('makes rests silence ringing notes at the rest time, including consecutive short rests', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; onended: null }[] = [];
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => {
      const source = { stop: vi.fn(), onended: null }; sources.push(source); return [source];
    });
    audio.prepareStrummer.mockResolvedValue(schedule);
    startProgressionPlayback([{ midi: [48, 52], beats: 1 }], 240, false,
      { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      { mode: 'custom', stepsPerBeat: 4, steps: [
        { kind: 'pick', strings: [0] }, { kind: 'rest' }, { kind: 'rest' }, { kind: 'pick', strings: [1] },
      ] });
    await vi.advanceTimersByTimeAsync(400);
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([[48], [52]]);
    expect(sources[0].stop.mock.calls[0][0]).toBeCloseTo(schedule.mock.calls[0][1] + 0.0625, 6);
    // A later rest must not replace the earlier scheduled stop.
    expect(sources[0].stop.mock.calls.some(([time]) => time !== undefined && time > schedule.mock.calls[0][1] + 0.0626)).toBe(false);
  });

  it('does not postpone an earlier natural note end when scheduling a rest', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; onended: null }[] = [];
    const schedule = vi.fn(() => { const source = { stop: vi.fn(), onended: null }; sources.push(source); return [source]; });
    audio.prepareStrummer.mockResolvedValue(schedule);
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 4 }], 40, false,
      { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      { mode: 'custom', stepsPerBeat: 1, steps: [
        { kind: 'pick', strings: [0] }, { kind: 'pick', strings: [1] }, { kind: 'rest' }, { kind: 'rest' },
      ] });
    await vi.advanceTimersByTimeAsync(3000);
    // The first note's 2.8s limit is before the rest; the second still rings.
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(sources[1].stop).toHaveBeenCalledWith(3.05);
    player.stop();
  });

  it('does not let fast strums spill past a chord boundary', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: { gap?: number }) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const chords = [{ midi: [40, 45, 50, 55, 59, 64], beats: 1 }, { midi: [43, 47, 50, 55, 59, 67], beats: 1 }];
    startProgressionPlayback(chords, 240, false, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      { mode: 'custom', stepsPerBeat: 4, steps: [{ kind: 'down' }] });
    await vi.advanceTimersByTimeAsync(600);
    expect(schedule).toHaveBeenCalledTimes(8);
    const start = schedule.mock.calls[0][1];
    for (const [index, call] of schedule.mock.calls.entries()) {
      const boundary = start + (index < 4 ? 0.25 : 0.5);
      const gap = call[3]?.gap ?? 0.035;
      expect(call[1] + gap * 5 + call[2], `pattern step ${index + 1}`).toBeLessThanOrEqual(boundary + 1e-8);
    }
    schedule.mockClear();
    startProgressionPlayback(chords, 240, false, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(600);
    expect(schedule).toHaveBeenCalledTimes(2);
    const first = schedule.mock.calls[0];
    expect(first[1] + (first[3]?.gap ?? 0.035) * 5 + first[2]).toBeLessThanOrEqual(first[1] + 0.25 + 1e-8);
  });

  it('arpeggiates sounding strings in physical order, skipping muted strings and repeating', async () => {
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    startProgressionPlayback([{ midi: [null, 48, null, 55, 60], beats: 2 }], 120, false,
      { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }, { mode: 'arpeggio', stepsPerBeat: 2 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([[48], [55], [60], [48]]);
    expect(schedule.mock.calls.every((call) => (call[3] as { gap: number }).gap === 0)).toBe(true);
  });

  it('loops a custom pattern, cancels its sources, and does not fire missed steps in a burst', async () => {
    const sources: { stop: ReturnType<typeof vi.fn>; onended: null }[] = [];
    const schedule = vi.fn((_notes: (number | null)[], _when: number, _duration: number, _options?: unknown) => {
      const node = { stop: vi.fn(), onended: null }; sources.push(node); return [node];
    });
    audio.prepareStrummer.mockResolvedValue(schedule);
    const player = startProgressionPlayback([{ midi: [48, 52, 55], beats: 2 }], 120, true,
      { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      { mode: 'custom', stepsPerBeat: 2, steps: [{ kind: 'pick', strings: [0] }, { kind: 'pick', strings: [2] }] });
    await vi.advanceTimersByTimeAsync(350);
    expect(schedule.mock.calls.map((call) => call[0])).toEqual([[48], [55]]);
    vi.setSystemTime(5000);
    await vi.advanceTimersByTimeAsync(25);
    expect(schedule).toHaveBeenCalledTimes(3);
    expect(schedule.mock.calls[2][1]).toBeGreaterThanOrEqual(5);
    player.stop();
    expect(sources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(schedule).toHaveBeenCalledTimes(3);
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

  it('waits for a suspended audio context to resume before preparing or scheduling', async () => {
    let resume!: () => void;
    let state: 'suspended' | 'running' = 'suspended';
    audio.getAudioContext.mockReturnValue({
      get state() { return state; }, get currentTime() { return Date.now() / 1000; },
      resume: () => new Promise<void>((resolve) => { resume = () => { state = 'running'; resolve(); }; }),
    });
    const schedule = vi.fn(() => []);
    audio.prepareStrummer.mockResolvedValue(schedule);
    const onError = vi.fn();
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 1 }], 120, false, { onChord: vi.fn(), onEnd: vi.fn(), onError });
    await vi.advanceTimersByTimeAsync(100);
    expect(audio.prepareStrummer).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(audio.prepareStrummer).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    player.stop();
  });

  it('reports a failed or stuck audio resume, but not after the user stops', async () => {
    const onError = vi.fn();
    const callbacks = { onChord: vi.fn(), onEnd: vi.fn(), onError };
    audio.getAudioContext.mockReturnValue({ state: 'suspended', currentTime: 0, resume: vi.fn().mockRejectedValue(new Error('blocked')) });
    startProgressionPlayback([{ midi: [48, 52], beats: 1 }], 120, false, callbacks);
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(audio.prepareStrummer).not.toHaveBeenCalled();

    onError.mockClear();
    audio.getAudioContext.mockReturnValue({ state: 'suspended', currentTime: 0, resume: () => new Promise<void>(() => {}) });
    startProgressionPlayback([{ midi: [48, 52], beats: 1 }], 120, false, callbacks);
    await vi.advanceTimersByTimeAsync(5100);
    expect(onError).toHaveBeenCalledOnce();
    expect(audio.prepareStrummer).not.toHaveBeenCalled();

    onError.mockClear();
    const player = startProgressionPlayback([{ midi: [48, 52], beats: 1 }], 120, false, callbacks);
    player.stop();
    await vi.advanceTimersByTimeAsync(5100);
    expect(onError).not.toHaveBeenCalled();
  });

  it('stops and reports if the audio context is interrupted during playback', async () => {
    let state: 'running' | 'suspended' = 'running';
    audio.getAudioContext.mockReturnValue({ get state() { return state; }, get currentTime() { return Date.now() / 1000; } });
    const source = { stop: vi.fn(), onended: null };
    audio.prepareStrummer.mockResolvedValue(vi.fn(() => [source]));
    const onError = vi.fn(); const onEnd = vi.fn();
    startProgressionPlayback([{ midi: [48, 52], beats: 2 }], 120, true, { onChord: vi.fn(), onEnd, onError });
    await vi.advanceTimersByTimeAsync(100);
    state = 'suspended';
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
    expect(source.stop).toHaveBeenCalledOnce();
  });

  it('reports an interruption even after the final chord has been scheduled', async () => {
    let state: 'running' | 'suspended' = 'running';
    const context = new EventTarget();
    Object.defineProperties(context, { state: { get: () => state }, currentTime: { get: () => Date.now() / 1000 } });
    audio.getAudioContext.mockReturnValue(context);
    const source = { stop: vi.fn(), onended: null };
    audio.prepareStrummer.mockResolvedValue(vi.fn(() => [source]));
    const onError = vi.fn(); const onEnd = vi.fn();
    startProgressionPlayback([{ midi: [48, 52], beats: 2 }], 120, false, { onChord: vi.fn(), onEnd, onError });
    await vi.advanceTimersByTimeAsync(100);
    state = 'suspended';
    context.dispatchEvent(new Event('statechange'));
    expect(onError).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1500);
    expect(onEnd).not.toHaveBeenCalled();
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
    expect(() => startProgressionPlayback([{ midi: [48], beats: 1 }], 90, false, { onChord: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      { mode: 'custom', stepsPerBeat: 2, steps: [{ kind: 'pick', strings: [1] }] })).toThrow(/invalid/);
  });
});
