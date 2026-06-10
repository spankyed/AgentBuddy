import type { Plugin } from "@/core/types/index.ts";
import { Calendar } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';

const calendarPlugin: Plugin = {
  id,
  label: 'Calendar',
  icon: Calendar,
  state,
  canvas,
  isPinned: true,
};

export default calendarPlugin;
