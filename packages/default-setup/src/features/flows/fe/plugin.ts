import { defineAsyncComponent } from 'vue';
import type { Plugin } from "@abuddy/sdk/fe";
import { Network } from 'lucide-vue-next';
import state, { id } from './state.ts';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas/flow-canvas.vue'));
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
