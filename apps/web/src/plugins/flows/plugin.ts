import type { Plugin } from "@/core/types/index.ts";
import { Network } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/canvas.vue';

const flowsPlugin: Plugin = {
  id,
  label: 'Dialog Flows',
  icon: Network,
  state,
  canvas,
};

export default flowsPlugin;