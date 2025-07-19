import type { Plugin } from "@/core/types/index.ts";
import { Code2 } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';

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