import type { Plugin } from "@abuddy/sdk/fe";
import config from '../feature.config';
import { Brain } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas.vue';
import settings from './settings.vue';
import panel from './panel.vue';

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