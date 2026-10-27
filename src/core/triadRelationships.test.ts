import { describe, expect, it } from 'vitest';
import { buildChord } from './chords';
import { intervalSemitones } from './intervals';
import { ROOT_NOTES } from './notes';
import { buildScale } from './scales';
import { getTuning } from './tunings';
import { fretPc } from './voicing-engine';
import { cagedMajorPositions, changesFromMajor, neckPositions, qualityForTriadIntervals, sameRootScalesContaining, thirdTask } from './triadRelationships';

describe('triad relationships', () => {
  it('compares interval roles and uses interval-correct spelling', () => {
    expect(buildChord('C', 'major').tones.map((tone) => [tone.name, tone.pc, tone.interval])).toEqual([['C', 0, '1'], ['E', 4, '3'], ['G', 7, '5']]);
    expect(buildChord('C', 'minor').tones.map((tone) => [tone.name, tone.pc, tone.interval])).toEqual([['C', 0, '1'], ['Eb', 3, 'b3'], ['G', 7, '5']]);
    expect(changesFromMajor(buildChord('C', 'minor')).map((change) => [change.role, change.from.name, change.to.name, change.semitones])).toEqual([['third', 'E', 'Eb', -1]]);
    expect(changesFromMajor(buildChord('C', 'diminished')).map((change) => [change.role, change.to.name, change.semitones])).toEqual([['third', 'Eb', -1], ['fifth', 'Gb', -1]]);
    expect(changesFromMajor(buildChord('C', 'augmented')).map((change) => [change.role, change.to.name, change.semitones])).toEqual([['fifth', 'G#', 1]]);
    expect(buildChord('Db', 'minor').tones.map((tone) => tone.name)).toEqual(['Db', 'Fb', 'Ab']);
    expect(qualityForTriadIntervals(['1', 'b3', '5'])).toBe('minor');
    expect(qualityForTriadIntervals(['1', '2', '5'])).toBeUndefined();
  });

  it('only suggests same-root scales containing every chord tone', () => {
    const minor = buildChord('D', 'minor');
    const names = sameRootScalesContaining(minor).map((scale) => scale.id);
    expect(names).toContain('dorian');
    expect(names).toContain('natural-minor');
    expect(names).not.toContain('major');
    for (const scale of sameRootScalesContaining(minor)) {
      const pcs = buildScale('D', scale.id).map((note) => note.pc);
      expect(minor.pitchClasses.every((pc) => pcs.includes(pc))).toBe(true);
    }
    expect(buildScale('D', 'natural-minor').find((note) => note.degree === 6)?.name).toBe('Bb');
    expect(buildScale('D', 'dorian').find((note) => note.degree === 6)?.name).toBe('B');
    for (const root of ROOT_NOTES) for (const quality of ['major', 'minor', 'diminished', 'augmented']) {
      const chord = buildChord(root, quality);
      const compatible = sameRootScalesContaining(chord);
      expect(compatible.length).toBeGreaterThan(0);
      for (const scale of compatible) {
        const pcs = buildScale(root, scale.id).map((note) => note.pc);
        expect(chord.pitchClasses.every((pc) => pcs.includes(pc))).toBe(true);
      }
    }
  });

  it('maps every playable position through the shared tuning and capo math', () => {
    const tuning = getTuning('drop-d');
    const chord = buildChord('D', 'minor');
    const positions = neckPositions(tuning, 2, 12);
    expect(positions).toHaveLength(6 * 11); // open/capo plus physical frets 3 through 12
    expect(positions.find((p) => p.stringIndex === 0 && p.fret === 0)).toMatchObject({ pc: 4, midi: 40 });
    expect(positions.some((p) => p.fret === 1 || p.fret === 2)).toBe(false);
    for (const position of positions.filter((p) => chord.pitchClasses.includes(p.pc))) {
      expect(position.pc).toBe(fretPc(tuning, position.stringIndex, position.fret === 0 ? 2 : position.fret));
      expect(chord.tones.some((tone) => tone.pc === position.pc)).toBe(true);
    }
  });

  it('transposes E and A major forms correctly in every key, including with a capo', () => {
    const tuning = getTuning('standard');
    for (const root of ROOT_NOTES) for (const capo of [0, 2, 7]) for (const form of ['E', 'A'] as const) {
      const chord = buildChord(root, 'major');
      const positions = cagedMajorPositions(chord, tuning, capo, form)!;
      expect(new Set(positions.map((position) => position.pc))).toEqual(new Set(chord.pitchClasses));
      const rootString = form === 'E' ? 0 : 1;
      expect(positions.find((position) => position.stringIndex === rootString)?.pc).toBe(chord.rootPc);
      for (const position of positions) {
        expect(position.pc).toBe(fretPc(tuning, position.stringIndex, position.fret === 0 ? capo : position.fret));
      }
    }
    expect(cagedMajorPositions(buildChord('C', 'minor'), tuning, 0, 'E')).toBeNull();
    expect(cagedMajorPositions(buildChord('C', 'major'), getTuning('drop-d'), 0, 'E')).toBeNull();
  });

  it('creates reachable third-finding tasks that transfer to a different key and string', () => {
    const tuning = getTuning('standard');
    const first = buildChord('C', 'minor');
    const next = buildChord('F', 'minor');
    const firstTask = thirdTask(first, tuning, 0, 12)!;
    const nextTask = thirdTask(next, tuning, 0, 12, firstTask.stringIndex)!;
    expect(firstTask.third.name).toBe('Eb');
    expect(nextTask.third.name).toBe('Ab');
    expect(nextTask.stringIndex).not.toBe(firstTask.stringIndex);
    for (const [chord, task] of [[first, firstTask], [next, nextTask]] as const) {
      expect(intervalSemitones(task.third.interval)).toBe(3);
      expect(neckPositions(tuning, 0, 12).some((position) => position.stringIndex === task.stringIndex && position.fret >= task.minimumFret && position.pc === task.third.pc)).toBe(true);
      expect(task.third.pc).toBe(chord.tones[1].pc);
    }
  });
});
