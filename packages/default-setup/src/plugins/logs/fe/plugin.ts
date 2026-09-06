import type { Plugin } from "@abuddy/sdk/fe";
import { Bug } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const logsPlugin: Plugin = {
  id,
  label: 'Logs',
  // icon: ScrollText,
  icon: Bug,
  state,
  canvas,
  settings,
  isPinned: true,
};

export default logsPlugin;
