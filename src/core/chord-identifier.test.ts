import { describe, it, expect } from 'vitest';
import { identifyChord } from './chord-identifier';
import { noteToPc } from './notes';

const pcs = (names: string[]) => names.map(noteToPc);

describe('chord identification', () => {
  it('identifies a C major triad as an exact match', () => {
    const matches = identifyChord(pcs(['C', 'E', 'G']));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].chord.rootName).toBe('C');
    expect(matches[0].chord.typeId).toBe('major');
    expect(matches[0].strength).toBe('exact');
  });

  it('identifies G7 from its four notes', () => {
    const matches = identifyChord(pcs(['G', 'B', 'D', 'F']));
    const g7 = matches.find((m) => m.chord.rootName === 'G' && m.chord.typeId === 'dominant-7');
    expect(g7).toBeTruthy();
    expect(g7!.strength).toBe('exact');
  });

  it('finds both C6 and Am7 for the shared pitch set C E G A', () => {
    const matches = identifyChord(pcs(['C', 'E', 'G', 'A']));
    const ids = matches.map((m) => `${m.chord.rootName} ${m.chord.typeId}`);
    expect(ids).toContain('C sixth');
    expect(ids).toContain('A minor-7');
  });

  it('ranks the bass-note chord first when a bass is supplied', () => {
    const matches = identifyChord(pcs(['C', 'E', 'G', 'A']), noteToPc('A'));
    expect(matches[0].chord.rootName).toBe('A');
    expect(matches[0].chord.typeId).toBe('minor-7');
    expect(matches[0].chord.isInversion).toBe(false);
  });

  it('recognizes a diminished seventh and power chords', () => {
    const dim = identifyChord(pcs(['C#', 'E', 'G', 'Bb']));
    expect(dim.some((m) => m.chord.typeId === 'diminished-7')).toBe(true);

    const power = identifyChord(pcs(['E', 'B']));
    expect(power.some((m) => m.chord.typeId === 'power' && m.chord.rootName === 'E')).toBe(true);
  });

  it('returns partial matches when an omittable fifth is missing', () => {
    // C E Bb D without the fifth G still reads as C9
    const matches = identifyChord(pcs(['C', 'E', 'Bb', 'D']));
    const c9 = matches.find((m) => m.chord.rootName === 'C' && m.chord.typeId === 'dominant-9');
    expect(c9).toBeTruthy();
    expect(c9!.strength).toBe('partial');
    expect(c9!.missingPcs).toContain(noteToPc('G'));
  });

  it('rejects pitch sets that fit no definition', () => {
    // C Db Gb B — no standard chord formula matches exactly
    const matches = identifyChord(pcs(['C', 'Db', 'Gb', 'B']));
    expect(matches.length).toBe(0);
  });

  it('returns nothing for empty input', () => {
    expect(identifyChord([])).toEqual([]);
  });
});
