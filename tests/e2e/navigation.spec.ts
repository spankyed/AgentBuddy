import { test, expect } from './fixtures/app';

// Every plugin renders as part of itself (usePlugin() in its components), its settings included, which the settings
// plugin renders for each plugin in turn: a component that reaches for a plugin it isn't rendered in fails here
test('opens every plugin, and every plugin\'s settings, without a renderer error', async ({ app, appPage }) => {
  const errors: string[] = [];
  appPage.on('pageerror', (error) => errors.push(error.message));
  appPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  const { pluginIds, activePluginId: first } = await app.getContext();
  expect(pluginIds.length).toBeGreaterThan(5);

  for (const pluginId of pluginIds) {
    await app.navigate(pluginId);
    expect((await app.getContext()).activePluginId).toBe(pluginId);
    await app.screenshot(`nav-${pluginId.replace('/', '-')}`);
  }

  const settings = 'host/settings';
  await app.navigate(settings);
  const withSettings: string[] = await appPage.evaluate(() =>
    (window as any).applicationState.getSnapshot().context.plugins.filter((p: any) => p.settings).map((p: any) => p.id));
  expect(withSettings.length).toBeGreaterThan(5);
  await appPage.evaluate((ref) => (window as any).applicationState.system.get(ref).send({ type: 'TAB.SELECT', tab: 'plugins' }), settings);
  for (const pluginId of withSettings) {
    await appPage.evaluate(([ref, id]) => (window as any).applicationState.system.get(ref).send({ type: 'PLUGIN.SELECT', pluginId: id }), [settings, pluginId]);
    await appPage.waitForTimeout(150);
  }

  await app.navigate(first);
  expect(errors).toEqual([]);
});
