import type { Plugin } from '@abuddy/sdk/fe/host';
import { Package } from 'lucide-vue-next';
import state, { id } from './state';
import canvas from './canvas/index.vue';

export const packsPlugin: Plugin = {
  id,
  label: 'Packs',
  icon: Package,
  state,
  canvas,
  isPinned: true,
};

export default packsPlugin;
