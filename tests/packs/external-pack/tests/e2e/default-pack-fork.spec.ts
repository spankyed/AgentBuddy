import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { API_TOKEN_HEADER } from '@apackdev/sdk/utils/pure';
import { test, expect } from '@apackdev/testing';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
let archive: string;

const bootCheck = process.env.APACK_FORK_BOOT_CHECK;
const restarting = !!bootCheck;

test.beforeAll(() => {
  if (restarting) return;
  const prepared = path.join(root, 'node_modules/.cache/apack-fixtures/default-fork');
  const file = path.join(prepared, 'fork.json');
  expect(fs.existsSync(file), 'Run npm run test:external-pack:fork to prepare the default fork').toBe(true);
  archive = path.join(prepared, JSON.parse(fs.readFileSync(file, 'utf8')).archive);
  expect(fs.existsSync(archive)).toBe(true);
  expect(fs.existsSync(`${archive}.sha256`)).toBe(true);
});

if (!restarting) test('an externally built default fork refreshes both windows and survives actual dev reload', async ({ app, appPage, electronApp }) => {
  // Replacement/reload each await a frontend publication (30s); windows, UI and restoration share 90s.
  // Individual value assertions and the restoration assertion retain their existing 5s limits.
  test.setTimeout(150_000);
  await app.navigate('host/settings');
  await appPage.getByRole('button', { name: 'Personal', exact: true }).click();
  const preferenceWindow = electronApp.waitForEvent('window');
  await appPage.evaluate(() => (window as any).electronAPI.plugins.popout('host/settings', 'Settings'));
  const observer = await preferenceWindow;
  try {
    await observer.waitForLoadState('domcontentloaded');
    await observer.getByRole('button', { name: 'Personal', exact: true }).click();
    await appPage.getByLabel('Full Name', { exact: true }).fill('Fork acceptance preferences');
    // A local draft is not stored data: require the accepted value in an independent window first.
    await expect(observer.getByLabel('Full Name', { exact: true })).toHaveValue('Fork acceptance preferences');
  } finally { await observer.close(); }
  await app.navigate('host/packs');
  const source = await appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
    .getSnapshot().context.appPackSources.find((source: any) => source.id === 'default-setup'));
  const opened = electronApp.waitForEvent('window');
  await appPage.evaluate(() => (window as any).electronAPI.plugins.popout('host/packs', 'Packs'));
  const second = await opened;
  let replaced = false;
  const label = (page: typeof appPage) => page.evaluate(() => (window as any).applicationState.getSnapshot()
    .context.plugins.find((plugin: any) => plugin.id === 'default-setup/notes')?.label);
  const runtime = (page: typeof appPage) => page.evaluate(() => (window as any).applicationState?.getSnapshot()
    .context.acceptedPackRuntimes['default-setup'] as string | undefined);
  const waitForReplacement = (page: typeof appPage, previous: string | undefined) => expect.poll(async () => {
    const current = await runtime(page);
    return !!current && current !== previous;
  }, { timeout: 30_000, message: 'replacement frontend accepted in this window' }).toBe(true);
  try {
    await second.waitForLoadState('domcontentloaded');
    await appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .send({ type: 'UI.SELECT_PACK', packId: 'default-setup' }));
    await appPage.getByTestId('pack-replacement').locator('input').fill(archive);
    const beforeReplace = await runtime(appPage);
    expect(beforeReplace, 'the incumbent frontend has been accepted').toBeTruthy();
    replaced = true;
    await appPage.getByTestId('pack-replace').click();
    await Promise.all([waitForReplacement(appPage, beforeReplace), waitForReplacement(second, beforeReplace)]);
    await expect.poll(() => label(appPage)).toBe('Fork Notes');
    await expect.poll(() => label(second)).toBe('Fork Notes');
    await app.navigate('default-setup/notes');
    await expect(appPage.getByTestId('fork-component')).toBeVisible();
    await expect(second.getByText('Acceptance fork', { exact: true })).toBeVisible();
    const previous = await runtime(appPage);
    const api = await appPage.evaluate(() => ({ port: (window as any).electronAPI.apiPort, token: (window as any).electronAPI.apiToken }));
    const response = await fetch(`http://127.0.0.1:${api.port}/dev/reload`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', [API_TOKEN_HEADER]: api.token }, body: JSON.stringify({ packId: 'default-setup' }),
    });
    expect(response.status, await response.text()).toBe(200);
    await Promise.all([waitForReplacement(appPage, previous), waitForReplacement(second, previous)]);
    await expect.poll(() => label(appPage)).toBe('Fork Notes');
    await expect.poll(() => label(second)).toBe('Fork Notes');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith)).toBe('user');
    await app.navigate('host/settings');
    await appPage.getByRole('button', { name: 'Personal', exact: true }).click();
    await expect(appPage.getByLabel('Full Name', { exact: true })).toHaveValue('Fork acceptance preferences');
    if (process.env.APACK_KEEP_FORK === '1') {
      const data = process.env.E2E_DATA_DIR;
      if (!data) throw new Error('Persisted fork acceptance requires caller-owned E2E_DATA_DIR');
      const context = resolveAppEnvironment({ env: 'test', userDataDir: data });
      fs.copyFileSync(path.join(context.packsDir, 'default-setup', 'integrity.json'), path.join(data, 'accepted-fork-receipt.json'));
    }
  } finally {
    await second.close();
    if (replaced && process.env.APACK_KEEP_FORK !== '1') {
      await appPage.evaluate(source => (window as any).applicationState.system.get('host/packs')
        .send({ type: 'UI.RESTORE', packId: source.id, sourceRevision: source.sourceRevision }), source);
      await expect.poll(() => label(appPage)).toBe('Notes');
    }
  }
});


if (restarting) test('default lifecycle survives normal boot', async ({ app, appPage }) => {
  const data = process.env.E2E_DATA_DIR;
  if (!data) throw new Error('Restart acceptance requires caller-owned E2E_DATA_DIR');
  const context = resolveAppEnvironment({ env: 'test', userDataDir: data });
  if (bootCheck === 'removed') {
    expect(fs.existsSync(path.join(context.packsDir, 'default-setup'))).toBe(false);
    const { packs: records } = JSON.parse(fs.readFileSync(context.installedPacksFile, 'utf8'));
    expect(records.find((record: any) => record.id === 'default-setup')).toMatchObject({ suppressAppInstall: true });
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot()
      .context.plugins.some((plugin: any) => plugin.id.startsWith('default-setup/')))).toBe(false);
    await app.navigate('host/packs');
    await expect(appPage.getByTestId('missing-app-defaults')).toBeVisible();
  } else {
    if (bootCheck === 'fork') expect(fs.readFileSync(path.join(context.packsDir, 'default-setup', 'integrity.json'), 'utf8'))
      .toBe(fs.readFileSync(path.join(data, 'accepted-fork-receipt.json'), 'utf8'));
    else if (bootCheck !== 'restored') throw new Error(`Unknown fork boot phase: ${bootCheck}`);
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot()
      .context.plugins.find((plugin: any) => plugin.id === 'default-setup/notes')?.label)).toBe(bootCheck === 'fork' ? 'Fork Notes' : 'Notes');
    await app.navigate('host/packs');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith)).toBe(bootCheck === 'fork' ? 'user' : 'app');
  }
  await app.navigate('host/settings');
  await appPage.getByRole('button', { name: 'Personal', exact: true }).click();
  await expect(appPage.getByLabel('Full Name', { exact: true })).toHaveValue('Fork acceptance preferences');
});
