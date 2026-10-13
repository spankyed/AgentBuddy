import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { test as base, expect } from '@apackdev/testing';

// A separate worker boots with a real disabled-pack record. No runtime facade, form or setting is mocked.
const test = base.extend<{}, { hostOnlyData: void }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture dependencies.
  hostOnlyData: [async ({}, use) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-host-settings-'));
    const previous = process.env.E2E_DATA_DIR;
    const { installedPacksFile } = resolveAppEnvironment({ env: 'test', userDataDir: directory });
    fs.mkdirSync(path.dirname(installedPacksFile), { recursive: true });
    fs.writeFileSync(installedPacksFile, JSON.stringify({ packs: [{ id: 'default-setup', enabled: false }] }));
    process.env.E2E_DATA_DIR = directory;
    try { await use(); }
    finally {
      if (previous === undefined) delete process.env.E2E_DATA_DIR;
      else process.env.E2E_DATA_DIR = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, { scope: 'worker', auto: true }],
});

test('host preferences and shortcuts work with default-setup disabled', async ({ app, appPage }) => {
  expect((await app.getContext()).pluginIds.some(id => id.startsWith('default-setup/'))).toBe(false);
  await app.navigate('host/settings');
  await appPage.getByRole('button', { name: 'General', exact: true }).click();
  await appPage.getByRole('button', { name: 'Personal', exact: true }).click();
  await appPage.getByLabel('Full Name', { exact: true }).fill('Host without a starter pack');
  await expect(appPage.getByText('Settings saved', { exact: true })).toBeVisible();
  await appPage.getByRole('button', { name: 'Application', exact: true }).click();
  await expect(appPage.getByRole('heading', { name: 'Keyboard Shortcuts', exact: true })).toBeVisible();
  await appPage.getByText('Previous Plugin', { exact: true }).locator('..').click();
  await appPage.keyboard.press('Control+Alt+9');
  await expect(appPage.getByText('Previous Plugin', { exact: true }).locator('..')).toContainText('9');
  await appPage.getByRole('heading', { name: 'Keyboard Shortcuts', exact: true }).click();
  await expect(appPage.getByText('Settings saved', { exact: true })).toBeVisible();
  await appPage.evaluate(() => (window as any).applicationState.system.get('host/settings')
    .send({ type: 'GENERAL_NAV.SELECT', item: 'json' }));
  await expect(appPage.getByRole('heading', { name: 'Settings JSON' })).toBeVisible();
  await expect(appPage.locator('.monaco-editor')).toBeVisible();
  const values = await appPage.evaluate(() => JSON.parse((window as any).monaco.editor.getEditors().find((editor: any) =>
    editor.getDomNode()?.getBoundingClientRect().width > 0 && editor.getModel()?.getLanguageId() === 'json').getModel().getValue()));
  expect(values.app.personal.name).toBe('Host without a starter pack');
  expect(values.app.hotkeys.switchPluginUp.key).toBe('9');
  await appPage.keyboard.press('Control+Alt+9');
  await expect.poll(async () => (await app.getContext()).activePluginId).not.toBe('host/settings');
});

test('shortcut drafts follow another window and preserve the global flag', async ({ app, appPage, electronApp }) => {
  await app.navigate('host/settings');
  await appPage.getByRole('button', { name: 'General', exact: true }).click();
  await appPage.getByRole('button', { name: 'Application', exact: true }).click();
  const opened = electronApp.waitForEvent('window');
  await appPage.evaluate(() => (window as any).electronAPI.plugins.popout('host/settings', 'Settings'));
  const second = await opened;
  try {
    await second.waitForLoadState('domcontentloaded');
    await second.evaluate(() => {
      const actor = (window as any).applicationState.system.get('host/settings');
      actor.send({ type: 'TAB.SELECT', tab: 'general' });
      actor.send({ type: 'GENERAL_NAV.SELECT', item: 'json' });
    });
    await expect(second.locator('.monaco-editor')).toBeVisible();
    await second.evaluate(() => {
      const model = (window as any).monaco.editor.getEditors().find((editor: any) =>
        editor.getDomNode()?.getBoundingClientRect().width > 0 && editor.getModel()?.getLanguageId() === 'json').getModel();
      const values = JSON.parse(model.getValue());
      values.app.hotkeys.switchPluginUp = { key: 'F8', modifiers: [], global: true };
      model.setValue(JSON.stringify(values, null, 2));
    });
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByText('Saved', { exact: true })).toBeVisible();
    const shortcut = appPage.getByText('Previous Plugin', { exact: true }).locator('..');
    await expect(shortcut).toContainText('F8');
    await expect(shortcut).toContainText('Global');
    await shortcut.click();
    await appPage.keyboard.press('F7');
    await expect(appPage.getByText('Settings saved', { exact: true })).toBeVisible();
    await expect.poll(() => second.evaluate(() => {
      const model = (window as any).monaco.editor.getEditors().find((editor: any) =>
        editor.getDomNode()?.getBoundingClientRect().width > 0 && editor.getModel()?.getLanguageId() === 'json').getModel();
      return JSON.parse(model.getValue()).app.hotkeys.switchPluginUp;
    })).toEqual({ key: 'F7', modifiers: [], global: true });
  } finally {
    await second.close();
  }
});
