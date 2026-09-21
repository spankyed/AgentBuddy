import type { PluginDefinition } from "@abuddy/sdk/fe";

import { Globe } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const browserPlugin: PluginDefinition = {
  label: 'Browser',

  icon: Globe,
  state,
  canvas,
  settings,
  isPinned: false,

};

export default browserPlugin;
