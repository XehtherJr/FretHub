/* A small transient detector. Audio remains in the AudioWorklet and is never recorded. */
class FretHubOnsetDetector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.background = 0.003;
    this.previous = 0;
    this.lastOnset = -1;
    this.minOnsetGap = 0.17;
    this.port.onmessage = (event) => {
      const bpm = Number(event.data?.bpm);
      if (Number.isFinite(bpm) && bpm >= 40 && bpm <= 480) {
        // Suppress ringing between hits without masking the next fast click.
        this.minOnsetGap = Math.max(0.075, Math.min(0.17, 0.55 * 60 / bpm));
      }
    };
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples || !samples.length) return true;
    let energy = 0;
    let peak = 0;
    let peakIndex = 0;
    for (let i = 0; i < samples.length; i++) {
      const amplitude = Math.abs(samples[i]);
      energy += amplitude * amplitude;
      if (amplitude > peak) { peak = amplitude; peakIndex = i; }
    }
    const rms = Math.sqrt(energy / samples.length);
    const threshold = Math.max(0.012, this.background * 2.4);
    const time = currentTime + peakIndex / sampleRate;
    if (rms > threshold && rms > this.previous * 1.32 && time - this.lastOnset > this.minOnsetGap) {
      this.lastOnset = time;
      this.port.postMessage({ time, strength: rms });
    }
    // Slowly follow the room/decay level, rather than treating it as a new hit.
    this.background = this.background * 0.97 + Math.min(rms, 0.12) * 0.03;
    this.previous = this.previous * 0.45 + rms * 0.55;
    return true;
  }
}
registerProcessor('frethub-onset', FretHubOnsetDetector);
