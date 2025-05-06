import type { Plugin } from "@/helpers/types";
import { History } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas/canvas.vue';
import panel from './panel.vue';

const threadsPlugin: Plugin = {
  id,
  label: 'Threads',
  icon: History,
  state,
  canvas,
  panel,
};

export default threadsPlugin;