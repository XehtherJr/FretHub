import { expect, test, blockExternalNetwork } from './support/test';
import { FakeSupabase, signIn, type FakeSnapshot } from './support/fakeSupabase';

const empty: FakeSnapshot = { version: 3, favorites: {}, notes: {}, lessons: {}, progressions: {} };

test('two isolated browsers merge different offline edits after a forced revision race', async ({ browser }) => {
  const cloud = new FakeSupabase();
  const firstContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' });
  const secondContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4175', serviceWorkers: 'block' });
  try {
    await blockExternalNetwork(firstContext);
    await blockExternalNetwork(secondContext);
    await cloud.attach(firstContext);
    await cloud.attach(secondContext);
    const first = await firstContext.newPage();
    const second = await secondContext.newPage();
    await signIn(first);
    await signIn(second);
    expect(cloud.row?.revision).toBe(1);
    cloud.offline = true;
    await first.goto('/chords/C/major');
    await second.goto('/chords/G/major');
    await first.getByRole('button', { name: /☆ Save/ }).click();
    await second.getByRole('button', { name: /☆ Save/ }).click();
    await expect(first.getByRole('button', { name: /★ Saved/ })).toBeVisible();
    await expect(second.getByRole('button', { name: /★ Saved/ })).toBeVisible();
    await first.goto('/library');
    await second.goto('/library');
    // Supabase retries failed GETs with exponential backoff before reporting an error.
    await expect(first.getByText(/Could not sync/)).toBeVisible({ timeout: 12_000 });
    await expect(second.getByText(/Could not sync/)).toBeVisible({ timeout: 12_000 });
    cloud.offline = false;
    cloud.raceNextUpdates();
    await Promise.all([
      first.getByRole('button', { name: 'Sync now' }).click(),
      second.getByRole('button', { name: 'Sync now' }).click(),
    ]);
    await expect.poll(() => Object.keys(cloud.row?.data.favorites ?? {}).sort()).toEqual(['C|major', 'G|major']);
    expect(cloud.conflicts).toBeGreaterThanOrEqual(1);
    expect(cloud.row?.revision).toBeGreaterThanOrEqual(3);
    await first.getByRole('button', { name: 'Sync now' }).click();
    await second.getByRole('button', { name: 'Sync now' }).click();
    for (const page of [first, second]) {
      await expect(page.getByRole('heading', { name: 'Favorites (2)' })).toBeVisible();
      await expect(page.getByRole('link', { name: /C major/ }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /G major/ }).first()).toBeVisible();
    }
  } finally {
    await firstContext.close();
    await secondContext.close();
  }
});

test('upgrades an older cloud snapshot without changing its saved progression', async ({ context, page }) => {
  const old: FakeSnapshot = {
    ...empty,
    version: 2,
    favorites: { 'C|major': { value: true, modified: 2 } },
    progressions: { 'legacy-song': { modified: 3, value: {
      id: 'legacy-song', name: 'Old progression', tuningId: 'standard', capo: 0, bpm: 90, loop: false,
      difficulty: 'beginner', difficultyMode: 'manual',
      chords: [{ id: 'legacy-chord', name: 'C', frets: [null, 3, 2, 0, 1, 0], beats: 4 }],
    } } },
  };
  const cloud = new FakeSupabase(old);
  await cloud.attach(context);
  await signIn(page);
  expect(cloud.row?.data.version).toBe(3);
  expect(cloud.row?.data.progressions['legacy-song']).toEqual(old.progressions['legacy-song']);
  await page.getByRole('link', { name: /Old progression/ }).click();
  await expect(page.getByLabel('Playback style')).toHaveValue('single');
  await expect(page.getByRole('button', { name: 'Edit chord 1, C' })).toBeVisible();
});
