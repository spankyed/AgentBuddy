import type { Plugin } from "@/core/types/index.ts";
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
  isPinned: false,
};

export default logsPlugin;
