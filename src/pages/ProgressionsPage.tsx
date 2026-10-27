import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  diatonicTriads, diatonicSevenths, buildProgression,
  PROGRESSION_TEMPLATES, ProgressionChord,
} from '@core/progressions';
import { buildChord } from '@core/chords';
import { ROOT_NOTES } from '@core/notes';
import { getTuning } from '@core/tunings';
import { generateVoicings } from '@core/voicing-engine';
import { playMidi, isAudioSupported, getAudioContext } from '@core/audio';
import ChordDiagram from '@/components/ChordDiagram';
import { chordPath } from '@/lib/urls';

const FUNCTION_LABEL: Record<string, string> = {
  tonic: 'T — tonic',
  subdominant: 'SD — subdominant',
  dominant: 'D — dominant',
  other: '—',
};

export default function ProgressionsPage() {
  const [root, setRoot] = useState('C');
  const [templateId, setTemplateId] = useState(PROGRESSION_TEMPLATES[0].id);
  const [custom, setCustom] = useState<string[]>([]);
  const tuning = getTuning('standard');

  const triads = useMemo(() => diatonicTriads(root), [root]);
  const sevenths = useMemo(() => diatonicSevenths(root), [root]);
  const template = PROGRESSION_TEMPLATES.find((t) => t.id === templateId) ?? PROGRESSION_TEMPLATES[0];
  const progression = useMemo(() => buildProgression(root, template), [root, template]);

  const customChords: ProgressionChord[] = useMemo(() => {
    return custom.map((numeral) => {
      const useSeventh = numeral.includes('7');
      const table = useSeventh ? sevenths : triads;
      const degree = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'].indexOf(
        numeral.toLowerCase().replace(/[^iv]/g, ''),
      );
      const entry = table[degree];
      return { roman: numeral, chordTypeId: entry.chordTypeId, rootPc: entry.rootPc, rootName: entry.rootName };
    });
  }, [custom, triads, sevenths]);

  // Schedule one chord per bar on the shared audio clock, strumming each voicing.
  const playSequence = async (chords: ProgressionChord[]) => {
    if (!isAudioSupported()) return;
    const audio = getAudioContext();
    for (const pc of chords) {
      const chord = buildChord(pc.rootPc, pc.chordTypeId);
      const [voicing] = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxResults: 1 });
      if (voicing) {
        const when = audio.currentTime + 0.02;
        voicing.midi.filter((m): m is number => m !== null).forEach((midi, i) => {
          playMidi(midi, { when: when + i * 0.035, duration: 1.8 });
        });
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
  };

  return (
    <div className="page">
      <p className="eyebrow">Chord progression explorer</p>
      <h1>Progressions & harmonic function</h1>
      <p className="lead">
        Roman numerals describe relationships, not fixed notes — pick a key and every progression
        and diatonic chord is recalculated instantly. Play any sequence to hear the movement.
      </p>

      <div className="card">
        <div className="form-row">
          <div className="field">
            <label htmlFor="key">Key</label>
            <select id="key" value={root} onChange={(e) => setRoot(e.target.value)}>
              {ROOT_NOTES.map((n) => <option key={n} value={n}>{n} major</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="template">Progression template</label>
            <select id="template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {PROGRESSION_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name} — {t.style}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button type="button" className="btn btn-primary" onClick={() => playSequence(progression)}>
              ▶ Play progression
            </button>
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>{template.description}</p>
      </div>

      <h2 className="section-title">Diatonic chords of {root} major</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Degree</th><th>Roman</th><th>Triad</th><th>Seventh</th><th>Function</th>
            </tr>
          </thead>
          <tbody>
            {triads.map((triad, i) => {
              const sev = sevenths[i];
              return (
                <tr key={triad.degree}>
                  <td className="faint">{triad.degree}</td>
                  <td><strong>{triad.roman}</strong></td>
                  <td>
                    <Link to={chordPath(triad.rootName, triad.chordTypeId)}>
                      {buildChord(triad.rootPc, triad.chordTypeId).shortName}
                    </Link>
                  </td>
                  <td>
                    <Link to={chordPath(sev.rootName, sev.chordTypeId)}>
                      {buildChord(sev.rootPc, sev.chordTypeId).shortName}
                    </Link>
                  </td>
                  <td><span className="pill cool">{FUNCTION_LABEL[triad.function]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">{template.name} in {root}</h2>
      <div className="grid grid-4">
        {progression.map((pc, i) => {
          const chord = buildChord(pc.rootPc, pc.chordTypeId);
          const [voicing] = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxResults: 1 });
          return (
            <div className="card" key={`${pc.roman}-${i}`} style={{ textAlign: 'center' }}>
              <span className="pill">{pc.roman}</span>
              {voicing && (
                <ChordDiagram voicing={voicing} tuning={tuning} name={chord.shortName} compact showNotes={false} />
              )}
              <Link to={chordPath(chord.rootName, chord.typeId)} className="small">
                {chord.fullName}
              </Link>
            </div>
          );
        })}
      </div>

      <h2 className="section-title">Build your own</h2>
      <div className="card">
        <p className="small muted">
          Add Roman numerals in sequence. Upper-case numerals are major, lower-case minor/diminished
          (the diatonic table above shows which is which).
        </p>
        <div className="row" style={{ marginBottom: '0.8rem' }}>
          {triads.map((t) => (
            <button key={t.roman} type="button" className="btn btn-sm" onClick={() => setCustom((c) => [...c, t.roman])}>
              {t.roman}
            </button>
          ))}
          {sevenths.map((t) => (
            <button
              key={`${t.roman}7`}
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setCustom((c) => [...c, `${t.roman}7`])}
            >
              {t.roman}7
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" disabled={customChords.length === 0} onClick={() => playSequence(customChords)}>
            ▶ Play sequence
          </button>
          <button type="button" className="btn btn-sm" disabled={custom.length === 0} onClick={() => setCustom([])}>
            Clear
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={custom.length === 0} onClick={() => setCustom((c) => c.slice(0, -1))}>
            Undo last
          </button>
        </div>

        {customChords.length > 0 && (
          <div className="grid grid-4" style={{ marginTop: '1rem' }}>
            {customChords.map((pc, i) => {
              const chord = buildChord(pc.rootPc, pc.chordTypeId);
              const [voicing] = generateVoicings(chord.pitchClasses, tuning, chord.rootPc, { maxResults: 1 });
              return (
                <div className="card" key={i} style={{ textAlign: 'center' }}>
                  <span className="pill">{pc.roman}</span>
                  {voicing && (
                    <ChordDiagram voicing={voicing} tuning={tuning} name={chord.shortName} compact showNotes={false} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
