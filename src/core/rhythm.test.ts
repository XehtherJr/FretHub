import { describe, expect, it } from 'vitest';
import { beatOffsetMs, clickAccent, describeTiming, isAudibleBeat, TIME_SIGNATURES } from './rhythm';

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

describe('meter and grouping', () => {
  const meter = (id: string) => TIME_SIGNATURES.find((item) => item.id === id)!;
  const accents = (id: string, groups = meter(id).groups) => Array.from({ length: meter(id).numerator }, (_, beat) => clickAccent(beat, meter(id), groups));
  it('retains quarter-note meters and represents compound and asymmetric eighth-note groups', () => {
    expect(TIME_SIGNATURES.map((item) => item.id)).toEqual(['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '6/8', '7/8', '12/8']);
    for (const signature of TIME_SIGNATURES) expect(signature.groups.reduce((sum, size) => sum + size, 0)).toBe(signature.numerator);
    expect(accents('3/4')).toEqual([true, false, false]);
    expect(accents('6/8')).toEqual([true, false, false, 'group', false, false]);
    expect(accents('7/8')).toEqual([true, false, 'group', false, 'group', false, false]);
    expect(accents('7/8', [2, 3, 2])).toEqual([true, false, 'group', false, false, 'group', false]);
    expect(accents('7/8', [3, 2, 2])).toEqual([true, false, false, 'group', false, 'group', false]);
    expect(accents('12/8')).toEqual([true, false, false, 'group', false, false, 'group', false, false, 'group', false, false]);
    expect(clickAccent(12, meter('12/8'))).toBe(true);
  });
  it('counts whole /8 bars in disappearing mode rather than treating a dotted beat as a bar', () => {
    for (const count of [6, 7, 12]) {
      const states = Array.from({ length: count * 2 + 1 }, (_, pulse) => isAudibleBeat(pulse, count, 1, 1));
      expect(states).toEqual([...Array(count).fill(true), ...Array(count).fill(false), true]);
    }
  });
});
