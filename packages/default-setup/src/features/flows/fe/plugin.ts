import { defineAsyncComponent } from 'vue';
import type { PluginDefinition } from "@abuddy/sdk/fe";
import { Network } from 'lucide-vue-next';
import state from './state.ts';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas/flow-canvas.vue'));
const flowsPlugin: PluginDefinition = {
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
