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
