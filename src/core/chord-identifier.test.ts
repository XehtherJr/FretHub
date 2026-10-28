import { describe, it, expect } from 'vitest';
import { describeMatch, identifyChord } from './chord-identifier';
import { buildChord } from './chords';
import { CHORD_TYPES } from './chord-definitions';
import { intervalSemitones } from './intervals';
import { noteToPc, normalizePc } from './notes';

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

  it('recognizes seventh shells without calling an unaltered voicing 7alt', () => {
    const matches = identifyChord(pcs(['C', 'E', 'Bb']), noteToPc('C'));
    const seventh = matches.find((match) => match.chord.rootName === 'C' && match.chord.typeId === 'dominant-7');
    expect(seventh).toMatchObject({ strength: 'partial', missingPcs: [noteToPc('G')], rootAssumed: false });
    expect(describeMatch(seventh!)).toContain('Not played: G');
    expect(matches.some((match) => match.chord.rootName === 'C' && match.chord.typeId === 'dominant-alt')).toBe(false);
    expect(identifyChord(pcs(['C', 'E', 'Bb', 'Db']), noteToPc('C')).some((match) => match.chord.typeId === 'dominant-alt' && match.chord.rootName === 'C')).toBe(true);
  });

  it.each([
    ['C', [48, 52, 55, 60, 64], 'major'],
    ['G', [43, 47, 50, 55, 59, 67], 'major'],
    ['Em', [40, 47, 52, 55, 59, 64], 'minor'],
    ['D/F#', [42, 50, 57, 62, 66], 'major'],
    ['Cmaj7', [48, 52, 55, 59, 64], 'major-7'],
    ['G7', [43, 47, 50, 55, 59, 65], 'dominant-7'],
  ])('recognizes common played guitar shapes: %s', (symbol, midis, typeId) => {
    const matches = identifyChord(midis.map(normalizePc), normalizePc(Math.min(...midis)), { midis });
    expect(matches.some((match) => match.chord.shortName === symbol && match.chord.typeId === typeId && match.strength === 'exact')).toBe(true);
  });

  it('labels incomplete two-note triads rather than claiming they are complete', () => {
    const match = identifyChord(pcs(['C', 'E']), noteToPc('C')).find((item) => item.chord.typeId === 'major');
    expect(match).toMatchObject({ strength: 'partial', missingPcs: [noteToPc('G')] });
    expect(identifyChord(pcs(['C', 'C']), noteToPc('C'))).toEqual([]);
  });

  it.each([
    ['C9sus4', ['C', 'F', 'G', 'Bb', 'D'], 'dominant-9-sus4'],
    ['C7sus2', ['C', 'D', 'G', 'Bb'], 'dominant-7-sus2'],
    ['Cmaj7#5', ['C', 'E', 'G#', 'B'], 'major-7sharp5'],
    ['CmMaj9', ['C', 'Eb', 'G', 'B', 'D'], 'minor-major-9'],
    ['Cm9b5', ['C', 'Eb', 'Gb', 'Bb', 'D'], 'half-diminished-9'],
    ['C9b5', ['C', 'E', 'Gb', 'Bb', 'D'], 'dominant-9b5'],
    ['C7b5b9', ['C', 'E', 'Gb', 'Bb', 'Db'], 'dominant-7b5b9'],
  ])('recognizes the expanded vocabulary: %s', (_name, notes, typeId) => {
    const matches = identifyChord(pcs(notes), noteToPc('C'));
    expect(matches.some((match) => match.chord.rootName === 'C' && match.chord.typeId === typeId && match.strength === 'exact')).toBe(true);
  });

  it('recognizes a minor eleventh without the ninth but labels the omission', () => {
    const matches = identifyChord(pcs(['D', 'F', 'A', 'C', 'G']), noteToPc('D'));
    expect(matches.find((match) => match.chord.rootName === 'D' && match.chord.typeId === 'minor-11'))
      .toMatchObject({ strength: 'partial', missingPcs: [noteToPc('E')] });
  });

  it('recognizes a specific So What voicing only from the actual note registers', () => {
    const notes = pcs(['D', 'G', 'C', 'F', 'A']);
    const id = (midis?: number[]) => identifyChord(notes, noteToPc('D'), { midis });
    expect(id().some((match) => match.chord.typeId === 'so-what')).toBe(false);
    expect(id([50, 55, 60, 65, 69]).find((match) => match.chord.rootName === 'D' && match.chord.typeId === 'so-what'))
      .toMatchObject({ strength: 'exact' });
    expect(id([50, 53, 55, 60, 69]).some((match) => match.chord.typeId === 'so-what')).toBe(false);
    expect(id([50, 55, 60, 65, 70]).some((match) => match.chord.typeId === 'so-what')).toBe(false);
  });

  it('includes complete upper chords with a non-chord bass, clearly separated from inversions', () => {
    const notes = pcs(['C', 'D', 'F#', 'A']);
    const matches = identifyChord(notes, noteToPc('C'));
    expect(matches[0]).toMatchObject({ chord: { shortName: 'D7/C' }, strength: 'exact' });
    const slash = matches.find((match) => match.chord.shortName === 'D/C');
    expect(slash).toMatchObject({ strength: 'slash', extraPcs: [noteToPc('C')], missingPcs: [], chord: { isInversion: false } });
    expect(describeMatch(slash!)).toContain('non-chord bass, not an inversion');
    expect(identifyChord(notes, noteToPc('D')).some((match) => match.chord.shortName === 'D/C')).toBe(false);
    expect(identifyChord(pcs(['C', 'G', 'D']), noteToPc('C')).find((match) => match.chord.shortName === 'G5/C'))
      .toMatchObject({ strength: 'slash', extraPcs: [noteToPc('C')] });
    // An impossible, unselected bass must not produce a phantom slash note.
    expect(identifyChord(pcs(['C', 'E', 'G']), noteToPc('D'))[0].chord.shortName).toBe('C');
  });

  it('only considers an unheard root when the player explicitly chooses it', () => {
    const notes = pcs(['E', 'G', 'Bb', 'D']);
    expect(identifyChord(notes, noteToPc('E')).some((match) => match.chord.rootPc === noteToPc('C'))).toBe(false);
    const rootless = identifyChord(notes, noteToPc('E'), { assumedRoot: noteToPc('C') });
    const c9 = rootless.find((match) => match.chord.typeId === 'dominant-9');
    expect(c9).toMatchObject({ strength: 'partial', rootAssumed: true, missingPcs: [noteToPc('C')], chord: { shortName: 'C9/E' } });
    expect(describeMatch(c9!)).toContain('Root C assumed, not played');

    // A rootless third-and-seventh shell is useful, but only with an explicit root.
    const guideTones = pcs(['E', 'Bb']);
    expect(identifyChord(guideTones, noteToPc('E')).some((match) => match.chord.rootPc === noteToPc('C'))).toBe(false);
    const shell = identifyChord(guideTones, noteToPc('E'), { assumedRoot: noteToPc('C') })
      .find((match) => match.chord.typeId === 'dominant-7');
    expect(shell).toMatchObject({ strength: 'partial', rootAssumed: true, missingPcs: [noteToPc('C'), noteToPc('G')], chord: { shortName: 'C7/E' } });
    expect(describeMatch(shell!)).toContain('Bass note E in the assumed chord');
  });

  it('finds each declared formula in all twelve transpositions without a result cap', () => {
    for (let root = 0; root < 12; root++) for (const type of CHORD_TYPES) {
      const chord = buildChord(root, type.id);
      const midis = type.voicingPattern?.map((semitones) => 60 + root + semitones);
      const match = identifyChord(chord.pitchClasses, root, { midis }).find((item) => item.chord.rootPc === root && item.chord.typeId === type.id);
      expect(match, `${root} ${type.id}`).toMatchObject({ strength: 'exact', missingPcs: [], extraPcs: [] });
    }
  });

  it('never marks an unsupported pitch set exact or hides a required alteration', () => {
    for (let mask = 1; mask < 4096; mask++) {
      const notes = Array.from({ length: 12 }, (_, pc) => pc).filter((pc) => mask & (1 << pc));
      if (notes.length < 2 || notes.length > 6) continue;
      for (const match of identifyChord(notes, notes[0])) {
        const type = CHORD_TYPES.find((item) => item.id === match.chord.typeId)!;
        const expected = new Set(match.chord.pitchClasses.filter((pc) => !match.missingPcs.includes(pc)).concat(match.extraPcs));
        expect([...expected].sort((a, b) => a - b)).toEqual(notes);
        if (match.strength === 'exact') expect(match.missingPcs.length + match.extraPcs.length).toBe(0);
        if (type.requireOneOf) expect(type.requireOneOf.some((sym) => notes.includes(normalizePc(match.chord.rootPc + intervalSemitones(sym))))).toBe(true);
      }
    }
  }, 12000);

  it('returns nothing for empty input', () => {
    expect(identifyChord([])).toEqual([]);
  });
});
