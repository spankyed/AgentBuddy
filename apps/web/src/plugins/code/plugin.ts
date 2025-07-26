import type { Plugin } from "@/core/types/index.ts";
import { Code2 } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/canvas.vue';
import panel from './features/panel.vue';

const codePlugin: Plugin = {
  id,
  label: 'Code',
  icon: Code2,
  state,
  canvas,
  panel,
  isPinned: false
};

export default codePlugin;