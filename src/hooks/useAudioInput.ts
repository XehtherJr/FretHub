import { useEffect, useRef, useState } from 'react';
import { getAudioContext, isAudioSupported } from '@core/audio';

export type MicrophoneStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'unsupported';
export interface AudioInput { context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode }

/** Explicit, local-only microphone access with cleanup on stop/unmount. */
export function useAudioInput() {
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [input, setInput] = useState<AudioInput | null>(null);
  const requestRef = useRef(0);
  const resources = useRef<{ stream: MediaStream; source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);

  const release = () => {
    requestRef.current++;
    const current = resources.current;
    if (current) {
      current.source.disconnect();
      current.analyser.disconnect();
      current.stream.getTracks().forEach((track) => track.stop());
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
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      resources.current = { stream, source, analyser };
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
