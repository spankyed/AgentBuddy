import type { PluginDefinition } from '@apack/sdk/fe';
import { createSettingsMachine } from '@apack/host/fe';
import { Settings } from 'lucide-vue-next';
import canvas from './canvas/index.vue';

const report = (message: string) => window.alert(message);

/**
 * The Settings plugin: the host's machine over this window's acts. Starting the app over after a reset and telling
 * the user one failed are the window's, so the machine asks for them rather than reaching a browser global.
 */
export const settingsPlugin: PluginDefinition = {
  label: 'Settings',
  icon: Settings,
  state: createSettingsMachine({
    restart: () => {
      const app = window.electronAPI?.apiStatus;
      if (app?.relaunch) void app.relaunch();
      else if (app?.reload) void app.reload();
      // Not `window.location.reload()`, which was here and cannot work: the app blocks renderer-initiated
      // navigation (`BlockNotAllowdOrigins`, packages/main), so that call returns having done nothing and
      // leaves the user looking at the data from before the reset, believing the app restarted.
      else report('Restart apack to finish: this window could not restart itself.');
    },
    report,
  }),
  canvas,
  isPinned: true,
};
