import { fileURLToPath } from 'node:url';
import { test, expect } from '@apackdev/testing';

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
    await app.waitForPlugin('default-setup/threads');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith)).toBe('user');
    await appPage.getByTestId('pack-restore').click();
    await appPage.getByTestId('pack-confirm-restore').click();
    await app.waitForPlugin('default-setup/threads');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.updatesWith)).toBe('app');
    await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system.get('host/packs')
      .getSnapshot().context.packs.find((pack: any) => pack.id === 'default-setup')?.enabled)).toBe(true);
    needsRestore = false;
  } finally {
    if (needsRestore) {
      await appPage.evaluate(source => (window as any).applicationState.system.get('host/packs')
        .send({ type: 'UI.RESTORE', packId: source.id, sourceRevision: source.sourceRevision }), source);
      await app.waitForPlugin('default-setup/threads');
    }
  }
});
