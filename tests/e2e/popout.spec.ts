import { test, expect } from './fixtures/app';

// A plugin popped out into its own window: main accepts the plugin's ref as its id, and the popout renders the
// plugin's canvas as part of that plugin (usePlugin() in its components)
test('pops a built-in plugin out into its own window, which renders it', async ({ appPage, electronApp }) => {
  const opened = electronApp.waitForEvent('window');
  await appPage.evaluate(() => (window as any).electronAPI.plugins.popout('default-setup/notes', 'Notes'));
  const popout = await opened;

  const errors: string[] = [];
  popout.on('pageerror', (error) => errors.push(error.message));
  popout.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  expect(new URL(popout.url()).searchParams.get('pluginId')).toBe('default-setup/notes');
  await popout.waitForLoadState('domcontentloaded');
  await expect(popout.getByTestId('notes-canvas')).toBeVisible({ timeout: 15_000 });
  expect(await popout.evaluate(() => (window as any).__errorPageShown ?? false)).toBe(false);
  expect(errors).toEqual([]);
});
