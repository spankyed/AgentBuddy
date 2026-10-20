import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, type ElectronApplication } from '@playwright/test';
import { waitForAppReady } from '@apackdev/testing';
import { appLaunchEnv } from '../../../packages/apack-testing/src/launch-env.ts';
import { readSettingsOverrides } from '@apackdev/host/database';
import { untypedTx, type EARS } from '@apackdev/ears';
import { writeData } from '../../../packages/apack-host/tests/database/fixtures.ts';
import { assertCompilerTestRunner } from '../../../packages/apack-cli/tests/_support/compiler-test-runner.ts';

const root = path.resolve(import.meta.dirname, '../../..');

test('repairs invalid persisted settings in the app and starts packs only after reopening', async ({ playwright }, testInfo) => {
  assertCompilerTestRunner();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-recovery-app-'));
  const unavailable = { 'unavailable/notes': { keep: true } };
  let app: ElectronApplication | undefined;
  const launch = async () => {
    app = await playwright._electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [root], cwd: root,
      env: appLaunchEnv(process.env, userDataDir) });
    const log = fs.createWriteStream(testInfo.outputPath(`app-${Date.now()}.log`));
    app.process().stdout?.pipe(log, { end: false });
    app.process().stderr?.pipe(log, { end: false });
    app.once('close', () => log.end());
    return app.firstWindow();
  };
  try {
    await writeData(userDataDir, () => {
      untypedTx('Settings-app' as EARS.EntityId, true).put('entityType', 'Settings').put('data', {
        app: { projects: 'invalid' },
        features: { ...unavailable, 'default-setup/code': { defaultBaseDirectory: 123 } },
      });
    });
    const page = await launch();
    await expect(page.getByRole('heading', { name: 'Settings need attention' })).toBeVisible();
    await expect(page.getByText('features/default-setup/code', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Reset selected groups' }).click();
    await page.getByRole('button', { name: 'Confirm reset' }).click();
    await expect(page.getByRole('heading', { name: 'Settings repaired' })).toBeVisible();
    // A fresh window runtime must retain the restart requirement, rather than try to run a host-only shell.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Settings repaired' })).toBeVisible();
    await app!.close();
    app = undefined;
    expect(readSettingsOverrides(userDataDir)).toEqual({ features: unavailable });

    const restarted = await launch();
    await waitForAppReady(restarted);
    await expect(restarted.getByRole('heading', { name: 'Settings need attention' })).toHaveCount(0);
    await expect.poll(() => restarted.evaluate(() => (window as any).applicationState
      .getSnapshot().context.acceptedPackRuntimes['default-setup'])).toBeTruthy();
  } finally {
    await app?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
