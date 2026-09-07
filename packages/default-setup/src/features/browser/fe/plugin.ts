import type { Plugin } from "@abuddy/sdk/fe";
import config from '../feature.config';
import { Globe } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const browserPlugin: Plugin = {
  id,
  label: 'Browser',
  designation: config.designation,
  icon: Globe,
  state,
  canvas,
  settings,
  isPinned: false,

};

export default browserPlugin;
