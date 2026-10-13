import { definePlugin } from '@apackdev/sdk/fe';

import { Globe } from 'lucide-vue-next';
import state from './state.ts';
import canvas from './canvas.vue';

const browserPlugin = definePlugin({
  label: 'Browser',

  icon: Globe,
  state,
  canvas,
  isPinned: false,

});

export default browserPlugin;
