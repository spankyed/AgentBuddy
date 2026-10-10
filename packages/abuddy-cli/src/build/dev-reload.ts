import * as fs from 'node:fs';
import { resolveAppContext } from '@abuddy/sdk/env';
import type { AppBuild } from '@abuddy/sdk/env';
import { readApiEndpoint } from '@abuddy/host/process-liveness';
import { API_HOST, API_TOKEN_HEADER, errorMessage } from '@abuddy/sdk/utils/pure';

/**
 * Asking a running app to reload a pack's backend: the `/dev/reload` client, and what one came to.
 *
 * It lives beside the bundlers rather than in `commands/dev`, because two commands ask it — `dev` after
 * reinstalling, and `build --watch` after rebuilding the runtime — and `dev` already imports `build`, so
 * the second caller reaching into the first would close a cycle.
 */

/**
 * Where an app runs: its environment, and its data dir when a profile overrides the default. Leaving
 * `userDataDir` out is not the same as naming the default one — it lets `ABUDDY_USER_DATA_DIR` from the
 * caller's shell still apply, which is an escape hatch that predates profiles.
 */
/**
 * Where an app is: the build it is, and the profile it keeps its data in.
 *
 * The same pair `resolveAppContext` takes, under the same two words — it is handed straight to it, so a
 * second vocabulary here would be one translation step for nothing.
 */
export interface AppPlace {
  build: AppBuild;
  profile?: string;
}

/** The running app's API: its URL and the token it requires, from the files the API writes */
function findAppApi(place: AppPlace): { api: { url: string; token: string } } | { problem: string } {
  const { apiPortFile, apiTokenFile } = resolveAppContext(place);
  const endpoint = readApiEndpoint(apiPortFile);
  if (!endpoint) return { problem: `no running ${place.build} app in ${apiPortFile}` };
  let token: string;
  try {
    token = fs.readFileSync(apiTokenFile, 'utf-8').trim();
  } catch (err) {
    return { problem: `couldn't read ${apiTokenFile}: ${errorMessage(err)}` };
  }
  if (!token) return { problem: `${apiTokenFile} is empty` };
  return { api: { url: `http://${API_HOST}:${endpoint.port}`, token } };
}

/**
 * What a reload came to. `detail` says which of the several ways it went wrong this was, since they need
 * different things of the author: start the app, look at its logs, or check what is holding the port.
 */
export type DevReload =
  | { status: 'reloaded' }
  /** No port or token file to reach an app with */
  | { status: 'not-running'; detail: string }
  /** The app answered and refused, or couldn't reload */
  | { status: 'failed'; detail: string }
  /** Nothing answered on the port the app published */
  | { status: 'unreachable'; detail: string };

/** Asks the running app to reload a pack's runtime, with its API token. */
export async function reloadPack(packId: string, place: AppPlace = { build: 'development' }): Promise<DevReload> {
  const found = findAppApi(place);
  if ('problem' in found) return { status: 'not-running', detail: found.problem };
  try {
    const res = await fetch(`${found.api.url}/dev/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: found.api.token },
      body: JSON.stringify({ packId }),
    });
    if (res.ok) return { status: 'reloaded' };
    const body = await res.text().catch(() => '');
    return { status: 'failed', detail: `${res.status} ${res.statusText}${body.trim() ? `: ${body.trim()}` : ''}` };
  } catch (err) {
    return { status: 'unreachable', detail: `${found.api.url}: ${errorMessage(err)}` };
  }
}
