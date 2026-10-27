import { useEffect, useRef, useState } from 'react';
import { getAudioContext, isAudioSupported, playClick } from '@core/audio';
import { beatOffsetMs, describeTiming, isAudibleBeat } from '@core/rhythm';
import { useAudioInput } from '@/hooks/useAudioInput';

type Mode = 'steady' | 'coach' | 'disappearing';
const MODES: { id: Mode; label: string; description: string }[] = [
  { id: 'steady', label: 'Steady', description: 'A clear, even pulse with beat one accented.' },
  { id: 'coach', label: 'Timing coach', description: 'Listen to one note per beat and see how your timing compares.' },
  { id: 'disappearing', label: 'Disappearing', description: 'The click drops out, then returns. Keep the beat while it is silent.' },
];

export default function Metronome() {
  const [bpm, setBpm] = useState(90);
  const [beats, setBeats] = useState(4);
  const [mode, setMode] = useState<Mode>('steady');
  const [audibleBars, setAudibleBars] = useState(1);
  const [silentBars, setSilentBars] = useState(1);
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [silent, setSilent] = useState(false);
  const [offsets, setOffsets] = useState<number[]>([]);
  const [latencyMs, setLatencyMs] = useState(0);
  const [calibrationCount, setCalibrationCount] = useState<number | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState('');
  const calibration = useRef<number[] | null>(null);
  const [detectorError, setDetectorError] = useState('');
  const [detectorReady, setDetectorReady] = useState(false);
  const microphone = useAudioInput();
  const clock = useRef({ anchor: 0, bpm, running: false, latencyMs });
  const taps = useRef<number[]>([]);
  clock.current.running = running;
  clock.current.bpm = bpm;
  clock.current.latencyMs = latencyMs;

  useEffect(() => {
    if (!running || !isAudioSupported()) return;
    const audio = getAudioContext();
    const period = 60 / bpm;
    let nextTime = audio.currentTime + 0.05;
    let index = 0;
    clock.current.anchor = nextTime;
    const visuals = new Set<number>();
    const clicks = new Set<OscillatorNode>();
    const schedule = () => {
      if (nextTime < audio.currentTime - period) {
        const missed = Math.floor((audio.currentTime - nextTime) / period);
        index += missed;
        nextTime += missed * period;
      }
      while (nextTime < audio.currentTime + 0.35) {
        const beat = index % beats;
        const audible = mode !== 'disappearing' || isAudibleBeat(index, beats, audibleBars, silentBars);
        if (audible) {
          const click = playClick(beat === 0, nextTime);
          if (click) { clicks.add(click); click.onended = () => clicks.delete(click); }
        }
        const delay = Math.max(0, (nextTime - audio.currentTime) * 1000);
        const timer = window.setTimeout(() => {
          visuals.delete(timer);
          setCurrentBeat(beat);
          setSilent(!audible);
        }, delay);
        visuals.add(timer);
        index++;
        nextTime += period;
      }
    };
    schedule();
    const timer = window.setInterval(schedule, 25);
    return () => {
      window.clearInterval(timer);
      visuals.forEach((id) => window.clearTimeout(id));
      clicks.forEach((click) => { try { click.stop(audio.currentTime); } catch { /* Already ended. */ } });
    };
  }, [running, bpm, beats, mode, audibleBars, silentBars]);

  useEffect(() => { setOffsets([]); calibration.current = null; setCalibrationCount(null); }, [bpm, beats, mode]);
  useEffect(() => { setOffsets([]); }, [latencyMs]);
  useEffect(() => {
    if (mode !== 'coach' && (microphone.input || microphone.status === 'requesting')) microphone.stop();
    // stop is intentionally called only when the selected mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    setDetectorReady(false);
    const input = microphone.input;
    if (!input || mode !== 'coach') return;
    let disposed = false;
    let detector: AudioWorkletNode | null = null;
    let sink: GainNode | null = null;
    setDetectorError('');
    const connect = async () => {
      try {
        if (!input.context.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet is not available.');
        await input.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}audio/onset-detector.js`);
        if (disposed) return;
        detector = new AudioWorkletNode(input.context, 'frethub-onset');
        sink = input.context.createGain();
        sink.gain.value = 0;
        detector.port.onmessage = (event: MessageEvent<{ time: number }>) => {
          if (!clock.current.running || !Number.isFinite(event.data.time)) return;
          if (calibration.current) {
            const raw = beatOffsetMs(event.data.time, clock.current.anchor, clock.current.bpm);
            calibration.current.push(raw);
            setCalibrationCount(calibration.current.length);
            if (calibration.current.length >= 4) {
              const sorted = [...calibration.current].sort((a, b) => a - b);
              const estimate = (sorted[1] + sorted[2]) / 2;
              calibration.current = null;
              setCalibrationCount(null);
              if (estimate < 0 || estimate > 150) {
                setCalibrationMessage('Could not estimate a delay. Try again, playing right on each click.');
              } else {
                const delay = Math.round(estimate);
                clock.current.latencyMs = delay;
                setLatencyMs(delay);
                setOffsets([]);
                setCalibrationMessage(`Estimated device delay: ${delay} ms. You can adjust it below.`);
              }
            }
            return;
          }
          const offset = beatOffsetMs(event.data.time, clock.current.anchor, clock.current.bpm, clock.current.latencyMs);
          setOffsets((previous) => [...previous, offset].slice(-8));
        };
        input.source.connect(detector);
        detector.connect(sink);
        sink.connect(input.context.destination);
        setDetectorReady(true);
      } catch {
        if (!disposed) setDetectorError('Timing analysis is not supported in this browser. Steady and disappearing modes still work.');
      }
    };
    void connect();
    return () => {
      disposed = true;
      if (detector) {
        try { input.source.disconnect(detector); } catch { /* The microphone may already have been stopped. */ }
        detector.port.onmessage = null;
        detector.disconnect();
      }
      sink?.disconnect();
    };
  }, [microphone.input, mode]);

  const start = () => {
    if (!isAudioSupported()) return;
    getAudioContext();
    setOffsets([]);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setCurrentBeat(0);
    setSilent(false);
    calibration.current = null;
    setCalibrationCount(null);
    if (microphone.input || microphone.status === 'requesting') microphone.stop();
  };
  const tap = () => {
    const now = performance.now();
    const recent = taps.current.filter((time) => now - time < 2500);
    taps.current = [...recent, now].slice(-5);
    if (taps.current.length >= 2) {
      const span = taps.current[taps.current.length - 1] - taps.current[0];
      setBpm(Math.max(40, Math.min(240, Math.round(60000 * (taps.current.length - 1) / span))));
    }
  };
  const latest = offsets[offsets.length - 1];
  const result = describeTiming(offsets, bpm);
  const summary = {
    listening: 'Play a few beats for a pattern',
    'on-time': 'Steady and close to the beat',
    ahead: 'Consistently ahead of the beat',
    behind: 'Consistently behind the beat',
    inconsistent: 'Timing is inconsistent',
  }[result.summary];
  const beatLabel = latest === undefined ? 'Waiting for a note' : Math.abs(latest) <= 22 ? 'On the beat' : `${Math.round(Math.abs(latest))} ms ${latest < 0 ? 'ahead' : 'behind'}`;

  return (
    <div className="metronome-shell">
      <div className="metronome-mode-list" role="group" aria-label="Metronome mode">
        {MODES.map((item) => <button key={item.id} type="button" className="metronome-mode" aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
      <p className="metronome-description">{MODES.find((item) => item.id === mode)?.description}</p>
      <div className="metronome-tempo">
        <button type="button" className="tempo-adjust" aria-label="Decrease tempo" onClick={() => setBpm((value) => Math.max(40, value - 1))}>−</button>
        <div><span className="tempo-number">{bpm}</span><span className="tempo-unit">BPM</span></div>
        <button type="button" className="tempo-adjust" aria-label="Increase tempo" onClick={() => setBpm((value) => Math.min(240, value + 1))}>+</button>
      </div>
      <div className="tempo-range"><label className="sr-only" htmlFor="metronome-bpm">Tempo in beats per minute</label><input id="metronome-bpm" type="range" min="40" max="240" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} /><div><span>40</span><span>240</span></div></div>
      <div className="metronome-beats" role="group" aria-label={`${beats} beats per bar`}>
        {Array.from({ length: beats }, (_, i) => <span key={i} className={`metronome-beat ${running && !silent && currentBeat === i ? 'is-active' : ''}`} aria-hidden="true">{i + 1}</span>)}
      </div>
      <p className="metronome-phase" aria-live="polite">{running && mode === 'disappearing' ? (silent ? 'Silent bar · keep playing' : 'Click is playing') : '\u00a0'}</p>
      <div className="metronome-actions"><button type="button" className="btn btn-primary metronome-start" onClick={running ? stop : start}>{running ? 'Stop' : 'Start metronome'}</button><button type="button" className="btn" onClick={tap}>Tap tempo</button></div>
      <div className="metronome-settings">
        <div className="field"><label htmlFor="metronome-beats">Beats per bar</label><select id="metronome-beats" value={beats} onChange={(event) => setBeats(Number(event.target.value))}>{[2, 3, 4, 5, 6, 7].map((value) => <option key={value} value={value}>{value}/4</option>)}</select></div>
        {mode === 'disappearing' && <><div className="field"><label htmlFor="audible-bars">Audible bars</label><select id="audible-bars" value={audibleBars} onChange={(event) => setAudibleBars(Number(event.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div><div className="field"><label htmlFor="silent-bars">Silent bars</label><select id="silent-bars" value={silentBars} onChange={(event) => setSilentBars(Number(event.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div></>}
      </div>
      {mode === 'coach' && <div className="timing-coach">
        <div className="timing-coach-heading"><div><p className="eyebrow">LISTEN & COMPARE</p><h3>Your timing</h3></div>{microphone.status === 'listening' ? <button type="button" className="btn btn-sm" onClick={() => { calibration.current = null; setCalibrationCount(null); microphone.stop(); }}>Stop listening</button> : <button type="button" className="btn btn-sm" onClick={() => { void microphone.start(); }} disabled={microphone.status === 'requesting' || microphone.status === 'unsupported'}>{microphone.status === 'requesting' ? 'Requesting microphone…' : 'Enable microphone'}</button>}</div>
        <div className="timing-feedback"><div><small>LATEST NOTE</small><strong>{beatLabel}</strong></div><div><small>RECENT PATTERN</small><strong>{summary}</strong></div></div>
        <p className="small muted">Use headphones so the click is not mistaken for your guitar. Play one clear note on each beat. Feedback is an estimate and depends on microphone latency; audio stays on this device.</p>
        <div className="timing-calibration"><button type="button" className="btn btn-sm" disabled={!running || microphone.status !== 'listening' || !detectorReady || !!detectorError} onClick={() => { if (calibrationCount !== null) { calibration.current = null; setCalibrationCount(null); setCalibrationMessage('Calibration cancelled.'); } else { calibration.current = []; setCalibrationCount(0); setCalibrationMessage('Play one clear note exactly with each of the next four clicks.'); } }}>{calibrationCount !== null ? 'Cancel calibration' : 'Calibrate device delay'}</button><span className="small muted" role="status">{calibrationCount !== null ? `${calibrationMessage} (${calibrationCount}/4)` : calibrationMessage || 'Start the click and microphone, then calibrate if timing seems delayed.'}</span></div>
        <details className="timing-latency"><summary>Adjust latency manually</summary><label htmlFor="timing-latency">Subtract input delay: {latencyMs} ms</label><input id="timing-latency" type="range" min="0" max="150" step="1" value={latencyMs} onChange={(event) => setLatencyMs(Number(event.target.value))} /><p className="small faint">Calibration estimates the delay from your playing; you can refine it here. Zero is the default.</p></details>
        {microphone.status === 'denied' && <p className="small tuner-error" role="alert">Microphone permission denied. Enable access in your browser settings.</p>}
        {microphone.status === 'unavailable' && <p className="small tuner-error" role="alert">Microphone unavailable. Check your device and try again.</p>}
        {microphone.status === 'unsupported' && <p className="small tuner-error" role="alert">Microphone access is unavailable in this browser.</p>}
        {detectorError && <p className="small tuner-error" role="alert">{detectorError}</p>}
      </div>}
    </div>
  );
}
