import { definePlugin, pluginAccepts } from '@abuddy/sdk/fe';
import type { PromptsListEvent } from './public';
import { Sparkle } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

/** Paging and editing, which the code plugin's prompts panel asks of it */
export const accepts = pluginAccepts<PromptsListEvent>();

const promptsPlugin = definePlugin({
  label: 'Prompts',
  icon: Sparkle,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
});

export default promptsPlugin; 