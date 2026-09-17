// The API takes calls only with the token Electron main creates for each app run: the app's window connects with
// it, and a WebSocket or /dev/reload call without it (a web page's, say) is refused.
import { API_TOKEN_HEADER } from '@abuddy/sdk/env';
import { test, expect } from './fixtures/app';

/** Whether a WebSocket to `url` opens, or is refused */
function connects(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => { socket.close(); resolve(true); });
    socket.addEventListener('error', () => resolve(false));
  });
}

test('refuses API connections and reloads without the run token', async ({ appPage }) => {
  const { apiPort, apiToken } = await appPage.evaluate(() => {
    const api = (window as { electronAPI?: { apiPort?: number; apiToken?: string } }).electronAPI;
    return { apiPort: api?.apiPort, apiToken: api?.apiToken ?? '' };
  });
  expect(apiPort, 'the renderer knows the API port').toBeTruthy();
  expect(apiToken, 'the renderer knows the API token').toBeTruthy();
  const base = `127.0.0.1:${apiPort}`;

  expect(await connects(`ws://${base}/`)).toBe(false);
  expect(await connects(`ws://${base}/?token=guess`)).toBe(false);
  expect(await connects(`ws://${base}/?token=${encodeURIComponent(apiToken)}`)).toBe(true);

  const reload = (headers: Record<string, string>) => fetch(`http://${base}/dev/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ packId: 'no-such-pack' }),
  });
  expect((await reload({})).status).toBe(403);
  expect((await reload({ [API_TOKEN_HEADER]: 'guess' })).status).toBe(403);
  // With the token, the request reaches the reload itself, which fails for an unknown pack
  expect((await reload({ [API_TOKEN_HEADER]: apiToken })).status).not.toBe(403);
});
