import { expect, test } from './support/test';

interface PlayedNote { id: number; when: number; pitch?: number; rate?: number }
interface StoppedNote { id: number; when?: number }
declare global {
  interface Window { __playedNotes: PlayedNote[]; __stoppedNotes: StoppedNote[] }
}

// Observe real Web Audio nodes and the app's locally served recordings. This
// measures scheduling and pitch, not a human listener's sound-quality opinion.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__playedNotes = [];
    window.__stoppedNotes = [];
    let nextId = 0;
    const bytePitches = new WeakMap<ArrayBuffer, number>();
    const bufferPitches = new WeakMap<AudioBuffer, number>();
    const ids = new WeakMap<AudioBufferSourceNode, number>();
    const rates = new WeakMap<AudioBufferSourceNode, number>();
    const fetchOriginal = window.fetch;
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args);
      const match = /\/audio\/guitar\/(\d+)\.wav/.exec(String(args[0]));
      if (match) {
        const read = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => { const bytes = await read(); bytePitches.set(bytes, Number(match[1])); return bytes; };
      }
      return response;
    };
    const slice = ArrayBuffer.prototype.slice;
    ArrayBuffer.prototype.slice = function (start, end) {
      const result = slice.call(this, start, end);
      const pitch = bytePitches.get(this);
      if (pitch !== undefined) bytePitches.set(result, pitch);
      return result;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (bytes, success, failure) {
      const pitch = bytePitches.get(bytes);
      return decode.call(this, bytes, success, failure).then((buffer) => {
        if (pitch !== undefined) bufferPitches.set(buffer, pitch);
        return buffer;
      });
    };
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      ids.set(source, ++nextId);
      const set = source.playbackRate.setValueAtTime.bind(source.playbackRate);
      source.playbackRate.setValueAtTime = (value, when) => { rates.set(source, value); return set(value, when); };
      return source;
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      window.__playedNotes.push({ id: ids.get(this) ?? -1, when: when ?? 0, pitch: this.buffer ? bufferPitches.get(this.buffer) : undefined, rate: rates.get(this) });
      return start.call(this, when, offset, duration);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (when) {
      window.__stoppedNotes.push({ id: ids.get(this) ?? -1, when });
      return stop.call(this, when);
    };
  });
});

test('saves, reloads and plays the intended quarter-note pattern across two chords', async ({ page }) => {
  await page.goto('/fretboard?mode=progression');
  // Avoid note-on-click audio while assembling the chords.
  await page.getByRole('button', { name: 'Sound on' }).click();
  const board = page.getByRole('group', { name: /Interactive guitar fretboard/ });
  for (const name of [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 1, note C4/, /E4 string open/]) {
    await board.getByRole('button', { name }).click();
  }
  await page.getByRole('button', { name: 'Add selected chord' }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const name of [/String 6, fret 3, note G2/, /String 5, fret 2, note B2/, /D3 string open/, /G3 string open/, /B3 string open/, /String 1, fret 3, note G4/]) {
    await board.getByRole('button', { name }).click();
  }
  await page.getByRole('button', { name: 'Add selected chord' }).click();
  await page.getByLabel('Playback style').selectOption('custom');
  await page.getByLabel('Step timing').selectOption('1');
  await expect(page.getByLabel('Pattern steps')).toHaveValue('');
  await page.getByText('Build steps with buttons').click();
  await page.getByLabel('3 · G3').check();
  await page.getByLabel('1 · E4').check();
  await expect(page.getByRole('button', { name: 'Play progression' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add picked step' }).click();
  await page.getByRole('button', { name: 'Add rest' }).click();
  await page.getByLabel('Tempo (BPM)').fill('240');
  await page.getByRole('button', { name: 'Save progression', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save progression' });
  await dialog.getByLabel('Progression name').fill('Browser picking');
  await dialog.getByRole('button', { name: 'Save progression', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Load Browser picking' }).click();
  await expect(page.getByLabel('Pattern steps')).toHaveValue('3+1 rest');
  await expect(page.getByLabel('Step timing')).toHaveValue('1');
  await page.evaluate(() => { window.__playedNotes = []; window.__stoppedNotes = []; });
  await page.getByRole('button', { name: 'Play progression' }).click();
  await expect.poll(() => page.evaluate(() => window.__playedNotes.length), { timeout: 10_000 }).toBe(8);
  await expect(page.getByText('Playback finished.')).toBeVisible({ timeout: 5_000 });
  const { played, stopped } = await page.evaluate(() => ({ played: window.__playedNotes, stopped: window.__stoppedNotes }));
  const cents: Record<number, number> = { 40: -7, 43: -7, 46: -3, 49: -6, 52: -3, 55: -4, 58: -9, 61: -8, 64: -10, 68: -10, 71: -11, 74: -13, 77: -11, 80: -13, 83: -15 };
  const actual = played.map((note) => ({
    time: Math.round((note.when - played[0].when) * 1000) / 1000,
    midi: Math.round(note.pitch! + 12 * Math.log2(note.rate!) + cents[note.pitch!] / 100),
  }));
  expect(actual).toEqual([
    { time: 0, midi: 55 }, { time: 0, midi: 64 },
    { time: 0.5, midi: 55 }, { time: 0.5, midi: 64 },
    { time: 1, midi: 55 }, { time: 1, midi: 67 },
    { time: 1.5, midi: 55 }, { time: 1.5, midi: 67 },
  ]);
  for (const note of played) {
    expect(stopped.some((stop) => stop.id === note.id && typeof stop.when === 'number' && Math.abs(stop.when - note.when - 0.25) < 0.002)).toBe(true);
  }
});

test('mobile layout explains pattern truncation and muted strings without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fretboard?mode=progression');
  await page.getByRole('button', { name: 'Sound on' }).click();
  const board = page.getByRole('group', { name: /Interactive guitar fretboard/ });
  for (const name of [/String 5, fret 3, note C3/, /String 4, fret 2, note E3/, /G3 string open/, /String 2, fret 1, note C4/, /E4 string open/]) {
    await board.getByRole('button', { name }).click();
  }
  await page.getByRole('button', { name: 'Add selected chord' }).click();
  await page.getByLabel('Playback style').selectOption('custom');
  await page.getByLabel('Step timing').selectOption('1');
  await page.getByLabel('Pattern steps').fill('6 5 3+1 rest 2 down');
  await expect(page.getByText(/Some steps won’t play before the chord changes/)).toBeVisible();
  await expect(page.getByText(/Some picked strings are muted and won’t sound/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
