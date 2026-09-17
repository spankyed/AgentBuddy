// `abuddy dev` and the built-in pack's watcher rebuild a pack and then POST /dev/reload. The reload has to
// leave the pack as a boot would: its runtime pointed at the compiled seeds, and seed data a rebuild changed
// imported. This drives the real endpoint against the running app, and the library's index is what shows it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { API_TOKEN_HEADER } from '@abuddy/sdk/utils/pure';
import { test, expect } from './fixtures/app';

const SEED_FILE = path.resolve(import.meta.dirname, '../../packages/default-setup/dist/library.seed.json');
const SEEDED_DOCUMENT = 'Codex commands';
const REBUILT_DOCUMENT = 'Codex commands after a rebuild';

interface LibraryRecord { entity?: string; name?: string; children?: LibraryRecord[] }

/** The names in the library plugin's index, as its actor holds them */
async function libraryDocuments(appPage: Page): Promise<string[]> {
  return appPage.evaluate(() => {
    const actor = (window as { applicationState?: { system?: { get(id: string): { getSnapshot(): { context: { index?: { documents: Array<{ name: string }> } } } } | undefined } } }).applicationState?.system?.get('library');
    return (actor?.getSnapshot().context.index?.documents ?? []).map((document) => document.name);
  });
}

/** Renames a compiled record, as recompiling the pack's seed sources after an edit would */
function renameSeededDocument(records: LibraryRecord[], from: string, to: string): boolean {
  for (const record of records) {
    if (record.entity === 'Document' && record.name === from) {
      record.name = to;
      return true;
    }
    if (record.children && renameSeededDocument(record.children, from, to)) return true;
  }
  return false;
}

/**
 * The test edits a compiled seed file in the checkout, so the restore can't live in the test body: a
 * Playwright timeout rejects the test without unwinding it, and a `finally` left unrun would leave the
 * renamed document on disk, failing every later run on its first assertion. A hook runs either way.
 */
let originalSeedFile: Buffer | undefined;
test.afterEach(() => {
  if (originalSeedFile) fs.writeFileSync(SEED_FILE, originalSeedFile);
  originalSeedFile = undefined;
});

test('a rebuilt built-in pack reloads with the seed data the rebuild changed', async ({ app, appPage }) => {
  const { apiPort, apiToken } = await appPage.evaluate(() => {
    const api = (window as { electronAPI?: { apiPort?: number; apiToken?: string } }).electronAPI;
    return { apiPort: api?.apiPort, apiToken: api?.apiToken ?? '' };
  });
  expect(apiPort, 'the renderer knows the API port').toBeTruthy();
  expect(apiToken, 'the renderer knows the API token').toBeTruthy();

  await app.navigate('library');
  await expect.poll(() => libraryDocuments(appPage)).toContain(SEEDED_DOCUMENT);

  originalSeedFile = fs.readFileSync(SEED_FILE);
  const seeds = JSON.parse(originalSeedFile.toString()) as { records: LibraryRecord[] };
  expect(renameSeededDocument(seeds.records, SEEDED_DOCUMENT, REBUILT_DOCUMENT), `${SEED_FILE} holds "${SEEDED_DOCUMENT}"`).toBe(true);
  fs.writeFileSync(SEED_FILE, JSON.stringify(seeds, null, 2));

  const response = await fetch(`http://127.0.0.1:${apiPort}/dev/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: apiToken },
    body: JSON.stringify({ packId: 'default-setup', builtIn: true }),
  });
  expect(response.status, await response.text()).toBe(200);

  // The reload re-seeds, its systems get CLIENT_CONNECTED again, and the plugin's index carries the change
  await expect.poll(() => libraryDocuments(appPage), { timeout: 15_000 }).toContain(REBUILT_DOCUMENT);
});
