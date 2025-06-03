import type { Plugin } from "@/core/types/index.ts";
import { Workflow } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';
import panel from './panel.vue';

const flowsPlugin: Plugin = {
  id,
  label: 'Dialog Flows',
  icon: Workflow,
  state,
  canvas,
  panel,
};

export default flowsPlugin;