import type { Plugin } from "@/core/types/index.ts";
import { FileText } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';

const logsPlugin: Plugin = {
  id,
  label: 'Logs',
  icon: FileText,
  state,
  canvas,
  isPinned: false,
};

export default logsPlugin; 