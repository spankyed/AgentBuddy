import type { Plugin } from "@/core/types/index.ts";
import { Network } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/flow-canvas.vue';
import settings from './settings.vue';

const flowsPlugin: Plugin = {
  id,
  label: 'Flows',
  icon: Network,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
};

export default flowsPlugin;
