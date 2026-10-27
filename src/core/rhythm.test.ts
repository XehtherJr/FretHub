import { describe, expect, it } from 'vitest';
import { beatOffsetMs, describeTiming, isAudibleBeat } from './rhythm';

describe('timing coach', () => {
  it('measures early and late onsets against the nearest scheduled beat', () => {
    expect(beatOffsetMs(10.47, 10, 120)).toBeCloseTo(-30, 5);
    expect(beatOffsetMs(10.54, 10, 120)).toBeCloseTo(40, 5);
    expect(beatOffsetMs(10.54, 10, 120, 20)).toBeCloseTo(20, 5);
  });
  it('distinguishes consistently ahead, behind, on-time and variable playing', () => {
    expect(describeTiming([-42, -38, -45, -40], 120).summary).toBe('ahead');
    expect(describeTiming([36, 42, 39, 41], 120).summary).toBe('behind');
    expect(describeTiming([-5, 7, 2, -3], 120).summary).toBe('on-time');
    expect(describeTiming([-90, 85, -70, 95], 120).summary).toBe('inconsistent');
    expect(describeTiming([5, 6], 120).summary).toBe('listening');
  });
  it('keeps time through alternating audible and silent bars', () => {
    const states = Array.from({ length: 12 }, (_, beat) => isAudibleBeat(beat, 4, 1, 1));
    expect(states).toEqual([true, true, true, true, false, false, false, false, true, true, true, true]);
    expect(isAudibleBeat(8, 4, 2, 1)).toBe(false);
    expect(isAudibleBeat(12, 4, 2, 1)).toBe(true);
  });
});
