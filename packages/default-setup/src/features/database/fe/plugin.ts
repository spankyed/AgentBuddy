import { definePlugin } from '@apackdev/sdk/fe';
import { Database } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';

const databasePlugin = definePlugin({
  label: 'Database',
  icon: Database,
  state,
  canvas,
  isPinned: true,
});

export default databasePlugin; 