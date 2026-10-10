// `abuddy dev` rebuilds a pack and asks the running app to reload it, over POST /dev/reload. For an
// external pack that reload can be the app's first sight of it — `abuddy dev` installs into a running
// app — so it has to leave the pack running. The repo's own dev-reload spec covers the built-in path;
// this is the external one, against the real endpoint.
import { API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';
import { test, expect } from '@abuddy/testing';

const PACK_ID = 'e2e-fixture';

test('a reloaded pack is left running', async ({ app, appPage }) => {
  const { apiPort, apiToken } = await appPage.evaluate(() => {
    const api = (window as { electronAPI?: { apiPort?: number; apiToken?: string } }).electronAPI;
    return { apiPort: api?.apiPort, apiToken: api?.apiToken ?? '' };
  });
  expect(apiPort, 'the renderer knows the API port').toBeTruthy();
  expect(apiToken, 'the renderer knows the API token').toBeTruthy();

  await app.waitForPlugin('memos');

  const response = await fetch(`http://127.0.0.1:${apiPort}/dev/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: apiToken },
    body: JSON.stringify({ packId: PACK_ID }),
  });
  expect(response.status, await response.text()).toBe(200);

  // The pack has to have come back up, which its plugin answering shows
  await app.navigate('memos');
  const text = `memo after reload ${Date.now()}`;
  await appPage.getByTestId('memo-input').fill(text);
  await appPage.getByTestId('memo-add').click();
  await expect(appPage.getByTestId('memo-list').getByText(text, { exact: true })).toBeVisible({ timeout: 15_000 });
});
