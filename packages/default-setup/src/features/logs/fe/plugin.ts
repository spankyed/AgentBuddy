import { definePlugin } from '@abuddy/sdk/fe';
import { Bug } from 'lucide-vue-next';
import state from './state';
import canvas from './canvas.vue';
import settings from './settings.vue';

const logsPlugin = definePlugin({
  label: 'Logs',
  // icon: ScrollText,
  icon: Bug,
  state,
  canvas,
  settings,
  isPinned: true,
});

export default logsPlugin;
