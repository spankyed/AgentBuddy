import type { PluginDefinition } from '@abuddy/sdk/fe';
import { createSettingsMachine } from '@abuddy/host/fe';
import { Settings } from 'lucide-vue-next';
import canvas from './canvas/index.vue';

/**
 * The Settings plugin: the host's machine over this window's acts. Starting the app over after a reset and telling
 * the user one failed are the window's, so the machine asks for them rather than reaching a browser global.
 */
export const settingsPlugin: PluginDefinition = {
  label: 'Settings',
  icon: Settings,
  state: createSettingsMachine({
    restart: () => {
      if (window.electronAPI?.apiStatus?.relaunch) window.electronAPI.apiStatus.relaunch();
      else window.location.reload();
    },
    report: (message) => window.alert(message),
  }),
  canvas,
  isPinned: true,
};
