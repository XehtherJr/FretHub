import { useEffect, useRef, useState } from 'react';
import { getAudioContext, isAudioSupported } from '@core/audio';

export type MicrophoneStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'unsupported';
export interface AudioInput { context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode }

/** Explicit, local-only microphone access with cleanup on stop/unmount. */
export function useAudioInput(fftSize = 4096) {
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [input, setInput] = useState<AudioInput | null>(null);
  const requestRef = useRef(0);
  const resources = useRef<{ stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; onEnded: () => void } | null>(null);

  const release = () => {
    requestRef.current++;
    const current = resources.current;
    if (current) {
      current.source.disconnect();
      current.analyser.disconnect();
      current.stream.getTracks().forEach((track) => { track.removeEventListener('ended', current.onEnded); track.stop(); });
    }
    resources.current = null;
  };
  const stop = () => { release(); setInput(null); setStatus('idle'); };
  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !isAudioSupported()) { setStatus('unsupported'); return; }
    const request = ++requestRef.current;
    setStatus('requesting');
    let stream: MediaStream | null = null;
    try {
      // Resume while still in the user gesture; no microphone signal is sent to speakers.
      const context = getAudioContext();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (request !== requestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (context.state !== 'running') await context.resume();
      if (request !== requestRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (context.state !== 'running') throw new Error('Audio processing could not start.');
      const tracks = stream.getTracks();
      if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) throw new Error('Microphone disconnected.');
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = fftSize;
      source.connect(analyser);
      const activeStream = stream;
      const onEnded = () => {
        if (resources.current?.stream !== activeStream) return;
        release(); setInput(null); setStatus('unavailable');
      };
      tracks.forEach((track) => track.addEventListener('ended', onEnded));
      resources.current = { stream, source, analyser, onEnded };
      setInput({ context, source, analyser });
      setStatus('listening');
    } catch (error) {
      if (request !== requestRef.current) return;
      stream?.getTracks().forEach((track) => track.stop());
      release();
      const name = (error as { name?: string })?.name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  };
  useEffect(() => () => release(), []);
  return { status, input, start, stop };
}
