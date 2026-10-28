import { useEffect, useState } from 'react';
import type { Tuning } from '@core/tunings';
import type { StepsPerBeat } from '@core/pickingPattern';

export type PatternMode = 'single' | 'arpeggio' | 'custom';

interface Props {
  tuning: Tuning;
  mode: PatternMode;
  stepsPerBeat: StepsPerBeat;
  text: string;
  error: string | null;
  onModeChange: (mode: PatternMode) => void;
  onTimingChange: (value: StepsPerBeat) => void;
  onTextChange: (value: string) => void;
}

export default function ProgressionPatternEditor({ tuning, mode, stepsPerBeat, text, error, onModeChange, onTimingChange, onTextChange }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => { setSelected([]); }, [tuning.id]);
  const append = (step: string) => onTextChange([text.trim(), step].filter(Boolean).join(' '));
  const addSelected = () => {
    if (!selected.length) return;
    append([...selected].sort((a, b) => a - b).map((index) => tuning.strings.length - index).join('+'));
    setSelected([]);
  };
  return (
    <section className="progression-pattern" aria-labelledby="progression-pattern-heading">
      <h3 id="progression-pattern-heading">Picking &amp; strumming</h3>
      <div className="progression-pattern-controls">
        <div className="field">
          <label htmlFor="progression-pattern-mode">Playback style</label>
          <select id="progression-pattern-mode" value={mode} onChange={(event) => onModeChange(event.target.value as PatternMode)}>
            <option value="single">One downstrum per chord</option>
            <option value="arpeggio">Arpeggiate: bass-side to treble-side</option>
            <option value="custom">Custom picking / strumming pattern</option>
          </select>
        </div>
        {mode !== 'single' && <div className="field">
          <label htmlFor="progression-pattern-timing">Step timing</label>
          <select id="progression-pattern-timing" value={stepsPerBeat} onChange={(event) => onTimingChange(Number(event.target.value) as StepsPerBeat)}>
            <option value={1}>Quarter notes · 1 per beat</option>
            <option value={2}>Eighth notes · 2 per beat</option>
            <option value={3}>Triplets · 3 per beat</option>
            <option value={4}>Sixteenth notes · 4 per beat</option>
          </select>
        </div>}
      </div>
      {mode !== 'single' && <p className="small muted">The pattern repeats within each chord and restarts at the next chord. {mode === 'arpeggio' ? 'It skips muted strings and follows string order, which may not be ascending pitch.' : 'Muted strings are silent.'}</p>}
      {mode === 'custom' && <div className="progression-pattern-custom">
        <div className="field">
          <label htmlFor="progression-pattern-text">Pattern steps</label>
          <input id="progression-pattern-text" value={text} maxLength={1024} placeholder="5 4 3 2 3 3+1" aria-invalid={!!error} aria-describedby="progression-pattern-help progression-pattern-error" onChange={(event) => onTextChange(event.target.value)} />
        </div>
        <p id="progression-pattern-help" className="small muted">Separate steps with spaces or dashes. Use string names or numbers; <code>+</code> picks strings together. Add <code>down</code>, <code>up</code>, or <code>rest</code> as steps. For example: <code>5 4 3 2 3 3+1</code>.</p>
        <p className="small faint">Open tuning, before the capo: {tuning.strings.map((string, index) => `${tuning.strings.length - index} ${string.label}`).join(' · ')}. Use the octave or string number when a name is repeated.</p>
        <p id="progression-pattern-error" className="small pattern-error" role="status" aria-live="polite">{error ?? 'Pattern ready.'}</p>
        <details className="pattern-composer">
          <summary>Build steps with buttons</summary>
          <fieldset>
            <legend>Strings to pick together</legend>
            <div className="pattern-string-options">
              {tuning.strings.map((string, index) => <label key={index}>
                <input type="checkbox" checked={selected.includes(index)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} />
                {tuning.strings.length - index} · {string.label}
              </label>)}
            </div>
          </fieldset>
          <div className="row pattern-composer-actions">
            <button type="button" className="btn btn-sm" disabled={!selected.length} onClick={addSelected}>Add picked step</button>
            <button type="button" className="btn btn-sm" onClick={() => append('down')}>Add down strum</button>
            <button type="button" className="btn btn-sm" onClick={() => append('up')}>Add up strum</button>
            <button type="button" className="btn btn-sm" onClick={() => append('rest')}>Add rest</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onTextChange('')}>Clear pattern</button>
          </div>
        </details>
      </div>}
    </section>
  );
}
