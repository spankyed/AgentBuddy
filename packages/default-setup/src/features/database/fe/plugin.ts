import type { Plugin } from "@abuddy/sdk/fe";
import { Database } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const databasePlugin: Plugin = {
  id,
  label: 'Database',
  icon: Database,
  state,
  canvas,
  settings,
  isPinned: true,
};

export default databasePlugin; 