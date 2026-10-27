import { describe, expect, it } from 'vitest';
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
