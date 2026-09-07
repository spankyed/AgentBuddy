import type { Plugin } from "@abuddy/sdk/fe";
import { Globe } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const browserPlugin: Plugin = {
  id,
  label: 'Browser',
  icon: Globe,
  state,
  canvas,
  settings,
  isPinned: false,
  designations: ['browser'],
};

export default browserPlugin;
