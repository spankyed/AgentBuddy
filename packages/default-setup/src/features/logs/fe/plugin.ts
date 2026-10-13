import { definePlugin } from '@apackdev/sdk/fe';
import { Bug } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';

const logsPlugin = definePlugin({
  label: 'Logs',
  // icon: ScrollText,
  icon: Bug,
  state,
  canvas,
  isPinned: true,
});

export default logsPlugin;
