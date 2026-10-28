import { useMemo } from 'react';
import type { Tuning } from '@core/tunings';
import { analyzePickingPattern, type PatternStep, type StepsPerBeat } from '@core/pickingPattern';

export type PatternMode = 'single' | 'arpeggio' | 'custom';

interface Props {
  tuning: Tuning;
  mode: PatternMode;
  stepsPerBeat: StepsPerBeat;
  text: string;
  steps: PatternStep[] | null;
  chords: { name: string; frets: (number | null)[]; beats: number }[];
  error: string | null;
  selected: number[];
  onSelectionChange: (value: number[]) => void;
  onModeChange: (mode: PatternMode) => void;
  onTimingChange: (value: StepsPerBeat) => void;
  onTextChange: (value: string) => void;
}

export default function ProgressionPatternEditor({ tuning, mode, stepsPerBeat, text, steps, chords, error, selected, onSelectionChange, onModeChange, onTimingChange, onTextChange }: Props) {
  const analysis = useMemo(() => steps ? analyzePickingPattern(steps, stepsPerBeat, chords) : [], [steps, stepsPerBeat, chords]);
  const shortened = analysis.flatMap((item, index) => item.firstOmittedStep === null ? [] : [{ ...item, index }]);
  const muted = analysis.flatMap((item, index) => item.mutedPicks.length ? [{ ...item, index }] : []);
  const append = (step: string) => onTextChange([text.trim(), step].filter(Boolean).join(' '));
  const addSelected = () => {
    if (!selected.length) return;
    append([...selected].sort((a, b) => a - b).map((index) => tuning.strings.length - index).join('+'));
    onSelectionChange([]);
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
      {mode !== 'single' && <p className="small muted">The pattern repeats within each chord and restarts at the next chord. {mode === 'arpeggio' ? 'It skips muted strings and follows string order, which may not be ascending pitch.' : 'Muted strings are silent; a rest stops ringing notes.'}</p>}
      {mode === 'custom' && <div className="progression-pattern-custom">
        <div className="field">
          <label htmlFor="progression-pattern-text">Pattern steps</label>
          <input id="progression-pattern-text" value={text} maxLength={1024} placeholder="5 4 3 2 3 3+1" aria-invalid={!!error} aria-describedby="progression-pattern-help progression-pattern-error" onChange={(event) => onTextChange(event.target.value)} />
        </div>
        <p id="progression-pattern-help" className="small muted">Separate steps with spaces or dashes. Use string names or numbers; <code>+</code> picks strings together. Add <code>down</code>, <code>up</code>, or <code>rest</code> as steps. For example: <code>5 4 3 2 3 3+1</code>.</p>
        <p className="small faint">Open tuning, before the capo: {tuning.strings.map((string, index) => `${tuning.strings.length - index} ${string.label}`).join(' · ')}. Use the octave or string number when a name is repeated.</p>
        <p id="progression-pattern-error" className="small pattern-error" role="status" aria-live="polite"><span>{error ?? 'Pattern ready.'}</span>{steps && ` ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}.`}</p>
        {steps && shortened.length > 0 && <div className="pattern-warning" role="status">
          <p>Some steps won’t play before the chord changes:</p>
          <ul>{shortened.slice(0, 3).map((item) => <li key={item.index}>
            Chord {item.index + 1} ({chords[item.index].name}): {chords[item.index].beats} {chords[item.index].beats === 1 ? 'beat' : 'beats'} × {stepsPerBeat} {stepsPerBeat === 1 ? 'step' : 'steps'} per beat = {item.slots} {item.slots === 1 ? 'step' : 'steps'}. {item.firstOmittedStep === steps.length ? `Step ${steps.length}` : `Steps ${item.firstOmittedStep}–${steps.length}`} won’t play on this chord.
          </li>)}</ul>
          {shortened.length > 3 && <p>And {shortened.length - 3} more {shortened.length === 4 ? 'chord' : 'chords'}.</p>}
          <p>The pattern restarts on each chord. Increase those chords’ beats or choose more steps per beat to hear the full pattern.</p>
        </div>}
        {muted.length > 0 && <div className="pattern-warning" role="status">
          <p>Some picked strings are muted and won’t sound:</p>
          <ul>{muted.slice(0, 3).map((item) => <li key={item.index}>
            Chord {item.index + 1} ({chords[item.index].name}): {item.mutedPicks.slice(0, 4).map((pick) => `step ${pick.step} (string${pick.strings.length === 1 ? '' : 's'} ${pick.strings.join(', ')})`).join('; ')}{item.mutedPicks.length > 4 ? `; and ${item.mutedPicks.length - 4} more steps` : ''}.
          </li>)}</ul>
          {muted.length > 3 && <p>And {muted.length - 3} more {muted.length === 4 ? 'chord' : 'chords'}.</p>}
        </div>}
        {steps?.every((step) => step.kind === 'rest') && <p className="pattern-warning" role="status">This pattern contains only rests, so playback will be silent.</p>}
        <button type="button" className="btn btn-sm btn-ghost pattern-clear" onClick={() => { onTextChange(''); onSelectionChange([]); }}>Clear pattern</button>
        {selected.length > 0 && <div className="pattern-pending">
          <p className="small" role="status">Selected strings are not in the pattern yet. Use Add picked step or clear the selection before playing or saving.</p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSelectionChange([])}>Clear selected strings</button>
        </div>}
        <details className="pattern-composer">
          <summary>Build steps with buttons</summary>
          <fieldset>
            <legend>Strings to pick together</legend>
            <div className="pattern-string-options">
              {tuning.strings.map((string, index) => <label key={index}>
                <input type="checkbox" checked={selected.includes(index)} onChange={(event) => onSelectionChange(event.target.checked ? [...selected, index] : selected.filter((item) => item !== index))} />
                {tuning.strings.length - index} · {string.label}
              </label>)}
            </div>
          </fieldset>
          <div className="row pattern-composer-actions">
            <button type="button" className="btn btn-sm" disabled={!selected.length} onClick={addSelected}>Add picked step</button>
            <button type="button" className="btn btn-sm" onClick={() => append('down')}>Add down strum</button>
            <button type="button" className="btn btn-sm" onClick={() => append('up')}>Add up strum</button>
            <button type="button" className="btn btn-sm" onClick={() => append('rest')}>Add rest</button>
          </div>
        </details>
      </div>}
    </section>
  );
}
