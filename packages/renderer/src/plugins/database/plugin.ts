import type { Plugin } from "@/core/types/index.ts";
import { Database } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';

const databasePlugin: Plugin = {
  id,
  label: 'Database',
  icon: Database,
  state,
  canvas,
};

export default databasePlugin; 