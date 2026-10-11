// `apack dev` and the built-in pack's watcher rebuild a pack and then POST /dev/reload. The reload has to
// leave the pack as a boot would: its runtime pointed at the compiled content, and content a rebuild changed
// imported. This drives the real endpoint against the running app, and the library's index is what shows it.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Page } from '@playwright/test';
import { API_TOKEN_HEADER } from '@apack/sdk/utils/pure';
import { test, expect } from '@apack/testing';

const CONTENT_FILE = path.resolve(import.meta.dirname, '../../../packages/default-setup/dist/runtime/content/library.content.json');
const WRITTEN_DOCUMENT = 'Codex commands';
const REBUILT_DOCUMENT = 'Codex commands after a rebuild';

interface LibraryRecord { entity?: string; name?: string; children?: LibraryRecord[] }

/** The names in the library plugin's index, as its actor holds them */
async function libraryDocuments(appPage: Page): Promise<string[]> {
  return appPage.evaluate(() => {
    const actor = (window as { applicationState?: { system?: { get(id: string): { getSnapshot(): { context: { index?: { documents: Array<{ name: string }> } } } } | undefined } } }).applicationState?.system?.get('default-setup/library');
    return (actor?.getSnapshot().context.index?.documents ?? []).map((document) => document.name);
  });
}

/** Renames a compiled record, as recompiling the pack's content sources after an edit would */
function renameWrittenDocument(records: LibraryRecord[], from: string, to: string): boolean {
  for (const record of records) {
    if (record.entity === 'Document' && record.name === from) {
      record.name = to;
      return true;
    }
    if (record.children && renameWrittenDocument(record.children, from, to)) return true;
  }
  return false;
}

/**
 * The test edits a compiled content file in the checkout, so the restore can't live in the test body: a
 * Playwright timeout rejects the test without unwinding it, and a `finally` left unrun would leave the
 * renamed document on disk, failing every later run on its first assertion. A hook runs either way.
 */
let originalContentFile: Buffer | undefined;
test.afterEach(() => {
  if (originalContentFile) fs.writeFileSync(CONTENT_FILE, originalContentFile);
  originalContentFile = undefined;
});

test('a rebuilt built-in pack reloads with the content the rebuild changed', async ({ app, appPage }) => {
  const { apiPort, apiToken } = await appPage.evaluate(() => {
    const api = (window as { electronAPI?: { apiPort?: number; apiToken?: string } }).electronAPI;
    return { apiPort: api?.apiPort, apiToken: api?.apiToken ?? '' };
  });
  expect(apiPort, 'the renderer knows the API port').toBeTruthy();
  expect(apiToken, 'the renderer knows the API token').toBeTruthy();

  await app.navigate('default-setup/library');
  await expect.poll(() => libraryDocuments(appPage)).toContain(WRITTEN_DOCUMENT);

  originalContentFile = fs.readFileSync(CONTENT_FILE);
  const content = JSON.parse(originalContentFile.toString()) as { records: LibraryRecord[] };
  expect(renameWrittenDocument(content.records, WRITTEN_DOCUMENT, REBUILT_DOCUMENT), `${CONTENT_FILE} holds "${WRITTEN_DOCUMENT}"`).toBe(true);
  fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));

  const response = await fetch(`http://127.0.0.1:${apiPort}/dev/reload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: apiToken },
    body: JSON.stringify({ packId: 'default-setup' }),
  });
  expect(response.status, await response.text()).toBe(200);

  // The reload re-applies, its systems get CLIENT_CONNECTED again, and the plugin's index carries the change
  await expect.poll(() => libraryDocuments(appPage), { timeout: 15_000 }).toContain(REBUILT_DOCUMENT);
});
