import type { Plugin } from "@abuddy/sdk/fe";
import { Calendar } from 'lucide-vue-next';
import state, { id } from './state.ts';
import canvas from './canvas.vue';

const calendarPlugin: Plugin = {
  id,
  label: 'Calendar',
  icon: Calendar,
  state,
  canvas,
};

export default calendarPlugin;
