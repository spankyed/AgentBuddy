import type { Plugin } from "@abuddy/sdk/fe";
import { Play } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const actionsPlugin: Plugin = {
  id,
  label: 'Actions',
  icon: Play,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
};

export default actionsPlugin; 