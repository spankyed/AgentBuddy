import { defineAsyncComponent } from 'vue';
import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import { Network } from 'lucide-vue-next';
import state from './state.ts';
import type { OutgoingActionEvents } from '@/features/actions/be/system';
import settings from './settings.vue';

const canvas = defineAsyncComponent(() => import('./canvas/flow-canvas.vue'));
/** The actions system keeps the flows editor's action list current; the receiver declares what it takes */
export const accepts = pluginAccepts<OutgoingActionEvents>();

const flowsPlugin = definePlugin({
  label: 'Flows',
  icon: Network,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
});

export default flowsPlugin;
