import type { Plugin } from "../../helpers/types/index";
import { Box } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';

const blankPlugin: Plugin = {
  id: 'blank',
  label: 'Blank',
  icon: Box,
  state,
  canvas,
  panel,
  isPinned: true
};

export default blankPlugin;