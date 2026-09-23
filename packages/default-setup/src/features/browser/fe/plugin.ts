import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';

import { Globe } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

/** A link the user chose to open in the app rather than the OS browser */
export const accepts = pluginAccepts<{ type: 'TAB.CREATE'; url: string }>();

const browserPlugin = definePlugin({
  label: 'Browser',

  icon: Globe,
  state,
  canvas,
  settings,
  isPinned: false,

});

export default browserPlugin;
