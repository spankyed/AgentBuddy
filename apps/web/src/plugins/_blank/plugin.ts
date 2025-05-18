import type { Plugin } from "@/core/types/index.ts";
import { Box } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';

const blankPlugin: Plugin = {
  id,
  label: 'Blank',
  icon: Box,
  state,
  canvas,
  panel,
  isPinned: true
};

export default blankPlugin;