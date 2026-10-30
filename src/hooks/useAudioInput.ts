import { useEffect, useRef, useState } from 'react';
import { getAudioContext, isAudioSupported } from '@core/audio';

export type MicrophoneStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'unsupported';
export interface AudioInput { context: AudioContext; source: MediaStreamAudioSourceNode; analyser: AnalyserNode }

/** Explicit, local-only microphone access with cleanup on stop/unmount. */
export function useAudioInput(fftSize = 4096) {
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [input, setInput] = useState<AudioInput | null>(null);
  const requestRef = useRef(0);
  const resources = useRef<{
    stream: MediaStream;
    source: MediaStreamAudioSourceNode | null;
    analyser: AnalyserNode | null;
    onEnded: (() => void) | null;
  } | null>(null);

  const stopTracks = (stream: MediaStream, onEnded?: (() => void) | null) => {
    for (const track of stream.getTracks()) {
      try { if (onEnded) track.removeEventListener('ended', onEnded); } catch { /* Continue stopping other tracks. */ }
      try { track.stop(); } catch { /* Continue stopping other tracks. */ }
    }
  };
  const release = () => {
    requestRef.current++;
    const current = resources.current;
    resources.current = null;
    if (!current) return;
    try { current.source?.disconnect(); } catch { /* Track cleanup must still run. */ }
    try { current.analyser?.disconnect(); } catch { /* Track cleanup must still run. */ }
    stopTracks(current.stream, current.onEnded);
  };
  const stop = () => { release(); setInput(null); setStatus('idle'); };
  const start = async () => {
    // A second request also cancels any stream already acquired by the first,
    // even if the new request cannot be started.
    release();
    setInput(null);
    if (!navigator.mediaDevices?.getUserMedia || !isAudioSupported()) { setStatus('unsupported'); return; }
    const request = ++requestRef.current;
    setStatus('requesting');
    let stream: MediaStream | null = null;
    try {
      const context = getAudioContext();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (request !== requestRef.current) { stopTracks(stream); return; }
      const activeStream = stream;
      const onEnded = () => {
        if (resources.current?.stream !== activeStream) return;
        release(); setInput(null); setStatus('unavailable');
      };
      // Register the stream immediately, before awaiting resume or creating nodes.
      // Stop/unmount can now release it even if resume never settles.
      const current = { stream, source: null as MediaStreamAudioSourceNode | null, analyser: null as AnalyserNode | null, onEnded };
      resources.current = current;
      const tracks = stream.getTracks();
      if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) throw new Error('Microphone disconnected.');
      tracks.forEach((track) => track.addEventListener('ended', onEnded));
      if (context.state !== 'running') await context.resume();
      if (request !== requestRef.current) return; // release already stopped this stream.
      if (context.state !== 'running') throw new Error('Audio processing could not start.');
      if (tracks.some((track) => track.readyState === 'ended')) throw new Error('Microphone disconnected.');
      current.source = context.createMediaStreamSource(stream);
      current.analyser = context.createAnalyser();
      current.analyser.fftSize = fftSize;
      current.source.connect(current.analyser);
      setInput({ context, source: current.source, analyser: current.analyser });
      setStatus('listening');
    } catch (error) {
      const cancelled = request !== requestRef.current;
      if (stream && resources.current?.stream === stream) release();
      if (cancelled) return;
      const name = (error as { name?: string })?.name;
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  };
  useEffect(() => () => release(), []);
  return { status, input, start, stop };
}
