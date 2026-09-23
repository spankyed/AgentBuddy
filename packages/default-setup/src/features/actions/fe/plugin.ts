import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import type { ActionsListEvent } from './public';
import { Play } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

/** Paging and editing, which the code plugin's actions panel asks of it */
export const accepts = pluginAccepts<ActionsListEvent>();

const actionsPlugin = definePlugin({
  label: 'Actions',
  icon: Play,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
});

export default actionsPlugin; 