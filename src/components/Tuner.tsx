import { useEffect, useRef, useState } from 'react';
import { detectPitch, type PitchReading } from '@core/pitchDetection';
import { midiToFreq, pcOctaveToMidi } from '@core/notes';
import { getTuning, TUNINGS } from '@core/tunings';
import { playMidi } from '@core/audio';
import { useAudioInput } from '@/hooks/useAudioInput';

export default function Tuner() {
  const [tuningId, setTuningId] = useState('standard');
  const [target, setTarget] = useState<number | null>(null);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const recent = useRef<PitchReading[]>([]);
  const microphone = useAudioInput();
  const tuning = getTuning(tuningId);
  const strings = tuning.strings.map((string, index) => ({ ...string, index, midi: pcOctaveToMidi(string.pc, string.octave) }));
  const split = Math.ceil(strings.length / 2);
  const left = strings.slice(0, split).reverse();
  const right = strings.slice(split);

  useEffect(() => {
    const input = microphone.input;
    if (!input) { recent.current = []; setReading(null); return; }
    const buffer = new Float32Array(input.analyser.fftSize);
    let frame = 0;
    let last = 0;
    let misses = 0;
    const tick = (now: number) => {
      if (now - last >= 90) {
        last = now;
        input.analyser.getFloatTimeDomainData(buffer);
        const found = detectPitch(buffer, input.context.sampleRate);
        if (found) {
          misses = 0;
          const sameNote = recent.current.length === 0 || recent.current[recent.current.length - 1].midi === found.midi;
          recent.current = [...(sameNote ? recent.current : []), found].slice(-3);
          const sorted = [...recent.current].sort((a, b) => a.frequency - b.frequency);
          setReading(sorted[Math.floor(sorted.length / 2)]);
        } else if (++misses >= 3) { recent.current = []; setReading(null); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [microphone.input]);

  const selected = target === null ? null : strings[target];
  const cents = reading ? (selected ? Math.round(1200 * Math.log2(reading.frequency / midiToFreq(selected.midi))) : reading.cents) : 0;
  const clipped = Math.max(-50, Math.min(50, cents));
  const inTune = !!reading && Math.abs(cents) <= 5;
  const detectedString = reading ? strings.find((string) => string.midi === reading.midi)?.index : undefined;
  const advice = !reading ? 'Pluck one string and let it ring' : inTune ? 'In tune' : cents < 0 ? 'Tune up gently' : 'Tune down gently';

  const peg = (string: typeof strings[number]) => {
    const active = target === string.index || (target === null && detectedString === string.index);
    return <button key={string.index} type="button" className={`tuner-peg ${active ? 'is-active' : ''}`} aria-pressed={target === string.index} aria-label={`Play ${string.label} reference, string ${strings.length - string.index}`} onClick={() => { setTarget(string.index); playMidi(string.midi); }}><span>{string.label.replace(/\d+$/, '')}</span><small>{string.octave}</small></button>;
  };

  return (
    <div className="tuner-shell">
      <div className="tuner-toolbar">
        <div className="field"><label htmlFor="tuner-tuning">Guitar tuning</label><select id="tuner-tuning" value={tuningId} onChange={(event) => { setTuningId(event.target.value); setTarget(null); }}>{TUNINGS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
        <button type="button" className="btn btn-sm" aria-pressed={target === null} onClick={() => setTarget(null)}>Auto detect</button>
      </div>

      <div className="tuner-stage">
        <div className="tuner-meter" role="meter" aria-label="Tuning in cents" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={reading ? clipped : 0} aria-valuetext={reading ? `${cents > 0 ? '+' : ''}${cents} cents; ${advice}` : 'No pitch detected'}>
          <svg viewBox="0 0 360 180" aria-hidden="true">
            <path d="M 32 156 A 148 148 0 0 1 328 156" className="meter-track" />
            <path d="M 168 8 A 148 148 0 0 1 192 8" className="meter-center" />
            {Array.from({ length: 11 }, (_, i) => <line key={i} x1="180" y1="15" x2="180" y2={i === 5 ? '31' : '25'} className={i === 5 ? 'meter-tick center' : 'meter-tick'} transform={`rotate(${(i - 5) * 16} 180 156)`} />)}
            {reading && <line x1="180" y1="156" x2="180" y2="31" className={`meter-needle ${inTune ? 'in-tune' : ''}`} transform={`rotate(${clipped * 1.55} 180 156)`} />}
            <circle cx="180" cy="156" r="5" className="meter-hub" />
          </svg>
          <span className="meter-side meter-flat">FLAT</span><span className="meter-side meter-sharp">SHARP</span>
        </div>
        <div className={`tuner-readout ${inTune ? 'is-in-tune' : ''}`}>
          <span className="tuner-note">{reading ? (selected ? selected.label.replace(/\d+$/, '') : reading.note) : '—'}<small>{reading ? (selected?.octave ?? reading.octave) : ''}</small></span>
          <strong>{microphone.status === 'listening' ? advice : 'Ready when you are'}</strong>
          <span className="mono">{reading ? `${reading.frequency.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents${selected && reading.midi !== selected.midi ? ` · heard ${reading.note}${reading.octave}` : ''}` : 'A4 = 440 Hz'}</span>
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
        <p className="small muted tuner-reference-hint">Tap a string to hear its reference note, or use auto detect.</p>
        <div className="tuner-start">
          {microphone.status === 'listening' ? <button type="button" className="btn" onClick={microphone.stop}>Stop tuner</button> : <button type="button" className="btn btn-primary" disabled={microphone.status === 'requesting' || microphone.status === 'unsupported'} onClick={() => { void microphone.start(); }}>{microphone.status === 'requesting' ? 'Requesting microphone…' : 'Start tuner'}</button>}
          <p className="small faint">Microphone audio stays on your device. Play one string at a time.</p>
          {microphone.status === 'denied' && <p className="small tuner-error" role="alert">Microphone permission denied. Enable access in your browser settings and try again.</p>}
          {microphone.status === 'unavailable' && <p className="small tuner-error" role="alert">Microphone unavailable. Check that a microphone is connected and try again.</p>}
          {microphone.status === 'unsupported' && <p className="small tuner-error" role="alert">Microphone access is unavailable in this browser. Use HTTPS and a supported browser.</p>}
        </div>
      </div>
    </div>
  );
}
