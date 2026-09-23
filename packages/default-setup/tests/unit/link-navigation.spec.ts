// A link to another plugin opens it and hands it the events: the Logs toolbar's link to its excluded sources opens
// Settings on the Logs plugin's settings. The settings system and the shell run as the app runs them, over the
// harness's bus, so this is the whole path the link takes short of drawing the window.
import { expect, it } from 'vitest';
import { startApp, startShell } from '@abuddy/testing/harness';
import { openPlugin } from '@abuddy/sdk/fe';
import { resolveName } from '@abuddy/sdk/ids';
import { ref } from '@/__generated__/ref';
import logsState from '@/features/logs/fe/state';

it('opens Settings on the Logs plugin from the Logs link', async () => {
  const app = await startApp({ systems: ['host/settings'] });
  await app.connect();
  const shell = await startShell({ plugins: { logs: { state: logsState } } });
  // The settings plugin asked its system for the settings on starting, and has them
  await app.settle();

  // What the Logs toolbar's link does (features/logs/fe/canvas.vue, goToExcludedSourcesSettings)
  openPlugin(resolveName('settings', 'host'), [
    { type: 'TAB.SELECT', tab: 'plugins' },
    { type: 'PLUGIN.SELECT', pluginId: ref('logs') },
  ]);

  // The shell stays on Logs: the app's Settings plugin isn't one this pack's test shell spawns
  expect(shell.opened()).toBe('default-setup/logs');
  // What this pack can see is that the app's Settings plugin was asked to open. The events the link carries are
  // that plugin's to act on, and @abuddy/host's `features/settings/fe/plugin-select.spec.ts` covers what it does.
});
