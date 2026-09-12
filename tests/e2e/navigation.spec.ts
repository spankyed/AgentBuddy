import { test, expect } from './fixtures/app';

test('navigate between plugins and screenshot each', async ({ app }) => {
  const ctx = await app.getContext();
  const availablePlugins = ctx.pluginIds;

  // Start at default plugin (should be threads)
  await app.screenshot('nav-start');

  // Navigate to a few known plugins and screenshot each
  const targets = ['code', 'notes', 'settings'].filter(id => availablePlugins.includes(id));

  for (const pluginId of targets) {
    await app.navigate(pluginId);
    const afterNav = await app.getContext();
    expect(afterNav.activePluginId).toBe(pluginId);
    await app.screenshot(`nav-${pluginId}`);
  }

  // Navigate back to the first plugin
  const firstPlugin = ctx.activePluginId;
  await app.navigate(firstPlugin);
  const finalCtx = await app.getContext();
  expect(finalCtx.activePluginId).toBe(firstPlugin);
  await app.screenshot('nav-return');
});
