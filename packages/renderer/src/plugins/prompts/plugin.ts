import type { Plugin } from "@/core/types/index.ts";
import { Sparkle } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import settings from './settings.vue';

const promptsPlugin: Plugin = {
  id,
  label: 'Prompts',
  icon: Sparkle,
  state,
  canvas,
  settings,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
};

export default promptsPlugin; 