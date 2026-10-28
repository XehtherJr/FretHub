import { useEffect, useRef, useState } from 'react';
import { detectPitch, signalLevel, type PitchReading } from '@core/pitchDetection';
import { PitchTracker } from '@core/pitchTracker';
import { assessTunerPitch, tunerStrings, type TunerMode, type TunerString } from '@core/tuner';
import { getTuning, TUNINGS } from '@core/tunings';
import { isAudioSupported, playMidi } from '@core/audio';
import { useAudioInput } from '@/hooks/useAudioInput';

export default function Tuner() {
  const [tuningId, setTuningId] = useState('standard');
  const [mode, setMode] = useState<TunerMode>('strings');
  const [target, setTarget] = useState<number | null>(null);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [level, setLevel] = useState(0);
  const [clippedInput, setClippedInput] = useState(false);
  const [referencePlaying, setReferencePlaying] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const tracker = useRef(new PitchTracker());
  const referenceActive = useRef(false);
  const referenceVersion = useRef(0);
  const referenceCount = useRef(0);
  const referenceTimer = useRef<number | null>(null);
  const microphone = useAudioInput(8192);
  const currentInput = useRef(microphone.input);
  useEffect(() => { currentInput.current = microphone.input; }, [microphone.input]);
  const strings = tunerStrings(getTuning(tuningId));
  const split = Math.ceil(strings.length / 2);
  const left = strings.slice(0, split).reverse();
  const right = strings.slice(split);

  useEffect(() => () => {
    referenceVersion.current++;
    if (referenceTimer.current !== null) window.clearTimeout(referenceTimer.current);
  }, []);

  useEffect(() => {
    const input = microphone.input;
    if (!input) { tracker.current.reset(); setReading(null); setLevel(0); setClippedInput(false); return; }
    const buffer = new Float32Array(input.analyser.fftSize);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 90) {
        last = now;
        input.analyser.getFloatTimeDomainData(buffer);
        const rms = signalLevel(buffer);
        // A logarithmic level makes both quiet and loud microphones visible.
        setLevel(Math.max(0, Math.min(100, Math.round(100 * Math.log10(1 + rms * 1000) / Math.log10(301)))));
        let clipped = 0;
        for (const sample of buffer) if (Math.abs(sample) >= 0.995) clipped++;
        const overloaded = clipped > buffer.length * 0.02;
        setClippedInput(overloaded);
        if (overloaded) { tracker.current.reset(); setReading(null); }
        else if (!referenceActive.current) setReading(tracker.current.push(detectPitch(buffer, input.context.sampleRate)));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [microphone.input]);

  const selected = target === null ? null : strings.find((string) => string.index === target) ?? null;
  const assessment = reading ? assessTunerPitch(reading, strings, target, mode) : null;
  const cents = assessment?.cents ?? 0;
  const clipped = Math.max(-50, Math.min(50, cents));
  const inTune = assessment?.state === 'in-tune';
  const activeIndex = selected?.index ?? (mode === 'strings' ? assessment?.target?.index : strings.find((string) => string.midi === reading?.midi)?.index);
  const displayTarget = assessment?.targetLabel ?? selected?.label ?? '—';
  const displayOctave = displayTarget.match(/\d+$/)?.[0] ?? '';
  const advice = referencePlaying ? 'Reference playing · listening paused' : clippedInput ? 'Input too loud · move the microphone back' : assessment?.advice ?? (microphone.status === 'listening' ? 'Listening · pluck one string' : 'Ready when you are');
  const levelText = microphone.status !== 'listening' ? 'Microphone off' : clippedInput ? 'Input is clipping — move the microphone back' : level < 17 ? 'Very quiet — try moving closer' : 'Signal received';

  const playReference = (string: TunerString) => {
    if (!isAudioSupported()) return;
    const version = referenceVersion.current;
    referenceCount.current++;
    if (referenceTimer.current !== null) window.clearTimeout(referenceTimer.current);
    referenceTimer.current = null;
    referenceActive.current = true;
    tracker.current.reset();
    setReading(null);
    setReferenceError('');
    setReferencePlaying(true);
    const finished = (failed = false) => {
      if (version !== referenceVersion.current) return;
      if (failed) setReferenceError('Reference audio could not play. You can still tune with the microphone.');
      if (--referenceCount.current > 0) return;
      // All requested references have ended, even if samples loaded out of
      // order. Flush a full analyser window (including at low sample rates).
      const input = currentInput.current;
      const flushMs = input ? Math.max(220, Math.ceil(input.analyser.fftSize / input.context.sampleRate * 1000) + 35) : 220;
      referenceTimer.current = window.setTimeout(() => {
        if (version !== referenceVersion.current) return;
        referenceActive.current = false;
        tracker.current.reset();
        setReferencePlaying(false);
        referenceTimer.current = null;
      }, flushMs);
    };
    try { void Promise.resolve(playMidi(string.midi)).then(() => finished(), () => finished(true)); }
    catch { finished(true); }
  };

  const selectString = (string: TunerString) => {
    setMode('strings');
    setTarget(string.index);
    tracker.current.reset();
    setReading(null);
    // Preserve the quick reference when stopped. While listening, choosing a
    // target is silent; a separate button plays a reference deliberately.
    if (microphone.status !== 'listening') playReference(string);
  };
  const peg = (string: TunerString) => {
    const active = activeIndex === string.index;
    const action = microphone.status === 'listening' ? `Select ${string.label} target` : `Play ${string.label} reference`;
    return <button key={string.index} type="button" className={`tuner-peg ${active ? 'is-active' : ''}`} aria-pressed={target === string.index} aria-label={`${action}, string ${string.number}`} onClick={() => selectString(string)}><span>{string.label.replace(/\d+$/, '')}</span><small>{string.octave}</small></button>;
  };

  return (
    <div className="tuner-shell">
      <div className="tuner-toolbar">
        <div className="field"><label htmlFor="tuner-tuning">Guitar tuning</label><select id="tuner-tuning" value={tuningId} onChange={(event) => { setTuningId(event.target.value); setTarget(null); tracker.current.reset(); setReading(null); }}>{TUNINGS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <div className="tuner-modes" role="group" aria-label="Tuner mode">
          <button type="button" className="btn btn-sm" aria-pressed={target === null && mode === 'strings'} onClick={() => { setTarget(null); setMode('strings'); }}>Auto detect</button>
          <button type="button" className="btn btn-sm" aria-pressed={target === null && mode === 'chromatic'} onClick={() => { setTarget(null); setMode('chromatic'); }}>Chromatic</button>
        </div>
      </div>

      <div className="tuner-stage">
        <div className="tuner-meter" role="meter" aria-label="Tuning in cents" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={assessment && assessment.state !== 'verify' ? clipped : 0} aria-valuetext={assessment ? `${cents > 0 ? '+' : ''}${cents} cents from ${assessment.targetLabel}; ${advice}` : 'No pitch detected'}>
          <svg viewBox="0 0 360 180" aria-hidden="true">
            <path d="M 32 156 A 148 148 0 0 1 328 156" className="meter-track" />
            <path d="M 168 8 A 148 148 0 0 1 192 8" className="meter-center" />
            {Array.from({ length: 11 }, (_, i) => <line key={i} x1="180" y1="15" x2="180" y2={i === 5 ? '31' : '25'} className={i === 5 ? 'meter-tick center' : 'meter-tick'} transform={`rotate(${(i - 5) * 16} 180 156)`} />)}
            {assessment && assessment.state !== 'verify' && <line x1="180" y1="156" x2="180" y2="31" className={`meter-needle ${inTune ? 'in-tune' : ''}`} transform={`rotate(${clipped * 1.55} 180 156)`} />}
            <circle cx="180" cy="156" r="5" className="meter-hub" />
          </svg>
          <span className="meter-side meter-flat">FLAT</span><span className="meter-side meter-sharp">SHARP</span>
        </div>
        <div className={`tuner-readout ${inTune ? 'is-in-tune' : ''}`}>
          <span className="tuner-target-label">{assessment?.target ? `TARGET · STRING ${assessment.target.number}` : selected ? `TARGET · STRING ${selected.number}` : mode === 'chromatic' ? 'NEAREST NOTE' : 'NEAREST STRING'}</span>
          <span className="tuner-note">{displayTarget.replace(/\d+$/, '')}<small>{displayOctave}</small></span>
          <strong aria-live="polite">{assessment && <span className="sr-only">Target {assessment.targetLabel}. </span>}{advice}</strong>
          <span className="mono">{assessment && reading ? `${reading.frequency.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents from ${assessment.targetLabel}${reading.midi !== assessment.targetMidi ? ` · heard ${reading.note}${reading.octave}` : ''}` : 'A4 = 440 Hz'}</span>
        </div>

        <div className="tuner-instrument" aria-label="Tuning reference strings">
          <div className="tuner-pegs left">{left.map(peg)}</div>
          <svg className="tuner-headstock" viewBox="0 0 190 300" aria-hidden="true">
            <defs><linearGradient id="tuner-wood" x1="0" x2="1"><stop stopColor="#39251d" /><stop offset=".45" stopColor="#725042" /><stop offset="1" stopColor="#36231d" /></linearGradient></defs>
            <path d="M 43 286 L 41 188 Q 32 150 34 50 Q 36 12 95 10 Q 154 12 156 50 Q 158 150 149 188 L 147 286 Z" fill="url(#tuner-wood)" stroke="#9c7b5e" strokeWidth="2" />
            <path d="M 45 282 L 145 282 M 46 276 L 144 276" stroke="#d0c4ac" strokeWidth="4" />
            {strings.map((_string, i) => <line key={i} x1={58 + i * (74 / Math.max(1, strings.length - 1))} y1="280" x2={i < split ? 51 : 139} y2={60 + (i < split ? split - 1 - i : i - split) * 56} stroke="#ded4c4" strokeWidth={Math.max(0.65, 2 - i * 0.16)} opacity=".8" />)}
            {Array.from({ length: Math.max(left.length, right.length) }, (_, i) => <g key={i}>{i < left.length && <circle cx="50" cy={60 + i * 56} r="5" fill="#d0c4ac" />}{i < right.length && <circle cx="140" cy={60 + i * 56} r="5" fill="#d0c4ac" />}</g>)}
            <text x="95" y="42" textAnchor="middle" fill="#e3c293" fontSize="7" letterSpacing="2">FRETHUB</text>
          </svg>
          <div className="tuner-pegs right">{right.map(peg)}</div>
        </div>
        <div className="tuner-reference-hint">
          <p className="small muted">{microphone.status === 'listening' ? 'Tap a string to select it silently. Auto detect compares the nearest open string.' : 'Tap a string to select and hear its reference, or use auto detect.'}</p>
          {selected && <button type="button" className="btn btn-sm" disabled={referencePlaying || !isAudioSupported()} onClick={() => playReference(selected)}>Play selected reference</button>}
          {referenceError && <p className="small tuner-error" role="alert">{referenceError}</p>}
          {mode === 'chromatic' && target === null && <p className="small muted">Chromatic mode measures the nearest note, not a guitar string.</p>}
        </div>
        <div className="tuner-start">
          {microphone.status === 'listening' ? <button type="button" className="btn" onClick={microphone.stop}>Stop tuner</button> : <button type="button" className="btn btn-primary" disabled={microphone.status === 'requesting' || microphone.status === 'unsupported'} onClick={() => { void microphone.start(); }}>{microphone.status === 'requesting' ? 'Requesting microphone…' : 'Start tuner'}</button>}
          {microphone.status === 'listening' && <div className="tuner-input-level"><label htmlFor="tuner-input-level">Microphone level</label><meter id="tuner-input-level" min="0" max="100" value={level} aria-valuetext={levelText} /><span>{levelText}</span></div>}
          <p className="small faint">Microphone audio stays on your device. Mute other strings, check the target and octave, and turn pegs in small steps.</p>
          {microphone.status === 'denied' && <p className="small tuner-error" role="alert">Microphone permission denied. Enable access in your browser settings and try again.</p>}
          {microphone.status === 'unavailable' && <p className="small tuner-error" role="alert">Microphone or audio processing unavailable. Check your device and try again.</p>}
          {microphone.status === 'unsupported' && <p className="small tuner-error" role="alert">Microphone access is unavailable in this browser. Use HTTPS and a supported browser.</p>}
        </div>
      </div>
    </div>
  );
}
