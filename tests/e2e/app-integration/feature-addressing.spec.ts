// Pack code names a feature (`'code'`, `'default-setup/logs'`) and the app addresses it (`default-setup/code`).
// Each case here is a path where a name had to become an address and, when it didn't, the app went on running
// with the click or the setting silently lost. Nothing below the running app catches that: these are the tests.
import type { Page } from '@playwright/test';
import { test, expect } from '@apackdev/testing';

/** Selects a declared feature form through the host Settings actor. */
async function selectFeature(page: Page, featureId: string): Promise<void> {
  await page.evaluate((id) => {
    const settings = (window as any).applicationState.system.get('host/settings');
    settings.send({ type: 'TAB.SELECT', tab: 'features' });
    settings.send({ type: 'FEATURE.SELECT', featureId: id });
  }, featureId);
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

// The settings system tells the feature's system and plugin; the harness specs see the system half
test("a plugin setting changed in Settings reaches the feature's plugin, once", async ({ app, appPage }) => {
  await app.waitForPlugin('default-setup/code');
  await app.navigate('host/settings');
  await selectFeature(appPage, 'default-setup/code');
  await expect(appPage.locator('#md-editor-default')).toBeChecked();
  const events = await recordEvents(appPage, 'default-setup/code');
  await appPage.locator('#md-editor-default').uncheck();
  await expect.poll(async () => (await events()).filter((type) => type === 'FEATURE_SETTINGS_UPDATED').length).toBe(1);
  await appPage.waitForTimeout(300);
  expect((await events()).filter((type) => type === 'FEATURE_SETTINGS_UPDATED')).toHaveLength(1);
});

// Settings → Secrets shows the code plugin's CLI path overrides, read from the settings by the plugin's name
test('a plugin setting changed in Settings is what its canvas reads', async ({ app, appPage }) => {
  const override = `/e2e/addressing/${Date.now()}/claude`;
  await app.waitForPlugin('default-setup/code');
  await app.navigate('host/settings');
  await appPage.evaluate(() => {
    const settings = (window as any).applicationState.system.get('host/settings');
    settings.send({ type: 'TAB.SELECT', tab: 'general' });
    settings.send({ type: 'GENERAL_NAV.SELECT', item: 'secrets' });
  });

  const inputs = appPage.getByPlaceholder('Path override (auto-detected if empty)');
  const claude = appPage.locator('div').filter({ has: appPage.getByText('Claude Code CLI', { exact: true }) })
    .filter({ has: inputs }).last().getByPlaceholder('Path override (auto-detected if empty)');
  await claude.fill(override);
  // CLI Providers owns its save feedback; observe the accepted value at the receiving feature.
  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.system
    .get('default-setup/code').getSnapshot().context.settings.cliPaths?.['claude-code'])).toBe(override);
  await app.navigate('default-setup/code');
  await app.navigate('host/settings');
  await expect(claude).toHaveValue(override);
});

// default-setup's link-navigation unit spec covers the navigation itself on the harness's shell; this case keeps what
// only the running app shows: the Logs canvas renders the link once a source is excluded, and clicking it navigates
test('a link to another plugin opens it and hands it the events', async ({ app, appPage }) => {
  // The Logs toolbar shows the link once a source is excluded; it opens Settings on the Logs plugin
  await app.waitForPlugin('default-setup/logs');
  await app.navigate('host/settings');
  await selectFeature(appPage, 'default-setup/logs');
  const pattern = appPage.getByPlaceholder('Add pattern, e.g. debug.*');
  await pattern.fill('e2e-excluded');
  await pattern.press('Enter');
  await expect(appPage.getByText('Settings saved', { exact: true })).toBeVisible();
  await app.navigate('default-setup/logs');
  await appPage.getByTitle('Click to manage excluded sources').click();

  await expect.poll(() => appPage.evaluate(() => (window as any).applicationState.getSnapshot().context.activePlugin.id))
    .toBe('host/settings');
  const settings = () => appPage.evaluate(() => {
    const { activeTab, selectedFeatureId } = (window as any).applicationState.system.get('host/settings').getSnapshot().context;
    return { activeTab, selectedFeatureId };
  });
  await expect.poll(settings).toEqual({ activeTab: 'features', selectedFeatureId: 'default-setup/logs' });
});
