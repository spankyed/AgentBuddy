import { test, expect } from '@apackdev/testing';

// Every plugin renders as part of itself (usePlugin() in its components), its settings included, which the settings
// plugin renders for each plugin in turn: a component that reaches for a plugin it isn't rendered in fails here
test('opens every plugin, and every plugin\'s settings, without a renderer error', async ({ app, appPage }) => {
  const errors: string[] = [];
  appPage.on('pageerror', (error) => errors.push(error.message));
  appPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await app.waitForPlugin('default-setup/threads');
  const { pluginIds, activePluginId: first } = await app.getContext();
  expect(pluginIds.length).toBeGreaterThan(5);

  for (const pluginId of pluginIds) {
    await app.navigate(pluginId);
    expect((await app.getContext()).activePluginId).toBe(pluginId);
  }

  const settings = 'host/settings';
  await app.navigate(settings);
  await appPage.evaluate((ref) => (window as any).applicationState.system.get(ref).send({ type: 'TAB.SELECT', tab: 'features' }), settings);
  // Read the declared preferences rendered by Settings, rather than removed plugin metadata.
  const choices = appPage.locator('button[data-active]');
  await expect.poll(() => choices.count()).toBeGreaterThan(5);
  const featureIds = await choices.locator('span').allTextContents();
  for (const featureId of featureIds) {
    await choices.filter({ hasText: featureId }).click();
    await expect(choices.filter({ hasText: featureId })).toHaveAttribute('data-active', 'true');
    await expect(appPage.getByTitle('Reset to defaults')).toBeVisible();
  }

  await app.navigate(first);
  expect(errors).toEqual([]);
});


test('an open feature form follows its settings being reset', async ({ app, appPage }) => {
  await app.waitForPlugin('default-setup/code');
  await app.navigate('host/settings');
  await appPage.evaluate(() => {
    const settings = (window as any).applicationState.system.get('host/settings');
    settings.send({ type: 'FEATURE.SELECT', featureId: 'default-setup/code' });
    settings.send({ type: 'TAB.SELECT', tab: 'features' });
  });
  const restoreTerminals = appPage.locator('#restore-terminals');
  await expect(restoreTerminals).toBeChecked();
  await restoreTerminals.uncheck();
  await expect(appPage.getByText('Settings saved', { exact: true })).toBeVisible();
  await appPage.getByTitle("Reset to defaults").click();
  await appPage.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(restoreTerminals).toBeChecked();
});
