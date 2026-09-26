import { definePlugin } from '@abuddy/sdk/fe';
import { Sparkle } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

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