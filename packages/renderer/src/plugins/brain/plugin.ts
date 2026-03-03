import type { Plugin } from "@/core/types";
import { Brain } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas.vue';
import settings from './settings.vue';
import panel from './panel.vue';

const brainPlugin: Plugin = {
  id,
  label: 'Brain',
  icon: Brain,
  state,
  canvas,
  settings,
  panel,
  // isPinned: true
};

export default brainPlugin;