// Pack code names a feature (`'code'`, `'default-setup/logs'`) and the app addresses it (`default-setup/code`).
// Each case here is a path where a name had to become an address and, when it didn't, the app went on running
// with the click or the setting silently lost. Nothing below the running app catches that: these are the tests.
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/app';

type SettingsUpdate = { entityType: 'plugin'; label: string; path: string[]; value: unknown };

/** Changes a setting the way the Settings UI does: through the settings plugin, naming the plugin by feature */
async function updateSetting(page: Page, update: SettingsUpdate): Promise<void> {
  await page.evaluate((u) => {
    (window as any).applicationState.system.get('default-setup/settings').send({ type: 'SETTINGS.UPDATE', ...u });
  }, update);
}

/** Records the event types a plugin's actor receives from here on */
async function recordEvents(page: Page, pluginId: string): Promise<() => Promise<string[]>> {
  await page.evaluate((id) => {
    const win = window as any;
    win.__addressingEvents = [];
    win.applicationState.system.inspect((inspection: { type: string; actorRef?: { id: string }; event: { type: string } }) => {
      if (inspection.type === '@xstate.event' && inspection.actorRef?.id === id) win.__addressingEvents.push(inspection.event.type);
    });
  }, pluginId);
  return () => page.evaluate(() => [...(window as any).__addressingEvents] as string[]);
}

test("a plugin setting changed in Settings reaches the feature's system", async ({ appPage }) => {
  const events = await recordEvents(appPage, 'default-setup/code');
  await updateSetting(appPage, { entityType: 'plugin', label: 'code', path: ['mdEditorDefault'], value: true });
  // One copy from the settings system, one the code system forwards once it has applied the change: the
  // second only arrives if the settings system found the code system at its address
  await expect.poll(async () => (await events()).filter((type) => type === 'CODE_SETTINGS_UPDATED').length).toBe(2);
});

// Settings → Secrets shows the code plugin's CLI path overrides, read from the settings by the plugin's name
test('a plugin setting changed in Settings is what its canvas reads', async ({ app, appPage }) => {
  const override = `/e2e/addressing/${Date.now()}/claude`;
  await updateSetting(appPage, { entityType: 'plugin', label: 'code', path: ['cliPaths'], value: { 'claude-code': override } });
  await app.navigate('default-setup/settings');
  await appPage.evaluate(() => {
    const settings = (window as any).applicationState.system.get('default-setup/settings');
    settings.send({ type: 'TAB.SELECT', tab: 'general' });
    settings.send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
  });

  const inputs = appPage.getByPlaceholder('Path override (auto-detected if empty)');
  await expect.poll(() => inputs.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))).toContain(override);
});

test('a link to another plugin opens it and hands it the events', async ({ app, appPage }) => {
  // The Logs toolbar shows the link once a source is excluded; it opens Settings on the Logs plugin
  await updateSetting(appPage, { entityType: 'plugin', label: 'logs', path: ['excludedSources'], value: ['e2e-excluded'] });
  await app.navigate('default-setup/logs');
  await appPage.getByTitle('Click to manage excluded sources').click();

  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot().context.activePlugin.id))
    .toBe('default-setup/settings');
  const settings = () => appPage.evaluate(() => {
    const { activeTab, selectedPluginId } = (window as any).applicationState.system.get('default-setup/settings').getSnapshot().context;
    return { activeTab, selectedPluginId };
  });
  await expect.poll(settings).toEqual({ activeTab: 'plugins', selectedPluginId: 'default-setup/logs' });
});
