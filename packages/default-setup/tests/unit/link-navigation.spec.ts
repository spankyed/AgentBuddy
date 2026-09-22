// A link to another plugin opens it and hands it the events: the Logs toolbar's link to its excluded sources opens
// Settings on the Logs plugin's settings. The settings system and the shell run as the app runs them, over the
// harness's bus, so this is the whole path the link takes short of drawing the window.
import { expect, it } from 'vitest';
import { startApp, startShell } from '@abuddy/testing/harness';
import { navigateToPlugin } from '@/__generated__/fe';
import { ref } from '@/__generated__/ref';
import logsState from '@/features/logs/fe/state';
import settingsState from '@/features/settings/fe/state';

it('opens Settings on the Logs plugin from the Logs link', async () => {
  const app = await startApp({ systems: ['settings'] });
  await app.connect();
  const shell = await startShell({ plugins: { logs: { state: logsState }, settings: { state: settingsState } } });
  // The settings plugin asked its system for the settings on starting, and has them
  await app.settle();
  expect(shell.plugin('settings').getSnapshot().value).toBe('ready');

  // What the Logs toolbar's link does (features/logs/fe/canvas.vue, goToExcludedSourcesSettings)
  navigateToPlugin('settings', [
    { type: 'TAB.SELECT', tab: 'plugins' },
    { type: 'PLUGIN.SELECT', pluginId: ref('logs') },
  ]);

  expect(shell.opened()).toBe('default-setup/settings');
  const { activeTab, selectedPluginId } = shell.plugin('settings').getSnapshot().context;
  expect({ activeTab, selectedPluginId }).toEqual({ activeTab: 'plugins', selectedPluginId: 'default-setup/logs' });
});
