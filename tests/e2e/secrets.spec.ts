// Settings → Secrets end to end: API keys added and selected in the UI go to the host's encrypted store through the
// secrets procedures, and the key strings end up in no log, stored file or renderer state.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from './fixtures/app';

const RUN = Date.now().toString(36);
const WORK_KEY = `sk-proj-E2EWORK${RUN}abcdefghijklmnop`;
const PERSONAL_KEY = `sk-proj-E2EPERSONAL${RUN}abcdefghijklmnop`;

/** Every file under a directory */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Whether any of `needles` appears in `file` from `from` bytes in, read in chunks.
 *
 * Bounded memory on purpose: the app's logs directory is shared by every test run on this machine and
 * its app-events.log reaches tens of GB, which readFileSync refuses outright.
 */
function containsFrom(file: string, from: number, needles: string[]): boolean {
  const chunk = 8 << 20;
  const overlap = Math.max(...needles.map((needle) => needle.length)) - 1;
  const buffer = Buffer.alloc(chunk + overlap);
  const fd = fs.openSync(file, 'r');
  try {
    let carried = 0;
    let position = from;
    for (;;) {
      const read = fs.readSync(fd, buffer, carried, chunk, position);
      if (read === 0) return false;
      position += read;
      const view = buffer.subarray(0, carried + read);
      if (needles.some((needle) => view.includes(needle))) return true;
      carried = Math.min(overlap, view.length);
      view.subarray(view.length - carried).copy(buffer, 0);
    }
  } finally {
    fs.closeSync(fd);
  }
}

test('adds, selects and stores API keys without the key strings reaching logs, files or renderer state', async ({ app, appPage, electronApp }) => {
  const { userData, logs } = await electronApp.evaluate(({ app: electron }) => ({ userData: electron.getPath('userData'), logs: electron.getPath('logs') }));
  // Where each file stood before a key was ever typed, so the scan below reads only what this test wrote.
  // The logs directory is shared by every run on this machine, so its history is neither ours nor bounded.
  const before = new Map([...filesUnder(userData), ...filesUnder(logs)].map((file) => [file, fs.statSync(file).size]));

  await app.navigate('settings');
  await appPage.evaluate(() => {
    (window as any).applicationState.system.get('settings').send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
  });

  const openai = appPage.locator('[data-testid="secrets-provider-openai"]');
  await expect(openai).toBeVisible();
  // The test environment keeps the data key in a file: said plainly
  await expect(appPage.locator('[data-testid="secrets-protection"]')).toContainText('file on this system');

  // The first key: labelled after the provider by default
  await openai.locator('input[type="password"]').fill(WORK_KEY);
  await openai.locator('input').first().fill('Work');
  await openai.locator('button[title="Save"]').click();
  await expect(openai.locator('[data-testid="secret-Work"]')).toBeVisible();

  // A second account's key, then selected
  await openai.getByText('Add another key').click();
  await openai.locator('input[placeholder="Label, e.g. Work"]').fill('Personal');
  await openai.locator('input[type="password"]').fill(PERSONAL_KEY);
  await openai.locator('button[title="Save"]').click();
  await openai.locator('[data-testid="secret-Personal"] input[type="radio"]').check();

  const secrets = () => appPage.evaluate(() => (window as any).applicationState.system.get('settings').getSnapshot().context.secrets as Array<{ label: string; provider: string; selected: boolean }>);
  await expect.poll(async () => (await secrets()).map((secret) => [secret.provider, secret.label, secret.selected])).toEqual([
    ['openai', 'Work', false],
    ['openai', 'Personal', true],
  ]);
  await expect(appPage.locator('[data-testid="secrets-error"]')).toHaveCount(0);

  // Nothing the renderer holds, and nothing on disk or in the logs, contains a key
  const rendererState = await appPage.evaluate(() => JSON.stringify((window as any).applicationState.system.get('settings').getSnapshot().context));
  expect(rendererState).not.toContain('E2EWORK');
  expect(rendererState).not.toContain('E2EPERSONAL');

  const files = [...filesUnder(userData), ...filesUnder(logs)];
  expect(files.some((file) => file.endsWith('secrets.json'))).toBe(true);
  const leaking = files.filter((file) => containsFrom(file, before.get(file) ?? 0, ['E2EWORK', 'E2EPERSONAL']));
  expect(leaking).toEqual([]);
});
