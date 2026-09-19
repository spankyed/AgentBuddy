// `abuddy dev` rebuilds a pack and asks the running app to reload it, over POST /dev/reload. For an
// external pack that reload can be the app's first sight of it — `abuddy dev` installs into a running
// app — so it has to leave the pack both running and recorded as installed. The repo's own dev-reload
// spec covers the built-in path; this is the external one, against the real endpoint.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';
import { test, expect } from '@abuddy/testing';

const PACK_ID = 'e2e-fixture';

/** The installed packs the app has recorded, or null when it has no record at all */
function recordedPacks(userDataDir: string): { id: string; enabled: boolean }[] | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(userDataDir, 'installed-packs.json'), 'utf-8')).packs;
  } catch {
    return null;
  }
}

test('a reloaded pack is left running and recorded as installed', async ({ app, appPage, electronApp }) => {
  const { apiPort, apiToken } = await appPage.evaluate(() => {
    const api = (window as { electronAPI?: { apiPort?: number; apiToken?: string } }).electronAPI;
    return { apiPort: api?.apiPort, apiToken: api?.apiToken ?? '' };
  });
  expect(apiPort, 'the renderer knows the API port').toBeTruthy();
  expect(apiToken, 'the renderer knows the API token').toBeTruthy();
  const userDataDir = await electronApp.evaluate(({ app: electron }) => electron.getPath('userData'));

  await app.waitForPlugin('memos');
  // Stands in for the pack this app has never seen: `abuddy dev` installs one into a running app and
  // asks for a reload, and nothing has written a record for it. Removing the record is the same state,
  // and the one this suite can reach with the pack it already has installed.
  fs.rmSync(path.join(userDataDir, 'installed-packs.json'), { force: true });
  expect(recordedPacks(userDataDir)).toBeNull();

  const response = await fetch(`http://127.0.0.1:${apiPort}/dev/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: apiToken },
    body: JSON.stringify({ packId: PACK_ID }),
  });
  expect(response.status, await response.text()).toBe(200);

  await expect.poll(() => recordedPacks(userDataDir), { timeout: 15_000 })
    .toContainEqual(expect.objectContaining({ id: PACK_ID, enabled: true }));

  // Recorded is not enough: the pack has to have come back up, which its plugin answering shows
  await app.navigate('memos');
  const text = `memo after reload ${Date.now()}`;
  await appPage.getByTestId('memo-input').fill(text);
  await appPage.getByTestId('memo-add').click();
  await expect(appPage.getByTestId('memo-list').getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 });
});
