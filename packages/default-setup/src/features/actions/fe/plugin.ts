import { definePlugin } from '@apackdev/sdk/fe';
import { Play } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';

const actionsPlugin = definePlugin({
  label: 'Actions',
  icon: Play,
  state,
  canvas,
  isPinned: true,
  options: {
    // headerClass: 'bg-neutral-900 border-b border-neutral-600'
  }
});

export default actionsPlugin; 