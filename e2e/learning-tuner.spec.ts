import { expect, test, blockExternalNetwork } from './support/test';

declare global { interface Window { __testMicrophone?: MediaStream } }

test('carries chord context into triad study and completes a guided transfer', async ({ page }) => {
  await page.goto('/chords/Eb/minor?tuning=drop-d&capo=2');
  await page.getByRole('link', { name: 'Explore its relationships' }).click();
  await expect(page.getByLabel('Root note')).toHaveValue('Eb');
  await expect(page.getByLabel('Chord quality')).toHaveValue('minor');
  await page.getByText(/Instrument: Drop D/).click();
  await expect(page.getByLabel('Tuning')).toHaveValue('drop-d');
  await expect(page.getByLabel('Capo', { exact: true })).toHaveValue('2');

  await page.goto('/theory');
  const practice = page.getByRole('region', { name: 'Try a complete practice loop' });
  await practice.getByRole('link', { name: 'the three tones of a triad' }).click();
  await expect(page.getByRole('heading', { name: 'Triads: stacking notes in thirds' })).toBeVisible();
  await page.goBack();
  await practice.getByRole('link', { name: 'two-key challenge' }).click();
  await expect(page).toHaveURL(/#transfer-heading$/);
  await page.getByRole('button', { name: 'Start the two-key challenge' }).click();
  const first = page.getByRole('group', { name: 'Challenge fretboard: find the third of C major' });
  await expect(first.locator('.fb-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guide me: find the root first' }).click();
  await page.getByRole('button', { name: 'Show one root' }).click();
  await first.getByRole('button', { name: /String 1, fret 8, C, root, marker R/ }).click();
  await first.getByRole('button', { name: /String 1, fret 12/ }).click();
  await expect(page.getByText(/E is the major third of C/)).toBeVisible();
  await page.getByRole('button', { name: /Try another key/ }).click();
  const second = page.getByRole('group', { name: 'Challenge fretboard: find the third of F major' });
  await expect(second.locator('.fb-note')).toHaveCount(0);
  await second.getByRole('button', { name: /String 2, fret 10/ }).click();
  await expect(page.getByText(/Two keys explored/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/You have completed this application challenge/)).toBeVisible();
});

test('tuner explains a simulated microphone denial', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied in test', 'NotAllowedError'); };
  });
  await page.goto('/tuner');
  await page.getByRole('button', { name: 'Start tuner' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission denied');
  await expect(page.getByRole('button', { name: 'Start tuner' })).toBeEnabled();
});

test('tuner detects a synthetic A2 stream and releases its tracks', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = 110;
      gain.gain.value = 0.2;
      oscillator.connect(gain).connect(destination);
      oscillator.start();
      await context.resume();
      window.__testMicrophone = destination.stream;
      return destination.stream;
    };
  });
  await page.goto('/tuner');
  await page.getByRole('button', { name: 'Start tuner' }).click();
  await expect(page.getByRole('button', { name: 'Stop tuner' })).toBeVisible();
  await expect(page.getByLabel('Microphone level')).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Tuning in cents' })).toHaveAttribute('aria-valuetext', /cents from A2/, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__testMicrophone?.getAudioTracks()[0]?.readyState)).toBe('live');
  await page.getByRole('button', { name: 'Stop tuner' }).click();
  expect(await page.evaluate(() => window.__testMicrophone?.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
});

test('browser microphone permission grant and denial', async ({ browser, baseURL }) => {
  const granted = await browser.newContext({ baseURL, permissions: ['microphone'], serviceWorkers: 'block' });
  const denied = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  try {
    await blockExternalNetwork(granted);
    await blockExternalNetwork(denied);
    const allowedPage = await granted.newPage();
    await allowedPage.goto('/tuner');
    // Some stripped serverless Chromium builds disable getUserMedia completely.
    // CI's official Playwright browser must support it; custom local builds may skip.
    const capability = await allowedPage.evaluate(async () => {
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.getTracks().forEach((track) => track.stop()); return 'supported'; }
      catch (error) { return (error as Error).name; }
    });
    if (capability === 'NotSupportedError' && !process.env.CI) test.skip(true, 'This local Chromium build has no microphone capture support.');
    expect(capability).toBe('supported');
    await allowedPage.getByRole('button', { name: 'Start tuner' }).click();
    await expect(allowedPage.getByRole('button', { name: 'Stop tuner' })).toBeVisible();
    await allowedPage.getByRole('button', { name: 'Stop tuner' }).click();

    await denied.grantPermissions([], { origin: baseURL });
    const deniedPage = await denied.newPage();
    await deniedPage.goto('/tuner');
    await deniedPage.getByRole('button', { name: 'Start tuner' }).click();
    await expect(deniedPage.getByRole('alert')).toContainText('Microphone permission denied');
  } finally {
    await granted.close();
    await denied.close();
  }
});

test('preview host checks allow only the explicitly configured remote name', async ({ request }) => {
  const trusted = await request.get('/', { headers: { Host: 'preview.frethub.test' } });
  const sibling = await request.get('/', { headers: { Host: 'other.preview.frethub.test' } });
  const attacker = await request.get('/', { headers: { Host: 'attacker.invalid' } });
  expect(trusted.status()).toBe(200);
  expect(sibling.status()).toBe(403);
  expect(attacker.status()).toBe(403);
});
