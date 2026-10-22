import { fileURLToPath } from 'node:url';
import { test, expect } from '@apackdev/testing';

/**
 * What a replace or a restore costs before ownership settles, rather than `expect.poll`'s 5s default.
 *
 * Each follows an install and a frontend reload. Under the chain's concurrency the 5s default gave up
 * 28.4s into the test while the app was still working correctly, so the run failed on the poll rather
 * than on anything it was testing.
 *
 * **The spec's own 60s is the next constraint, and this does not fix that.** It passes at 43-50s warm,
 * so a poll that actually spends its 20s can push the test past its budget and report as a test timeout
 * instead of as the assertion that never settled. Raising one spec's Playwright budget has no precedent
 * here and `suite-timeouts` holds the shared 60s literal, so the honest fix is to make this spec cheaper
 * — it installs a pack four times — rather than to buy it more time.
 */
const SETTLES = { timeout: 20_000 };

test('an app default can be disabled, removed and restored while host settings remain usable', async ({ app, appPage }) => {
  await app.navigate('host/packs');
  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system
    .get('host/packs').getSnapshot().context.appPackSources.find((source: any) => source.id === 'default-setup')?.sourceRevision)).toBeTruthy();
  const source = await appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
    .getSnapshot().context.appPackSources.find((source: any) => source.id === 'default-setup'));
  let needsRestore = false;
  try {
    await appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .send({ type: 'UI.SELECT_PACK', packId: 'default-setup' }));
    await expect(appPage.getByTestId('pack-replacement')).toBeVisible();
    needsRestore = true;
    await appPage.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(appPage.getByRole('button', { name: 'Enable', exact: true })).toBeVisible();
    await expect(appPage.getByTestId('pack-replacement')).toBeVisible();
    await appPage.getByRole('button', { name: 'Remove', exact: true }).click();
    await appPage.getByTestId('pack-remove-confirmation').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(appPage.getByTestId('missing-app-defaults')).toBeVisible();
    await app.navigate('host/settings');
    await expect(appPage.getByRole('button', { name: 'General', exact: true })).toBeVisible();
    await app.navigate('host/packs');
    // The same verified bytes can be deliberately user-owned; ownership is never inferred by equality.
    await appPage.getByRole('combobox', { name: 'Pack operation' }).selectOption('replace');
    await appPage.getByRole('textbox', { name: 'Replacement pack ID' }).fill('default-setup');
    await appPage.getByPlaceholder('owner/repo, owner/repo@tag, or local path')
      .fill(fileURLToPath(new URL('../../../../../packages/default-setup/', import.meta.url)));
    await appPage.getByRole('button', { name: 'Replace', exact: true }).click();
    await app.waitForSurface('default-setup/threads');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith), SETTLES).toBe('user');
    await appPage.getByTestId('pack-restore').click();
    await appPage.getByTestId('pack-confirm-restore').click();
    await app.waitForSurface('default-setup/threads');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith), SETTLES).toBe('app');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.enabled), SETTLES).toBe(true);
    needsRestore = false;
  } finally {
    if (needsRestore) {
      await appPage.evaluate(source => (window as any).applicationState.system.get('host/packs')
        .send({ type: 'UI.RESTORE', packId: source.id, sourceRevision: source.sourceRevision }), source);
      await app.waitForSurface('default-setup/threads');
    }
  }
});
