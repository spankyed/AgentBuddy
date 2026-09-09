import { defineAsyncComponent } from 'vue';
import type { Plugin } from "@abuddy/sdk/fe";
import config from '../feature.config';
import { Brain } from 'lucide-vue-next';
import state, { id } from './state';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas.vue'));
const panel = defineAsyncComponent(() => import('./panel.vue'));

const brainPlugin: Plugin = {
  id,
  label: 'Brain',
  designation: config.designation,
  icon: Brain,
  state,
  canvas,
  settings,
  panel,
  isPinned: true,

};

export default brainPlugin;