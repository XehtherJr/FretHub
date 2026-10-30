import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workletSource = readFileSync(resolve(process.cwd(), 'public/audio/onset-detector.js'), 'utf8');
const sampleRate = 48000;
const block = 128;

function runDetector(bpm: number, signal: (time: number) => number, duration: number): number[] {
  const onsets: number[] = [];
  let Detector: (new () => { port: { onmessage?: (event: { data: unknown }) => void }; process: (input: Float32Array[][]) => boolean }) | undefined;
  const scope = {
    sampleRate,
    currentTime: 0,
    AudioWorkletProcessor: class { port = { postMessage: ({ time }: { time: number }) => onsets.push(time), onmessage: undefined as ((event: { data: unknown }) => void) | undefined }; },
    registerProcessor: (_name: string, processor: typeof Detector) => { Detector = processor; },
  };
  runInNewContext(workletSource, scope);
  const detector = new Detector!();
  detector.port.onmessage?.({ data: { bpm } });
  const blocks = Math.ceil(duration * sampleRate / block);
  for (let frame = 0; frame < blocks; frame++) {
    scope.currentTime = frame * block / sampleRate;
    const samples = Float32Array.from({ length: block }, (_, i) => signal((frame * block + i) / sampleRate));
    detector.process([[samples]]);
  }
  return onsets;
}

function strikes(bpm: number, count: number): (time: number) => number {
  const period = 60 / bpm;
  return (time) => {
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const age = time - (0.1 + i * period);
      if (age >= 0 && age < 0.11) sum += 0.28 * Math.exp(-age * 30) * Math.sin(2 * Math.PI * 220 * age);
    }
    return sum;
  };
}

describe('timing coach onset worklet', () => {
  it.each([240, 360, 480])('detects each of eight synthetic attacks at %i clicks per minute', (bpm) => {
    const attacks = runDetector(bpm, strikes(bpm, 8), 0.1 + 8 * 60 / bpm + 0.15);
    expect(attacks).toHaveLength(8);
    attacks.forEach((time, i) => expect(Math.abs(time - (0.1 + i * 60 / bpm))).toBeLessThan(0.025));
  });

  it('does not repeatedly count the decay of a single ringing synthetic string', () => {
    const ringing = (time: number) => {
      const age = time - 0.1;
      return age < 0 ? 0 : 0.28 * Math.exp(-age * 3) * (0.8 + 0.2 * Math.cos(2 * Math.PI * 7 * age)) * Math.sin(2 * Math.PI * 220 * age);
    };
    expect(runDetector(480, ringing, 1.2)).toHaveLength(1);
  });
});
