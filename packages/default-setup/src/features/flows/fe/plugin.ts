import { defineAsyncComponent } from 'vue';
import { definePlugin } from '@apackdev/sdk/fe';
import { Network } from 'lucide-vue-next';
import state from './state.ts';

const canvas = defineAsyncComponent(() => import('./canvas/flow-canvas.vue'));

const flowsPlugin = definePlugin({
  label: 'Flows',
  icon: Network,
  state,
  canvas,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
});

export default flowsPlugin;
