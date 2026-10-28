import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { nearestSamplePitch, samplePlaybackRate } from './audio';

describe('acoustic guitar sample bank', () => {
  it('ships real local WAV recordings for every sample pitch', () => {
    for (const pitch of [40, 43, 46, 49, 52, 55, 58, 61, 64, 68, 71, 74, 77, 80, 83]) {
      const file = readFileSync(`${process.cwd()}/public/audio/guitar/${pitch}.wav`);
      expect(file.toString('ascii', 0, 4)).toBe('RIFF');
      expect(file.toString('ascii', 8, 12)).toBe('WAVE');
      expect(file.length).toBeGreaterThan(30000);
    }
  });
  it('chooses nearby recordings and compensates their measured pitch', () => {
    expect(nearestSamplePitch(40)).toBe(40);
    expect(nearestSamplePitch(45)).toBe(46);
    expect(nearestSamplePitch(64)).toBe(64);
    expect(samplePlaybackRate(40, 40)).toBeCloseTo(2 ** (7 / 1200), 7);
    expect(samplePlaybackRate(45, 46)).toBeCloseTo(2 ** (-1 / 12 + 3 / 1200), 7);
  });
});

describe('scheduled guitar sequences', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('resolves a reference only after the sample has loaded and finished sounding', async () => {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const source = { buffer: null, playbackRate: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    class FakeAudioContext {
      currentTime = 5;
      state = 'running';
      destination = {};
      createGain() { return { gain: param(), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createBufferSource() { return source; }
      decodeAudioData() { return Promise.resolve({ duration: 2 }); }
    }
    let release: (() => void) | undefined;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); })));
    const { playMidi } = await import('./audio');
    let finished = false;
    const playing = playMidi(40).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    release!();
    await vi.waitFor(() => expect(source.onended).not.toBeNull());
    expect(finished).toBe(false);
    source.onended!();
    await playing;
    expect(finished).toBe(true);
  });

  it('waits for a synthesized reference to finish when its sample fails', async () => {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const oscillator = { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
    class FakeAudioContext {
      currentTime = 5;
      state = 'running';
      destination = {};
      createGain() { return { gain: param(), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createOscillator() { return oscillator; }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { playMidi } = await import('./audio');
    let finished = false;
    const playing = playMidi(40).then(() => { finished = true; });
    await vi.waitFor(() => expect(oscillator.onended).not.toBeNull());
    expect(finished).toBe(false);
    oscillator.onended!();
    await playing;
    expect(finished).toBe(true);
  });

  it('prepares progression samples once and returns cancellable sources in string order', async () => {
    const started: { kind: string; when: number }[] = [];
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    class FakeAudioContext {
      currentTime = 5; state = 'running'; destination = {};
      createGain() { return { gain: param(), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createBufferSource() { return { buffer: null, playbackRate: param(), connect: vi.fn(), start: (when: number) => started.push({ kind: 'sample', when }), stop: vi.fn() }; }
      createOscillator() { return { type: '', frequency: param(), connect: vi.fn(), start: (when: number) => started.push({ kind: 'fallback', when }), stop: vi.fn() }; }
      decodeAudioData() { return Promise.resolve({ duration: 3 }); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const fetcher = vi.fn((url: string) => url.endsWith('/61.wav')
      ? Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
      : Promise.reject(new Error('sample unavailable')));
    vi.stubGlobal('fetch', fetcher);
    const { getAudioContext, prepareStrummer } = await import('./audio');
    const schedule = await prepareStrummer(getAudioContext(), [60, 64, 60]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const sources = schedule([60, null, 64], 6, 1);
    expect(started).toEqual([{ kind: 'sample', when: 6 }, { kind: 'fallback', when: 6.035 }]);
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => typeof source.stop === 'function')).toBe(true);
  });

  it('stops an already-scheduled string if a later string cannot be created', async () => {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    const first = { buffer: null, playbackRate: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    let count = 0;
    class FakeAudioContext {
      currentTime = 5; state = 'running'; destination = {};
      createGain() { return { gain: param(), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createBufferSource() { if (++count === 2) throw new Error('audio closed'); return first; }
      decodeAudioData() { return Promise.resolve({ duration: 3 }); }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
    const { getAudioContext, prepareStrummer } = await import('./audio');
    const schedule = await prepareStrummer(getAudioContext(), [60, 64]);
    expect(() => schedule([60, 64], 6, 1)).toThrow('audio closed');
    expect(first.stop).toHaveBeenCalledTimes(2); // Original scheduled end, then immediate cancellation.
    expect(first.stop).toHaveBeenLastCalledWith();
  });

  it('waits for slow samples and schedules a failed sample as a synth in the right order', async () => {
    const started: { kind: string; when: number }[] = [];
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
    class FakeAudioContext {
      currentTime = 5;
      state = 'running';
      destination = {};
      createGain() { return { gain: param(), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createBufferSource() { return { buffer: null, playbackRate: param(), connect: vi.fn(), start: (when: number) => started.push({ kind: 'sample', when }), stop: vi.fn() }; }
      createOscillator() { return { type: '', frequency: param(), connect: vi.fn(), start: (when: number) => started.push({ kind: 'fallback', when }), stop: vi.fn() }; }
      decodeAudioData() { return Promise.resolve({ duration: 3 }); }
    }
    let releaseFirst: (() => void) | undefined;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/61.wav')
      ? new Promise((resolve) => { releaseFirst = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); })
      : Promise.reject(new Error('sample unavailable'))));
    const { playSequence, strum } = await import('./audio');
    playSequence([60, 64], 0.4, 0.8);
    await Promise.resolve();
    expect(started).toHaveLength(0);
    expect(releaseFirst).toBeDefined();
    releaseFirst!();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started).toEqual([{ kind: 'sample', when: 5.01 }, { kind: 'fallback', when: 5.41 }]);
    started.length = 0;
    strum([64, null, 60], 'up');
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(started[0].kind).toBe('sample');
    expect(started[1].kind).toBe('fallback');
    expect(started[1].when - started[0].when).toBeCloseTo(0.035);
  });
});

describe('metronome click accents', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('uses distinct strengths for bar, group and ordinary clicks', async () => {
    const frequencies: number[] = [];
    const levels: number[] = [];
    const param = (record?: number[]) => ({ value: 0, setValueAtTime: (value: number) => record?.push(value), exponentialRampToValueAtTime: vi.fn() });
    class FakeAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      createGain() { return { gain: param(levels), connect: vi.fn() }; }
      createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: vi.fn() }; }
      createOscillator() { return { type: '', frequency: param(frequencies), connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { playClick } = await import('./audio');
    playClick(true, 11);
    playClick('group', 12);
    playClick(false, 13);
    expect(frequencies).toEqual([1450, 1150, 900]);
    expect(levels).toEqual([0.23, 0.18, 0.14]);
  });
});
